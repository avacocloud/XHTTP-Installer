import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { setDefaultResultOrder } from "node:dns";
import { extname, resolve, sep } from "node:path";
import { Readable, Transform, PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";

const PORT = parsePositiveInt(process.env.PORT, 8080, 1);
const PUBLIC_DIR = resolve("public");
const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");
const UPSTREAM_DNS_ORDER = (process.env.UPSTREAM_DNS_ORDER || "ipv4first").trim().toLowerCase();
const RELAY_PATH = normalizeRelayPath(process.env.RELAY_PATH || "");
const PUBLIC_RELAY_PATH = normalizeRelayPath(process.env.PUBLIC_RELAY_PATH || "/api");
const RELAY_KEY = (process.env.RELAY_KEY || "").trim();
const UPSTREAM_TIMEOUT_MS = parseNonNegativeInt(process.env.UPSTREAM_TIMEOUT_MS, 0);
const MAX_INFLIGHT = parsePositiveInt(process.env.MAX_INFLIGHT, 128, 1);
const MAX_UP_BPS = parseNonNegativeInt(process.env.MAX_UP_BPS, 2621440);
const MAX_DOWN_BPS = parseNonNegativeInt(process.env.MAX_DOWN_BPS, 2621440);
const SUCCESS_LOG_SAMPLE_RATE = clampNumber(parseFloat(process.env.SUCCESS_LOG_SAMPLE_RATE || "0"), 0, 1);
const SUCCESS_LOG_MIN_DURATION_MS = parseNonNegativeInt(process.env.SUCCESS_LOG_MIN_DURATION_MS, 3000);
const ERROR_LOG_MIN_INTERVAL_MS = parseNonNegativeInt(process.env.ERROR_LOG_MIN_INTERVAL_MS, 5000);
const GLOBAL_UPLOAD_LIMITER = createGlobalLimiter(MAX_UP_BPS);
const GLOBAL_DOWNLOAD_LIMITER = createGlobalLimiter(MAX_DOWN_BPS);

applyDnsPreference();

const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST"]);
const FORWARD_HEADER_EXACT = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "cache-control",
  "content-length",
  "content-type",
  "pragma",
  "range",
  "referer",
  "user-agent",
]);
const FORWARD_HEADER_PREFIXES = ["sec-ch-", "sec-fetch-"];
const STRIP_HEADERS = new Set([
  "host",
  "connection",
  "proxy-connection",
  "keep-alive",
  "via",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "x-forwarded-for",
  "x-real-ip",
  "x-original-url",
]);

let inFlight = 0;
const logState = {
  timeout: { lastAt: 0, suppressed: 0 },
  error: { lastAt: 0, suppressed: 0 },
};

const server = createServer(async (req, res) => {
  if (req.url === "/health") {
    return textNodeResponse(res, 200, "Azure XHTTP Relay is Alive!");
  }

  const host = req.headers.host || `localhost:${PORT}`;
  const url = new URL(req.url || "/", `http://${host}`);
  const normalizedPath = normalizeIncomingPath(url.pathname);

  if (!isAllowedRelayPath(normalizedPath, PUBLIC_RELAY_PATH)) {
    const served = await tryServeStatic(req, res, normalizedPath);
    if (served) return;
    return textNodeResponse(res, 404, "Not Found");
  }

  await handleRelay(req, res, url, normalizedPath);
});

server.on("clientError", (_err, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Azure XHTTP Relay running on port ${PORT}`);
  console.log(`Public relay path: ${PUBLIC_RELAY_PATH || "(missing)"}`);
  console.log(`Upstream relay path: ${RELAY_PATH || "(missing)"}`);
  console.log(`Target: ${TARGET_BASE || "(missing TARGET_DOMAIN)"}`);
});

async function handleRelay(req, res, url, normalizedPath) {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  let slotAcquired = false;
  let hitUpstreamTimeout = false;
  let upstreamPath = "";
  let targetUrl = "";

  if (!TARGET_BASE) return textNodeResponse(res, 500, "Misconfigured: TARGET_DOMAIN is not set");
  if (!RELAY_PATH) return textNodeResponse(res, 500, "Misconfigured: RELAY_PATH is not set");
  if (RELAY_PATH === "/") return textNodeResponse(res, 500, "Misconfigured: RELAY_PATH cannot be '/'");
  if (!PUBLIC_RELAY_PATH) return textNodeResponse(res, 500, "Misconfigured: PUBLIC_RELAY_PATH is not set");
  if (PUBLIC_RELAY_PATH === "/") return textNodeResponse(res, 500, "Misconfigured: PUBLIC_RELAY_PATH cannot be '/'");
  if (RELAY_KEY && RELAY_KEY.length < 16) return textNodeResponse(res, 500, "Misconfigured: RELAY_KEY is too short");

  try {
    if (!ALLOWED_METHODS.has(req.method)) {
      res.writeHead(405, { allow: "GET, HEAD, POST", "content-type": "text/plain; charset=utf-8" });
      return res.end("Method Not Allowed");
    }
    if (RELAY_KEY && String(req.headers["x-relay-key"] || "") !== RELAY_KEY) {
      return textNodeResponse(res, 403, "Forbidden");
    }
    if (!tryAcquireSlot()) {
      res.writeHead(503, { "retry-after": "1", "content-type": "text/plain; charset=utf-8" });
      return res.end("Server Busy: Too Many Inflight Requests");
    }
    slotAcquired = true;

    upstreamPath = mapPublicPathToRelayPath(normalizedPath, PUBLIC_RELAY_PATH, RELAY_PATH);
    targetUrl = `${TARGET_BASE}${upstreamPath}${url.search || ""}`;
    const abortCtrl = new AbortController();
    const timeoutRef = UPSTREAM_TIMEOUT_MS > 0
      ? setTimeout(() => {
          hitUpstreamTimeout = true;
          try {
            abortCtrl.abort();
          } catch {}
        }, UPSTREAM_TIMEOUT_MS)
      : null;

    try {
      const fetchOpts = {
        method: req.method,
        headers: buildForwardHeaders(req),
        redirect: "manual",
        signal: abortCtrl.signal,
      };

      if (req.method !== "GET" && req.method !== "HEAD") {
        const uploadNodeStream = GLOBAL_UPLOAD_LIMITER
          ? req.pipe(createThrottleTransform(GLOBAL_UPLOAD_LIMITER))
          : req;
        fetchOpts.body = Readable.toWeb(uploadNodeStream);
        fetchOpts.duplex = "half";
      }

      const upstream = await fetch(targetUrl, fetchOpts);
      const responseHeaders = buildResponseHeaders(upstream.headers);
      res.writeHead(upstream.status, upstream.statusText, Object.fromEntries(responseHeaders));

      if (!upstream.body || req.method === "HEAD") {
        res.end();
      } else {
        const upstreamNode = Readable.fromWeb(upstream.body);
        const downloadStream = GLOBAL_DOWNLOAD_LIMITER
          ? upstreamNode.pipe(createThrottleTransform(GLOBAL_DOWNLOAD_LIMITER))
          : upstreamNode;
        await pipeline(downloadStream, res);
      }

      const durationMs = Date.now() - startedAt;
      maybeLogSuccess({
        requestId,
        path: normalizedPath,
        upstreamPath,
        method: req.method,
        status: upstream.status,
        durationMs,
      });
    } finally {
      if (timeoutRef) clearTimeout(timeoutRef);
    }
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    if (hitUpstreamTimeout || isUpstreamTimeoutError(err)) {
      emitRateLimitedError("timeout", "relay timeout", {
        requestId,
        method: req.method,
        durationMs,
        timeoutMs: UPSTREAM_TIMEOUT_MS,
      });
      if (!res.headersSent) return textNodeResponse(res, 504, "Gateway Timeout: Upstream Timeout");
      return;
    }

    emitRateLimitedError("error", "relay error", {
      requestId,
      method: req.method,
      durationMs,
      path: normalizedPath,
      upstreamPath,
      ...describeRelayError(err, targetUrl),
    });
    if (!res.headersSent) return textNodeResponse(res, 502, "Bad Gateway: Tunnel Failed");
  } finally {
    if (slotAcquired) releaseSlot();
  }
}

function buildForwardHeaders(req) {
  const headers = {};
  const clientIp = toHeaderValue(req.headers["x-real-ip"] || req.headers["x-forwarded-for"]);
  for (const key of Object.keys(req.headers)) {
    const lower = key.toLowerCase();
    const value = req.headers[key];
    if (STRIP_HEADERS.has(lower)) continue;
    if (lower.startsWith("x-ms-") || lower.startsWith("x-arr-")) continue;
    if (lower === "x-relay-key") continue;
    if (!shouldForwardHeader(lower)) continue;
    const normalizedValue = toHeaderValue(value);
    if (normalizedValue) headers[lower] = normalizedValue;
  }
  if (clientIp) headers["x-forwarded-for"] = clientIp;
  return headers;
}

function buildResponseHeaders(inputHeaders) {
  const headers = new Headers();
  for (const [key, value] of inputHeaders) {
    const lower = key.toLowerCase();
    if (lower === "transfer-encoding" || lower === "connection") continue;
    headers.set(key, value);
  }
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("cdn-cache-control", "no-store");
  return headers;
}

async function tryServeStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  const staticPath = await resolveStaticPath(pathname);
  if (!staticPath) return false;

  const fileStat = await stat(staticPath);
  const headers = {
    "content-type": contentType(staticPath),
    "content-length": String(fileStat.size),
    "cache-control": "public, max-age=300",
  };
  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
  await pipeline(createReadStream(staticPath), res);
  return true;
}

async function resolveStaticPath(pathname) {
  const decoded = safeDecodePath(pathname === "/" ? "/index.html" : pathname);
  if (!decoded) return "";

  const candidate = resolve(PUBLIC_DIR, `.${decoded}`);
  if (!isInside(PUBLIC_DIR, candidate)) return "";

  const file = await fileIfExists(candidate);
  if (file) return file;

  const index = resolve(candidate, "index.html");
  if (!isInside(PUBLIC_DIR, index)) return "";
  return fileIfExists(index);
}

async function fileIfExists(pathname) {
  try {
    const s = await stat(pathname);
    return s.isFile() ? pathname : "";
  } catch {
    return "";
  }
}

function isInside(root, child) {
  const normalizedRoot = root.endsWith(sep) ? root : `${root}${sep}`;
  return child === root || child.startsWith(normalizedRoot);
}

function safeDecodePath(pathname) {
  try {
    return decodeURIComponent(String(pathname || "/"));
  } catch {
    return "";
  }
}

function contentType(pathname) {
  switch (extname(pathname).toLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    case ".avif": return "image/avif";
    case ".ico": return "image/x-icon";
    default: return "application/octet-stream";
  }
}

function textNodeResponse(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  });
  res.end(body);
}

function shouldForwardHeader(headerName) {
  if (FORWARD_HEADER_EXACT.has(headerName)) return true;
  return FORWARD_HEADER_PREFIXES.some((prefix) => headerName.startsWith(prefix));
}

function maybeLogSuccess(payload) {
  if (payload.status >= 400) {
    console.warn("relay non-2xx", payload);
    return;
  }
  if (payload.durationMs >= SUCCESS_LOG_MIN_DURATION_MS) {
    console.info("relay slow", payload);
    return;
  }
  if (SUCCESS_LOG_SAMPLE_RATE > 0 && Math.random() < SUCCESS_LOG_SAMPLE_RATE) {
    console.info("relay sample", payload);
  }
}

function emitRateLimitedError(kind, label, payload) {
  const state = logState[kind] || logState.error;
  const now = Date.now();
  if (ERROR_LOG_MIN_INTERVAL_MS <= 0) {
    console.error(label, payload);
    return;
  }
  if (now - state.lastAt < ERROR_LOG_MIN_INTERVAL_MS) {
    state.suppressed += 1;
    return;
  }
  const out = { ...payload };
  if (state.suppressed > 0) out.suppressed = state.suppressed;
  state.suppressed = 0;
  state.lastAt = now;
  console.error(label, out);
}

function applyDnsPreference() {
  if (UPSTREAM_DNS_ORDER !== "ipv4first" && UPSTREAM_DNS_ORDER !== "verbatim") return;
  try {
    setDefaultResultOrder(UPSTREAM_DNS_ORDER);
  } catch {}
}

function isUpstreamTimeoutError(err) {
  if (!err) return false;
  if (err?.name === "AbortError") return true;
  if (err?.code === "ABORT_ERR") return true;
  if (err?.message === "upstream_timeout") return true;
  if (err?.cause?.message === "upstream_timeout") return true;
  return typeof err === "string" && err === "upstream_timeout";
}

function describeRelayError(err, targetUrl) {
  const cause = err?.cause || {};
  const code = String(cause.code || err?.code || "");
  const causeMessage = String(cause.message || "");
  const message = String(err?.message || err || "");
  const out = {
    error: err?.name ? `${err.name}: ${message}` : message,
    upstreamOrigin: getUrlOrigin(targetUrl),
  };
  if (code) out.causeCode = code;
  if (causeMessage && causeMessage !== message) out.causeMessage = causeMessage;

  const combined = `${code} ${causeMessage} ${message}`.toLowerCase();
  if (combined.includes("enotfound") || combined.includes("eai_again")) {
    out.hint = "Upstream DNS failed from Azure. Check TARGET_DOMAIN host and DNS records.";
  } else if (combined.includes("econnrefused")) {
    out.hint = "Upstream refused the TCP connection. Check inbound port/firewall.";
  } else if (combined.includes("timeout") || combined.includes("und_err_connect_timeout")) {
    out.hint = "Azure could not connect to upstream before timeout. Check port reachability and upstream firewall.";
  } else if (combined.includes("certificate") || combined.includes("cert_") || combined.includes("tls") || combined.includes("ssl")) {
    out.hint = "TLS/SSL failed. Check TARGET_DOMAIN uses the correct https host and certificate/SNI.";
  } else if (combined.includes("econnreset")) {
    out.hint = "Upstream reset the connection. Check inbound service, CDN/proxy rules, and TLS settings.";
  } else if (message === "fetch failed") {
    out.hint = "Azure could not reach the upstream. Check TARGET_DOMAIN protocol, port, DNS, firewall, and TLS.";
  }
  return out;
}

function getUrlOrigin(rawUrl) {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return "";
  }
}

function isAllowedRelayPath(pathname, publicPath) {
  return pathname === publicPath || pathname.startsWith(`${publicPath}/`);
}

function mapPublicPathToRelayPath(pathname, publicPath, relayPath) {
  if (pathname === publicPath) return relayPath;
  return `${relayPath}${pathname.slice(publicPath.length)}`;
}

function normalizeRelayPath(rawPath) {
  if (!rawPath) return "";
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function normalizeIncomingPath(pathname) {
  if (!pathname) return "/";
  let normalized = String(pathname).replace(/\/{2,}/g, "/");
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  return normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function parsePositiveInt(rawValue, fallbackValue, minValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < minValue) return fallbackValue;
  return Math.trunc(value);
}

function parseNonNegativeInt(rawValue, fallbackValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0) return fallbackValue;
  return Math.trunc(value);
}

function clampNumber(value, minValue, maxValue) {
  if (!Number.isFinite(value)) return minValue;
  return Math.min(maxValue, Math.max(minValue, value));
}

function toHeaderValue(value) {
  if (!value) return "";
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function tryAcquireSlot() {
  if (inFlight >= MAX_INFLIGHT) return false;
  inFlight += 1;
  return true;
}

function releaseSlot() {
  inFlight = Math.max(0, inFlight - 1);
}

function createGlobalLimiter(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return null;

  const burstCap = Math.max(bytesPerSecond, 262144);
  let tokens = burstCap;
  let lastRefill = Date.now();
  const queue = [];
  let timer = null;

  function refill() {
    const now = Date.now();
    const elapsedMs = now - lastRefill;
    if (elapsedMs <= 0) return;
    tokens = Math.min(burstCap, tokens + (elapsedMs * bytesPerSecond) / 1000);
    lastRefill = now;
  }

  function tryDrain() {
    refill();
    while (queue.length > 0 && tokens >= 1) {
      const item = queue[0];
      const grant = Math.min(item.maxBytes, Math.max(1, Math.floor(tokens)));
      if (grant < 1) break;
      tokens -= grant;
      queue.shift();
      item.resolve(grant);
    }
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      tryDrain();
      if (queue.length > 0) schedule();
    }, 5);
  }

  return {
    acquire(maxBytes) {
      const requested = Math.max(1, Math.trunc(maxBytes || 1));
      return new Promise((resolveAcquire) => {
        queue.push({ maxBytes: requested, resolve: resolveAcquire });
        tryDrain();
        if (queue.length > 0) schedule();
      });
    },
  };
}

function createThrottleTransform(limiter) {
  if (!limiter) return new PassThrough();

  return new Transform({
    transform(chunk, _encoding, callback) {
      if (!chunk || chunk.length === 0) {
        callback();
        return;
      }

      (async () => {
        let offset = 0;
        while (offset < chunk.length) {
          const maxBytes = chunk.length - offset;
          const grant = await limiter.acquire(maxBytes);
          const piece = chunk.subarray(offset, offset + grant);
          offset += grant;
          this.push(piece);
        }
      })()
        .then(() => callback())
        .catch((err) => callback(err));
    },
  });
}

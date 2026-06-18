import http from "node:http";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const TARGET_BASE        = (process.env.TARGET_DOMAIN      || "").replace(/\/$/, "");
const PUBLIC_RELAY_PATH  = normalizeRelayPath(process.env.PUBLIC_RELAY_PATH || "/api");
const RELAY_PATH         = normalizeRelayPath(process.env.RELAY_PATH        || "/api");
const RELAY_KEY          = (process.env.RELAY_KEY          || "").trim();
const UPSTREAM_TIMEOUT_MS = parsePositiveInt(process.env.UPSTREAM_TIMEOUT_MS, 0, 1000);
const MAX_INFLIGHT       = parsePositiveInt(process.env.MAX_INFLIGHT, 512, 1);
const PORT               = parseInt(process.env.PORT || "8080", 10);

const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST"]);

const FORWARD_HEADER_EXACT = new Set([
  "accept", "accept-encoding", "accept-language", "cache-control",
  "content-length", "content-type", "pragma", "range", "referer", "user-agent",
]);

const FORWARD_HEADER_PREFIXES = ["sec-ch-", "sec-fetch-"];

const STRIP_HEADERS = new Set([
  "host", "connection", "proxy-connection", "keep-alive", "via",
  "proxy-authenticate", "proxy-authorization", "te", "trailer",
  "transfer-encoding", "upgrade", "forwarded", "x-forwarded-host",
  "x-forwarded-proto", "x-forwarded-port", "x-forwarded-for", "x-real-ip",
]);

let inFlight = 0;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  // ── Debug endpoint ──────────────────────────────────────────────────────────
  if (url.pathname === "/__debug") {
    const body = JSON.stringify({
      TARGET_BASE,
      PUBLIC_RELAY_PATH,
      RELAY_PATH,
      RELAY_KEY_SET:        !!RELAY_KEY,
      UPSTREAM_TIMEOUT_MS,
      MAX_INFLIGHT,
      inFlight,
    }, null, 2);
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(body);
  }

  // ── Config checks ───────────────────────────────────────────────────────────
  if (!TARGET_BASE)           return end(res, 500, "Misconfigured: TARGET_DOMAIN is not set");
  if (!RELAY_PATH)            return end(res, 500, "Misconfigured: RELAY_PATH is not set");
  if (RELAY_PATH === "/")     return end(res, 500, "Misconfigured: RELAY_PATH cannot be '/'");
  if (!PUBLIC_RELAY_PATH)     return end(res, 500, "Misconfigured: PUBLIC_RELAY_PATH is not set");
  if (PUBLIC_RELAY_PATH==="/")return end(res, 500, "Misconfigured: PUBLIC_RELAY_PATH cannot be '/'");
  if (RELAY_KEY && RELAY_KEY.length < 16) return end(res, 500, "Misconfigured: RELAY_KEY is too short");

  // ── Routing ─────────────────────────────────────────────────────────────────
  const normalizedPath = normalizeIncomingPath(url.pathname);
  if (!isAllowedRelayPath(normalizedPath, PUBLIC_RELAY_PATH))
    return end(res, 404, "Not Found");

  if (!ALLOWED_METHODS.has(req.method))
    return end(res, 405, "Method Not Allowed", { allow: "GET, HEAD, POST" });

  // ── Auth ────────────────────────────────────────────────────────────────────
  if (RELAY_KEY) {
    const token = (req.headers["x-relay-key"] || "").toString();
    if (token !== RELAY_KEY) return end(res, 403, "Forbidden");
  }

  // ── Inflight limit ──────────────────────────────────────────────────────────
  if (inFlight >= MAX_INFLIGHT) {
    res.setHeader("retry-after", "1");
    return end(res, 503, "Server Busy: Too Many Inflight Requests");
  }
  inFlight++;

  try {
    const upstreamPath = mapPublicPathToRelayPath(normalizedPath, PUBLIC_RELAY_PATH, RELAY_PATH);
    const targetUrl    = `${TARGET_BASE}${upstreamPath}${url.search || ""}`;

    // ── Forward headers ───────────────────────────────────────────────────────
    const forwardHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      if (STRIP_HEADERS.has(lower))   continue;
      if (lower === "x-relay-key")    continue;
      if (!shouldForwardHeader(lower)) continue;
      forwardHeaders[lower] = value;
    }
    const clientIp = req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || "";
    if (clientIp) forwardHeaders["x-forwarded-for"] = clientIp;

    // ── Fetch upstream ────────────────────────────────────────────────────────
    const hasBody  = req.method !== "GET" && req.method !== "HEAD";
    const abortCtrl = new AbortController();
    let timeoutRef = null;
    if (UPSTREAM_TIMEOUT_MS > 0) {
      timeoutRef = setTimeout(() => abortCtrl.abort(), UPSTREAM_TIMEOUT_MS);
    }

    try {
      const fetchOpts = {
        method:   req.method,
        headers:  forwardHeaders,
        redirect: "manual",
        signal:   abortCtrl.signal,
      };
      if (hasBody) {
        fetchOpts.body   = Readable.toWeb(req);
        fetchOpts.duplex = "half";
      }

      const upstream = await fetch(targetUrl, fetchOpts);

      res.statusCode = upstream.status;
      for (const [key, value] of upstream.headers.entries()) {
        const lower = key.toLowerCase();
        if (lower === "transfer-encoding" || lower === "connection") continue;
        try { res.setHeader(key, value); } catch {}
      }

      if (!upstream.body) {
        res.end();
      } else {
        await pipeline(Readable.fromWeb(upstream.body), res);
      }
    } finally {
      if (timeoutRef) clearTimeout(timeoutRef);
    }

  } catch (err) {
    if (err?.name === "AbortError") {
      if (!res.headersSent) end(res, 504, "Gateway Timeout: Upstream Timeout");
    } else {
      if (!res.headersSent) end(res, 502, "Bad Gateway: " + String(err));
    }
  } finally {
    inFlight = Math.max(0, inFlight - 1);
  }
});

server.listen(PORT, () => {
  console.log(`XHTTP Relay listening on port ${PORT}`);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function end(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function shouldForwardHeader(name) {
  if (FORWARD_HEADER_EXACT.has(name)) return true;
  for (const prefix of FORWARD_HEADER_PREFIXES)
    if (name.startsWith(prefix)) return true;
  return false;
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
  const p = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

function normalizeIncomingPath(pathname) {
  if (!pathname) return "/";
  let p = String(pathname).replace(/\/{2,}/g, "/");
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

function parsePositiveInt(raw, fallback, min) {
  const v = Number(raw);
  if (!Number.isFinite(v) || v < min) return fallback;
  return Math.trunc(v);
}

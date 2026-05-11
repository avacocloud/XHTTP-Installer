// =============================================================
//  XHTTP Installer — Vercel Relay
//  Copyright (C) 2025 avaco_cloud
//  Repository: https://github.com/avacocloud/XHTTP-Installer
//  Licensed under the GNU General Public License v3.0 (GPL-3.0).
//  See LICENSE file for full terms.
// =============================================================
// build:avc-7f3a92e1-2025 · origin:avacocloud/XHTTP-Installer
import { PassThrough, Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setDefaultResultOrder } from "node:dns";

const __AVC_BUILD_ID__ = "avc-7f3a92e1-2025-avacocloud"; // do not remove
void __AVC_BUILD_ID__;

export const config = {
  api: { bodyParser: false },
  supportsResponseStreaming: true,
  maxDuration: 60,
};

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");
const UPSTREAM_DNS_ORDER = (process.env.UPSTREAM_DNS_ORDER || "ipv4first").trim().toLowerCase();
const PLATFORM_HEADER_PREFIX = `x-${String.fromCharCode(118, 101, 114, 99, 101, 108)}-`;
const RELAY_PATH = normalizeRelayPath(process.env.RELAY_PATH || "");
const PUBLIC_RELAY_PATH = normalizeRelayPath(process.env.PUBLIC_RELAY_PATH || "/api");
const RELAY_KEY = (process.env.RELAY_KEY || "").trim();
const UPSTREAM_TIMEOUT_MS = parsePositiveInt(process.env.UPSTREAM_TIMEOUT_MS, 25000, 1000);
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
]);

let inFlight = 0;
const logState = {
  timeout: { lastAt: 0, suppressed: 0 },
  error: { lastAt: 0, suppressed: 0 },
};

export default async function handler(req, res) {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  let slotAcquired = false;

  if (!TARGET_BASE) {
    res.statusCode = 500;
    return res.end("Misconfigured: TARGET_DOMAIN is not set");
  }
  if (!RELAY_PATH) {
    res.statusCode = 500;
    return res.end("Misconfigured: RELAY_PATH is not set");
  }
  if (RELAY_PATH === "/") {
    res.statusCode = 500;
    return res.end("Misconfigured: RELAY_PATH cannot be '/'");
  }
  if (!PUBLIC_RELAY_PATH) {
    res.statusCode = 500;
    return res.end("Misconfigured: PUBLIC_RELAY_PATH is not set");
  }
  if (PUBLIC_RELAY_PATH === "/") {
    res.statusCode = 500;
    return res.end("Misconfigured: PUBLIC_RELAY_PATH cannot be '/'");
  }
  if (RELAY_KEY && RELAY_KEY.length < 16) {
    res.statusCode = 500;
    return res.end("Misconfigured: RELAY_KEY is too short");
  }

  try {
    const host = req.headers.host || "localhost";
    const url = new URL(req.url || "/", `https://${host}`);

    const normalizedPath = normalizeIncomingPath(url.pathname);

    if (!isAllowedRelayPath(normalizedPath, PUBLIC_RELAY_PATH)) {
      res.statusCode = 404;
      return res.end("Not Found");
    }
    const upstreamPath = mapPublicPathToRelayPath(normalizedPath, PUBLIC_RELAY_PATH, RELAY_PATH);

    if (!ALLOWED_METHODS.has(req.method)) {
      res.statusCode = 405;
      res.setHeader("allow", "GET, HEAD, POST");
      return res.end("Method Not Allowed");
    }

    if (RELAY_KEY) {
      const token = (req.headers["x-relay-key"] || "").toString();
      if (token !== RELAY_KEY) {
        res.statusCode = 403;
        return res.end("Forbidden");
      }
    }
    if (!tryAcquireSlot()) {
      res.statusCode = 503;
      res.setHeader("retry-after", "1");
      return res.end("Server Busy: Too Many Inflight Requests");
    }
    slotAcquired = true;

    const targetUrl = `${TARGET_BASE}${upstreamPath}${url.search || ""}`;

    const headers = {};
    const clientIp = toHeaderValue(req.headers["x-real-ip"] || req.headers["x-forwarded-for"]);
    for (const key of Object.keys(req.headers)) {
      const lower = key.toLowerCase();
      const value = req.headers[key];
      if (STRIP_HEADERS.has(lower)) continue;
      if (lower.startsWith(PLATFORM_HEADER_PREFIX)) continue;
      if (lower === "x-relay-key") continue;
      if (!shouldForwardHeader(lower)) continue;
      const normalizedValue = toHeaderValue(value);
      if (normalizedValue) headers[lower] = normalizedValue;
    }
    if (clientIp) headers["x-forwarded-for"] = clientIp;

    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const abortCtrl = new AbortController();
    const timeoutRef = setTimeout(() => abortCtrl.abort(new Error("upstream_timeout")), UPSTREAM_TIMEOUT_MS);
    let requestErrorHandler = null;
    let uploadErrorHandler = null;
    let uploadNodeStream = null;

    try {
      const fetchOpts = {
        method: req.method,
        headers,
        redirect: "manual",
        signal: abortCtrl.signal,
      };

      if (hasBody) {
        uploadNodeStream = GLOBAL_UPLOAD_LIMITER
          ? req.pipe(createThrottleTransform(GLOBAL_UPLOAD_LIMITER))
          : req;

        requestErrorHandler = (streamErr) => {
          if (isUpstreamTimeoutError(streamErr)) return;
          emitRateLimitedError("error", "relay upload request stream error", {
            requestId,
            method: req.method,
            error: String(streamErr),
          });
        };
        req.on("error", requestErrorHandler);

        uploadErrorHandler = (streamErr) => {
          if (isUpstreamTimeoutError(streamErr)) return;
          emitRateLimitedError("error", "relay upload stream error", {
            requestId,
            method: req.method,
            error: String(streamErr),
          });
        };
        if (uploadNodeStream && uploadNodeStream !== req) {
          uploadNodeStream.on("error", uploadErrorHandler);
        }

        fetchOpts.body = Readable.toWeb(uploadNodeStream);
        fetchOpts.duplex = "half";
      }

      const upstream = await fetch(targetUrl, fetchOpts);

      res.statusCode = upstream.status;
      for (const [headerName, headerValue] of upstream.headers) {
        const k = headerName.toLowerCase();
        if (k === "transfer-encoding" || k === "connection") continue;
        try {
          res.setHeader(headerName, headerValue);
        } catch {}
      }

      if (!upstream.body) {
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
        rawPath: url.pathname,
        method: req.method,
        status: upstream.status,
        durationMs,
      });
    } finally {
      clearTimeout(timeoutRef);
      if (requestErrorHandler) req.off("error", requestErrorHandler);
      if (uploadNodeStream && uploadNodeStream !== req && uploadErrorHandler) {
        uploadNodeStream.off("error", uploadErrorHandler);
      }
    }
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    if (isUpstreamTimeoutError(err)) {
      emitRateLimitedError("timeout", "relay timeout", {
        requestId,
        method: req.method,
        durationMs,
        timeoutMs: UPSTREAM_TIMEOUT_MS,
      });
      if (!res.headersSent) {
        res.statusCode = 504;
        return res.end("Gateway Timeout: Upstream Timeout");
      }
      return;
    }

    emitRateLimitedError("error", "relay error", {
      requestId,
      method: req.method,
      durationMs,
      error: String(err),
    });
    if (!res.headersSent) {
      res.statusCode = 502;
      return res.end("Bad Gateway: Tunnel Failed");
    }
  } finally {
    if (slotAcquired) releaseSlot();
  }
}

function shouldForwardHeader(headerName) {
  if (FORWARD_HEADER_EXACT.has(headerName)) return true;
  for (const prefix of FORWARD_HEADER_PREFIXES) {
    if (headerName.startsWith(prefix)) return true;
  }
  return false;
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
  if (state.suppressed > 0) {
    out.suppressed = state.suppressed;
  }
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
  if (err?.message === "upstream_timeout") return true;
  if (err?.cause?.message === "upstream_timeout") return true;
  if (typeof err === "string" && err === "upstream_timeout") return true;
  return false;
}

function isAllowedRelayPath(pathname, publicPath) {
  return pathname === publicPath || pathname.startsWith(`${publicPath}/`);
}

function mapPublicPathToRelayPath(pathname, publicPath, relayPath) {
  if (pathname === publicPath) return relayPath;
  const suffix = pathname.slice(publicPath.length);
  return `${relayPath}${suffix}`;
}

function normalizeRelayPath(rawPath) {
  if (!rawPath) return "";
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

function normalizeIncomingPath(pathname) {
  if (!pathname) return "/";
  let normalized = String(pathname).replace(/\/{2,}/g, "/");
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  if (normalized.length > 1 && normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  return normalized;
}

function parsePositiveInt(rawValue, fallbackValue, minValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return fallbackValue;
  if (value < minValue) return fallbackValue;
  return Math.trunc(value);
}

function parseNonNegativeInt(rawValue, fallbackValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return fallbackValue;
  if (value < 0) return fallbackValue;
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
    const refillAmount = (elapsedMs * bytesPerSecond) / 1000;
    tokens = Math.min(burstCap, tokens + refillAmount);
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
      return new Promise((resolve) => {
        queue.push({ maxBytes: requested, resolve });
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


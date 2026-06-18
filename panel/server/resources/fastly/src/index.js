/// <reference types="@fastly/js-compute" />
import { env } from "fastly:env";

const TARGET_BASE = (env("TARGET_DOMAIN") || "").replace(/\/$/, "");
const PUBLIC_RELAY_PATH = normalizeRelayPath(env("PUBLIC_RELAY_PATH") || "/api");
const RELAY_PATH = normalizeRelayPath(env("RELAY_PATH") || "/api");
const RELAY_KEY = (env("RELAY_KEY") || "").trim();

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

addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));

async function handleRequest(event) {
  try {
    const req = event.request;
    const url = new URL(req.url);

    // Debug endpoint - before any checks
    if (url.pathname === "/__debug") {
      return new Response(JSON.stringify({
        TARGET_BASE,
        PUBLIC_RELAY_PATH,
        RELAY_PATH,
        RELAY_KEY_SET: !!RELAY_KEY,
      }, null, 2), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (!TARGET_BASE) return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
    if (!RELAY_PATH) return new Response("Misconfigured: RELAY_PATH is not set", { status: 500 });
    if (RELAY_PATH === "/") return new Response("Misconfigured: RELAY_PATH cannot be '/'", { status: 500 });
    if (!PUBLIC_RELAY_PATH) return new Response("Misconfigured: PUBLIC_RELAY_PATH is not set", { status: 500 });
    if (PUBLIC_RELAY_PATH === "/") return new Response("Misconfigured: PUBLIC_RELAY_PATH cannot be '/'", { status: 500 });
    if (RELAY_KEY && RELAY_KEY.length < 16) return new Response("Misconfigured: RELAY_KEY is too short", { status: 500 });

    const normalizedPath = normalizeIncomingPath(url.pathname);

    if (!isAllowedRelayPath(normalizedPath, PUBLIC_RELAY_PATH)) {
      return new Response("Not Found", { status: 404 });
    }

    if (!ALLOWED_METHODS.has(req.method)) {
      return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD, POST" } });
    }

    if (RELAY_KEY) {
      const token = (req.headers.get("x-relay-key") || "");
      if (token !== RELAY_KEY) return new Response("Forbidden", { status: 403 });
    }

    const upstreamPath = mapPublicPathToRelayPath(normalizedPath, PUBLIC_RELAY_PATH, RELAY_PATH);
    const targetUrl = `${TARGET_BASE}${upstreamPath}${url.search || ""}`;

    const forwardHeaders = new Headers();
    for (const [key, value] of req.headers.entries()) {
      const lower = key.toLowerCase();
      if (STRIP_HEADERS.has(lower)) continue;
      if (lower === "x-relay-key") continue;
      if (!shouldForwardHeader(lower)) continue;
      if (value) forwardHeaders.set(key, value);
    }

    const clientIp = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "";
    if (clientIp) forwardHeaders.set("x-forwarded-for", clientIp);

    try {
      const fetchOpts = {
        method: req.method,
        headers: forwardHeaders,
        redirect: "manual",
      };

      if (req.method !== "GET" && req.method !== "HEAD") {
        fetchOpts.body = req.body;
      }

      const upstream = await fetch(targetUrl, fetchOpts);

      const responseHeaders = new Headers();
      for (const [key, value] of upstream.headers.entries()) {
        const lower = key.toLowerCase();
        if (lower === "transfer-encoding" || lower === "connection") continue;
        try { responseHeaders.set(key, value); } catch {}
      }

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response("Bad Gateway: Tunnel Failed - " + String(err), { status: 502 });
    }
  } catch (outerErr) {
    return new Response("Internal Error: " + String(outerErr), { status: 500 });
  }
}

function shouldForwardHeader(headerName) {
  if (FORWARD_HEADER_EXACT.has(headerName)) return true;
  for (const prefix of FORWARD_HEADER_PREFIXES) {
    if (headerName.startsWith(prefix)) return true;
  }
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


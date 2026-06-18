import "dotenv/config";
import express from "express";
import cors from "cors";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import bcrypt from "bcrypt";

import { getDb, closeDb } from "./db/init.js";
import { readInstallerState } from "./services/xray.service.js";
import authRoutes from "./routes/auth.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import tokensRoutes from "./routes/tokens.routes.js";
import deployRoutes from "./routes/deploy.routes.js";
import configsRoutes from "./routes/configs.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import setupRoutes from "./routes/setup.routes.js";
import inboundsRoutes from "./routes/inbounds.routes.js";
import clientsRoutes from "./routes/clients.routes.js";
import { syncTrafficFromXray, checkAndDisableExpired } from "./services/client.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(cors());
app.use(express.json());

const frontendPath = resolve(__dirname, "../frontend/out");

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCookies(cookieHeader: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

function getSetting(key: string): string {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? "";
}

function upsertSetting(key: string, value: string) {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, value);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function bootstrap() {
  const dataDir = resolve(__dirname, "../data");
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const db = getDb();

  // Seed admin
  if (!db.prepare("SELECT id FROM admin LIMIT 1").get()) {
    const hash = bcrypt.hashSync("admin", 10);
    db.prepare("INSERT INTO admin (username, password) VALUES (?, ?)").run("admin", hash);
    console.log("Default admin created — username: admin, password: admin");
    console.log("IMPORTANT: Change the default password after first login!");
  }

  // Seed settings — DO NOTHING if key already exists (preserve existing values)
  const seed = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING"
  );
  seed.run("language",     "en");
  seed.run("theme",        "light");
  seed.run("web_path",     randomBytes(5).toString("hex"));   // e.g. a3f9c1d2e4
  seed.run("panel_secret", randomBytes(32).toString("hex"));  // httpOnly cookie value
}

bootstrap();

const WEB_PATH     = getSetting("web_path");
const PANEL_SECRET = getSetting("panel_secret");
const COOKIE_NAME  = "_px";
const COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Guards ────────────────────────────────────────────────────────────────────

function localOnly(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.socket.remoteAddress ?? "";
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return next();
  res.status(404).json({ error: "Not found" });
}

function requirePanelCookie(req: express.Request, res: express.Response, next: express.NextFunction) {
  const cookies = parseCookies(req.headers.cookie ?? "");
  if (cookies[COOKIE_NAME] === PANEL_SECRET) return next();
  res.status(404).send("Not found");
}

// ── Local admin API (used by xhttp-info CLI, localhost only) ──────────────────

function getServerHost(): string {
  const state = readInstallerState();
  if (state.domain) return state.domain;
  // fallback: first non-loopback IPv4
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "localhost";
}

app.get("/api/v1/local/info", localOnly, (_req, res) => {
  const host = getServerHost();
  res.json({
    webPath:  WEB_PATH,
    panelUrl: `http://${host}/${WEB_PATH}`,
    localUrl: `http://localhost:${PORT}/${WEB_PATH}`,
  });
});

app.post("/api/v1/local/reset-password", localOnly, async (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  const hash = await bcrypt.hash(password, 10);
  getDb().prepare("UPDATE admin SET password = ? WHERE username = 'admin'").run(hash);
  res.json({ ok: true });
});

app.post("/api/v1/local/set-web-path", localOnly, (req, res) => {
  const { path: newPath } = req.body as { path?: string };
  if (!newPath || !/^[a-z0-9_-]{4,32}$/.test(newPath)) {
    return res.status(400).json({ error: "Invalid path — use 4–32 chars: a-z 0-9 _ -" });
  }
  upsertSetting("web_path", newPath);
  res.json({ ok: true, newPath, restart: true });
});

// ── API routes ────────────────────────────────────────────────────────────────

app.use("/api/v1/auth",      authRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/tokens",    tokensRoutes);
app.use("/api/v1/deploy",    deployRoutes);
app.use("/api/v1/configs",   configsRoutes);
app.use("/api/v1/settings",  settingsRoutes);
app.use("/api/v1/setup",     setupRoutes);
app.use("/api/v1/inbounds",  inboundsRoutes);
app.use("/api/v1/clients",   clientsRoutes);

// ── Static assets — always public ─────────────────────────────────────────────
// Only serve JS/CSS bundles and favicon without cookie.
// HTML files are NEVER served here — they go through requirePanelCookie below.

if (existsSync(frontendPath)) {
  app.use("/_next",       express.static(join(frontendPath, "_next"), { maxAge: "1y" }));
  app.use("/favicon.ico", express.static(join(frontendPath, "favicon.ico")));
  // Only allow safe static assets — block .html, .htm, .txt and other non-asset files
  // that Next.js generates (e.g. index.txt with RSC payloads) which would leak internal data.
  app.use((req, res, next) => {
    const ext = req.path.split(".").pop()?.toLowerCase() || "";
    const blockedExts = new Set(["html", "htm", "txt", "json", "map"]);
    if (blockedExts.has(ext)) {
      return res.status(404).send("Not found");
    }
    next();
  });
  app.use(express.static(frontendPath, { index: false, maxAge: "1h" }));
}

// ── Secret gate — visiting /{WEB_PATH} sets the access cookie ─────────────────

app.get(`/${WEB_PATH}`, (_req, res) => {
  res
    .cookie(COOKIE_NAME, PANEL_SECRET, {
      httpOnly: true,
      maxAge:   COOKIE_TTL_MS,
      sameSite: "strict",
      path:     "/",
    })
    .redirect(302, "/");
});

// ── SPA fallback — cookie required ────────────────────────────────────────────

app.get("*", requirePanelCookie, (req, res) => {
  if (!existsSync(frontendPath)) {
    return res.status(200).json({ status: "XHTTP Panel API running", version: "1.0.0" });
  }

  // Map URL → Next.js static export file
  const urlPath = req.path.replace(/\/+$/, "") || "";
  const candidates = [
    join(frontendPath, urlPath, "index.html"),
    join(frontendPath, urlPath + ".html"),
    join(frontendPath, "index.html"),
  ];
  for (const f of candidates) {
    if (existsSync(f)) return res.sendFile(f);
  }
  res.sendFile(join(frontendPath, "index.html"));
});

// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`XHTTP Panel running at http://localhost:${PORT}`);
  console.log(`Panel path: /${WEB_PATH}  (run 'xhttp-info' to manage)`);
});

// ── Background jobs ──────────────────────────────────────────────────────────
// Sync traffic from Xray stats every 30 seconds (lightweight, no routing overhead)
const trafficSyncInterval = setInterval(() => {
  try { syncTrafficFromXray(); } catch {}
}, 30_000);
// Check expired clients every 60 seconds
const expirySyncInterval = setInterval(() => {
  try { checkAndDisableExpired(); } catch {}
}, 60_000);

process.on("SIGTERM", () => { console.log("Shutting down..."); clearInterval(trafficSyncInterval); clearInterval(expirySyncInterval); server.close(); closeDb(); });
process.on("SIGINT",  () => { console.log("Shutting down..."); clearInterval(trafficSyncInterval); clearInterval(expirySyncInterval); server.close(); closeDb(); });

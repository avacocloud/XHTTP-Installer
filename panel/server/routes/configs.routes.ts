import { Router } from "express";
import { existsSync } from "node:fs";
import { requireAuth } from "../middleware/auth.js";
import {
  readXrayConfig,
  getConnectionLink,
  getServerStatus,
  restartXray,
  readInstallerState,
  buildConfigLinkForHost,
} from "../services/xray.service.js";
import { getDb } from "../db/init.js";

const router = Router();

router.get("/xray", requireAuth, (_req, res) => {
  const config = readXrayConfig();
  if (!config) {
    res.status(404).json({ error: "Xray config not found" });
    return;
  }
  res.json(config);
});

router.get("/connection-link", requireAuth, (_req, res) => {
  const link = getConnectionLink();
  if (!link) {
    res.status(404).json({ error: "No connection link available. Installer state not found." });
    return;
  }
  res.json({ link });
});

router.get("/server-status", requireAuth, (_req, res) => {
  const status = getServerStatus();
  res.json(status);
});

router.post("/xray/restart", requireAuth, (_req, res) => {
  const result = restartXray();
  res.status(result.success ? 200 : 500).json(result);
});

router.get("/installer-state", requireAuth, (_req, res) => {
  const state = readInstallerState();
  res.json(state);
});

router.get("/all-links", requireAuth, (_req, res) => {
  const serverLink = getConnectionLink();

  const db = getDb();
  const deploys = db
    .prepare("SELECT id, platform, project_name, deploy_url, public_path, config_json FROM deployments WHERE status = 'active'")
    .all() as Array<{ id: number; platform: string; project_name: string; deploy_url: string; public_path: string; config_json: string }>;

  const deployLinks = deploys
    .map((d) => {
      let configLink: string | null = null;

      // Always regenerate with full xpadding/alpn params using CLIENT_LINK as template
      if (d.deploy_url) {
        try {
          const host = new URL(d.deploy_url).hostname;
          const label = `${d.platform.charAt(0).toUpperCase() + d.platform.slice(1)}-${d.project_name}`;
          configLink = buildConfigLinkForHost(host, d.public_path || "/api", label);
        } catch {}
      }

      // Fallback to stored config_json if build failed
      if (!configLink) {
        try {
          const cfg = JSON.parse(d.config_json || "{}");
          configLink = cfg.configLink || null;
        } catch {}
      }

      return { id: d.id, platform: d.platform, projectName: d.project_name, url: d.deploy_url, publicPath: d.public_path || "/api", configLink };
    })
    .filter((d) => d.configLink);

  res.json({ serverLink, deployLinks });
});

// Test if a relay URL is reachable — hit the relay path directly (not /health which doesn't exist)
router.get("/check-relay", requireAuth, async (req, res) => {
  const url = req.query.url as string;
  const path = (req.query.path as string) || "/api";
  if (!url) {
    res.status(400).json({ error: "url query param required" });
    return;
  }

  // Build test URL: base URL + relay path (e.g. https://xxx.netlify.app/api)
  const base = url.replace(/\/+$/, "");
  const relayPath = path.startsWith("/") ? path : `/${path}`;
  const testUrl = `${base}${relayPath}`;

  const start = Date.now();
  try {
    const resp = await fetch(testUrl, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/octet-stream" },
      body: "",
    });
    // For XHTTP relay: 4xx = relay is alive (xray rejects invalid handshake),
    // 5xx = relay broken or env vars missing, 2xx = also fine
    const ms = Date.now() - start;
    const ok = resp.status < 500;
    res.json({ ok, status: resp.status, ms });
  } catch (err) {
    res.json({ ok: false, status: 0, ms: Date.now() - start, error: String(err) });
  }
});

// ── GET /ssl-paths — auto-detect SSL cert paths ─────────────────────────────
router.get("/ssl-paths", requireAuth, (_req, res) => {
  const state = readInstallerState();
  const domain = state.domain || "";

  // Also check Xray config for existing cert paths
  const xrayConfig = readXrayConfig() as Record<string, any> | null;
  if (xrayConfig) {
    for (const ib of xrayConfig.inbounds || []) {
      const certs = ib.streamSettings?.tlsSettings?.certificates;
      if (certs?.[0]?.certificateFile && certs?.[0]?.keyFile) {
        res.json({ domain, certFile: certs[0].certificateFile, keyFile: certs[0].keyFile });
        return;
      }
    }
  }

  // Fallback: guess from common paths
  const candidates = [
    { cert: `/etc/ssl/xhttp/${domain}/fullchain.pem`, key: `/etc/ssl/xhttp/${domain}/privkey.pem` },
    { cert: `/root/.acme.sh/${domain}_ecc/fullchain.cer`, key: `/root/.acme.sh/${domain}_ecc/${domain}.key` },
    { cert: `/etc/letsencrypt/live/${domain}/fullchain.pem`, key: `/etc/letsencrypt/live/${domain}/privkey.pem` },
  ];

  for (const c of candidates) {
    if (existsSync(c.cert) && existsSync(c.key)) {
      res.json({ domain, certFile: c.cert, keyFile: c.key });
      return;
    }
  }

  res.json({ domain, certFile: "", keyFile: "" });
});

export default router;

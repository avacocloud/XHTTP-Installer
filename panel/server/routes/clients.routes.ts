import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getDb } from "../db/init.js";
import { buildConfigLinkForHost, getConnectionLink } from "../services/xray.service.js";
import {
  listClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
  toggleClient,
  bulkCreateClients,
  bulkDeleteClients,
  bulkToggleClients,
  syncTrafficFromXray,
  getTrafficHistory,
  resetClientTraffic,
  resetAllTraffic,
  checkAndDisableExpired,
  getClientsSummary,
  getOnlineClients,
} from "../services/client.service.js";

const router = Router();

// ── GET / — list clients ────────────────────────────────────────────────────
router.get("/", requireAuth, (req, res) => {
  try {
    const { inbound_tag, enabled, search } = req.query as Record<string, string>;
    const clients = listClients({
      inbound_tag,
      enabled: enabled !== undefined ? enabled === "true" : undefined,
      search,
    });
    res.json(clients);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /summary — stats overview ───────────────────────────────────────────
router.get("/summary", requireAuth, (_req, res) => {
  try {
    const summary = getClientsSummary();
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /online — currently active clients ──────────────────────────────────
router.get("/online", requireAuth, (_req, res) => {
  try {
    const online = getOnlineClients();
    res.json(online);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /sync-traffic — pull stats from Xray ──────────────────────────────
router.post("/sync-traffic", requireAuth, (_req, res) => {
  try {
    const result = syncTrafficFromXray();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /check-expiry — disable expired clients ────────────────────────────
router.post("/check-expiry", requireAuth, (_req, res) => {
  try {
    const result = checkAndDisableExpired();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /reset-all-traffic — reset all clients traffic ─────────────────────
router.post("/reset-all-traffic", requireAuth, (_req, res) => {
  try {
    const result = resetAllTraffic();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /bulk — bulk operations ────────────────────────────────────────────
router.post("/bulk", requireAuth, (req, res) => {
  const { action, ids, clients: clientsData, enabled } = req.body;

  try {
    if (action === "create" && Array.isArray(clientsData)) {
      const result = bulkCreateClients(clientsData);
      res.json(result);
    } else if (action === "delete" && Array.isArray(ids)) {
      const result = bulkDeleteClients(ids);
      res.json(result);
    } else if (action === "toggle" && Array.isArray(ids) && typeof enabled === "boolean") {
      const result = bulkToggleClients(ids, enabled);
      res.json(result);
    } else {
      res.status(400).json({ error: "Invalid bulk action" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:id/deployments — list available deployments for config generation ──
router.get("/:id/deployments", requireAuth, (req, res) => {
  const client = getClient(Number(req.params.id));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const db = getDb();
  const deploys = db
    .prepare("SELECT id, platform, project_name, deploy_url FROM deployments WHERE status = 'active'")
    .all() as Array<{ id: number; platform: string; project_name: string; deploy_url: string }>;

  const list: Array<{ id: number | string; platform: string; name: string }> = [];

  // Server direct
  const serverLink = getConnectionLink();
  if (serverLink) {
    list.push({ id: "server", platform: "server", name: "Direct Server" });
  }

  for (const d of deploys) {
    if (d.deploy_url) {
      list.push({ id: d.id, platform: d.platform, name: d.project_name });
    }
  }

  res.json(list);
});

// ── GET /:id/config-link — generate ONE config link for a specific deploy ────
router.get("/:id/config-link", requireAuth, (req, res) => {
  const client = getClient(Number(req.params.id));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const deployId = req.query.deployId as string;
  if (!deployId) {
    res.status(400).json({ error: "deployId query param required" });
    return;
  }

  let configLink = "";

  if (deployId === "server") {
    const serverLink = getConnectionLink();
    if (serverLink) {
      configLink = serverLink
        .replace(/(vless:\/\/)[^@]+(@)/, `$1${client.uuid}$2`)
        .replace(/#[^#]*$/, `#${client.email}`);
    }
  } else {
    const db = getDb();
    const deploy = db
      .prepare("SELECT deploy_url, public_path FROM deployments WHERE id = ? AND status = 'active'")
      .get(Number(deployId)) as { deploy_url: string; public_path: string } | undefined;

    if (deploy?.deploy_url) {
      try {
        const host = new URL(deploy.deploy_url).hostname;
        configLink = buildConfigLinkForHost(host, deploy.public_path || "/api", client.email, client.uuid);
      } catch {}
    }
  }

  if (!configLink) {
    res.status(404).json({ error: "Could not generate config link" });
    return;
  }

  res.json({ configLink });
});

// ── GET /:id — single client ────────────────────────────────────────────────
router.get("/:id", requireAuth, (req, res) => {
  const client = getClient(Number(req.params.id));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.json(client);
});

// ── POST / — create client ──────────────────────────────────────────────────
router.post("/", requireAuth, (req, res) => {
  const { uuid, email, inbound_tag, traffic_limit, expiry_date, max_ips, enabled, flow } = req.body;

  if (!uuid || !email || !inbound_tag) {
    res.status(400).json({ error: "uuid, email, and inbound_tag are required" });
    return;
  }

  const result = createClient({ uuid, email, inbound_tag, traffic_limit, expiry_date, max_ips, enabled, flow });
  if (result.success) {
    res.json({ success: true, client: result.client });
  } else {
    res.status(400).json({ error: result.message });
  }
});

// ── PUT /:id — update client ────────────────────────────────────────────────
router.put("/:id", requireAuth, (req, res) => {
  const { email, traffic_limit, expiry_date, max_ips, enabled, flow } = req.body;
  const result = updateClient(Number(req.params.id), { email, traffic_limit, expiry_date, max_ips, enabled, flow });
  if (result.success) {
    res.json({ success: true, client: result.client });
  } else {
    res.status(400).json({ error: result.message });
  }
});

// ── DELETE /:id — delete client ─────────────────────────────────────────────
router.delete("/:id", requireAuth, (req, res) => {
  const result = deleteClient(Number(req.params.id));
  if (result.success) {
    res.json({ success: true });
  } else {
    res.status(400).json({ error: result.message });
  }
});

// ── PATCH /:id/toggle — enable/disable ──────────────────────────────────────
router.patch("/:id/toggle", requireAuth, (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled (boolean) is required" });
    return;
  }
  const result = toggleClient(Number(req.params.id), enabled);
  if (result.success) {
    res.json({ success: true, message: result.message });
  } else {
    res.status(400).json({ error: result.message });
  }
});

// ── POST /:id/reset-traffic — reset single client traffic ──────────────────
router.post("/:id/reset-traffic", requireAuth, (req, res) => {
  const result = resetClientTraffic(Number(req.params.id));
  if (result.success) {
    res.json({ success: true });
  } else {
    res.status(400).json({ error: result.message });
  }
});

// ── GET /:id/traffic-history — traffic graph data ───────────────────────────
router.get("/:id/traffic-history", requireAuth, (req, res) => {
  const days = Number(req.query.days) || 7;
  try {
    const history = getTrafficHistory(Number(req.params.id), days);
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

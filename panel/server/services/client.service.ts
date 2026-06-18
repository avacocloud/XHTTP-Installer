import { getDb } from "../db/init.js";
import { readFileSync, existsSync, writeFileSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";

const XRAY_CONFIG = process.env.XRAY_CONFIG_PATH || "/usr/local/etc/xray/config.json";
const XRAY_API_PORT = Number(process.env.XRAY_API_PORT) || 10085;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClientRow {
  id: number;
  uuid: string;
  email: string;
  inbound_tag: string;
  traffic_limit: number;
  traffic_up: number;
  traffic_down: number;
  expiry_date: string | null;
  max_ips: number;
  enabled: number;
  flow: string;
  created_at: string;
  updated_at: string;
}

export interface ClientInput {
  uuid: string;
  email: string;
  inbound_tag: string;
  traffic_limit?: number;
  expiry_date?: string | null;
  max_ips?: number;
  enabled?: boolean;
  flow?: string;
}

export interface ClientUpdate {
  email?: string;
  traffic_limit?: number;
  expiry_date?: string | null;
  max_ips?: number;
  enabled?: boolean;
  flow?: string;
}

export interface TrafficStats {
  email: string;
  upload: number;
  download: number;
}

// ── Xray Config Helpers ──────────────────────────────────────────────────────

function readFullConfig(): Record<string, any> {
  if (!existsSync(XRAY_CONFIG)) return { log: {}, inbounds: [], outbounds: [] };
  try {
    return JSON.parse(readFileSync(XRAY_CONFIG, "utf-8"));
  } catch {
    return { log: {}, inbounds: [], outbounds: [] };
  }
}

function writeConfig(config: Record<string, any>): void {
  if (existsSync(XRAY_CONFIG)) {
    copyFileSync(XRAY_CONFIG, XRAY_CONFIG + ".bak");
  }
  writeFileSync(XRAY_CONFIG, JSON.stringify(config, null, 2), "utf-8");
}

function validateConfig(): { valid: boolean; error?: string } {
  try {
    execSync(`xray -test -config "${XRAY_CONFIG}" 2>&1`, {
      encoding: "utf-8",
      timeout: 10000,
      cwd: "/root",
    });
    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: (err.stderr || err.stdout || String(err)).slice(0, 300) };
  }
}

function restartXray(): { success: boolean; message: string } {
  try {
    execSync("systemctl restart xray 2>&1", { encoding: "utf-8" });
    return { success: true, message: "Xray restarted" };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

// Write config to disk only (persist for next Xray start) — NO restart
function writeConfigOnly(config: Record<string, any>): { success: boolean; message: string } {
  writeConfig(config);
  const validation = validateConfig();
  if (!validation.valid) {
    if (existsSync(XRAY_CONFIG + ".bak")) {
      copyFileSync(XRAY_CONFIG + ".bak", XRAY_CONFIG);
    }
    return { success: false, message: "Invalid config: " + validation.error };
  }
  return { success: true, message: "Config saved" };
}

function writeConfigValidateAndRestart(config: Record<string, any>): { success: boolean; message: string } {
  const result = writeConfigOnly(config);
  if (!result.success) return result;
  return restartXray();
}

// ── Xray Handler API — add/remove clients at runtime without restart ────────

function xrayAddClientRuntime(inboundTag: string, uuid: string, email: string, flow: string): boolean {
  try {
    const client: Record<string, any> = { id: uuid, email, level: 0 };
    if (flow) client.flow = flow;
    const input = JSON.stringify({
      inboundTag,
      user: { email, level: 0, account: { id: uuid, flow: flow || "" } }
    });
    execSync(
      `echo '${input.replace(/'/g, "\\'")}' | xray api adi --server=127.0.0.1:${XRAY_API_PORT} 2>/dev/null`,
      { encoding: "utf-8", timeout: 5000 }
    );
    return true;
  } catch {
    return false;
  }
}

function xrayRemoveClientRuntime(inboundTag: string, email: string): boolean {
  try {
    const input = JSON.stringify({ inboundTag, email });
    execSync(
      `echo '${input.replace(/'/g, "\\'")}' | xray api rmi --server=127.0.0.1:${XRAY_API_PORT} 2>/dev/null`,
      { encoding: "utf-8", timeout: 5000 }
    );
    return true;
  } catch {
    return false;
  }
}

// Enable stats counters + API endpoint. NO catch-all routing rule (causes drops).
function ensureStatsEnabled(config: Record<string, any>): void {
  if (!config.stats) config.stats = {};

  if (!config.api) {
    config.api = {
      tag: "api",
      services: ["StatsService"],
    };
  } else {
    if (!config.api.services) config.api.services = [];
    if (!config.api.services.includes("StatsService")) {
      config.api.services.push("StatsService");
    }
    // Remove HandlerService if present (not needed, causes overhead)
    config.api.services = config.api.services.filter((s: string) => s !== "HandlerService");
  }

  if (!config.policy) config.policy = {};
  if (!config.policy.levels) config.policy.levels = {};
  if (!config.policy.levels["0"]) config.policy.levels["0"] = {};
  config.policy.levels["0"].statsUserUplink = true;
  config.policy.levels["0"].statsUserDownlink = true;
  // Only user-level stats, no system-level (lighter)

  // Ensure API inbound exists
  const hasApiInbound = (config.inbounds || []).some((ib: any) => ib.tag === "api");
  if (!hasApiInbound) {
    if (!config.inbounds) config.inbounds = [];
    config.inbounds.push({
      tag: "api",
      listen: "127.0.0.1",
      port: XRAY_API_PORT,
      protocol: "dokodemo-door",
      settings: { address: "127.0.0.1" },
    });
  }

  // Add ONLY the api routing rule — NO default/catch-all rule (causes connection drops)
  if (!config.routing) config.routing = {};
  if (!config.routing.rules) config.routing.rules = [];
  const hasApiRule = config.routing.rules.some(
    (r: any) => r.inboundTag?.includes("api") && r.outboundTag === "api"
  );
  if (!hasApiRule) {
    config.routing.rules.push({
      type: "field",
      inboundTag: ["api"],
      outboundTag: "api",
    });
  }
}

// ── Sync client to/from Xray config ─────────────────────────────────────────

function addClientToXrayConfig(
  config: Record<string, any>,
  inboundTag: string,
  uuid: string,
  email: string,
  flow: string
): boolean {
  const inbound = (config.inbounds || []).find((ib: any) => ib.tag === inboundTag);
  if (!inbound) return false;

  if (!inbound.settings) inbound.settings = {};
  if (!inbound.settings.clients) inbound.settings.clients = [];

  const exists = inbound.settings.clients.some((c: any) => c.id === uuid);
  if (exists) return true;

  const client: Record<string, any> = { id: uuid, email };
  if (flow) client.flow = flow;
  inbound.settings.clients.push(client);
  return true;
}

function removeClientFromXrayConfig(
  config: Record<string, any>,
  inboundTag: string,
  uuid: string
): boolean {
  const inbound = (config.inbounds || []).find((ib: any) => ib.tag === inboundTag);
  if (!inbound) return false;

  const clients = inbound.settings?.clients || [];
  const before = clients.length;
  inbound.settings.clients = clients.filter((c: any) => c.id !== uuid);
  return inbound.settings.clients.length < before;
}

function updateClientInXrayConfig(
  config: Record<string, any>,
  inboundTag: string,
  uuid: string,
  email: string,
  flow: string
): boolean {
  const inbound = (config.inbounds || []).find((ib: any) => ib.tag === inboundTag);
  if (!inbound) return false;

  const clients = inbound.settings?.clients || [];
  const client = clients.find((c: any) => c.id === uuid);
  if (!client) return false;

  client.email = email;
  if (flow) client.flow = flow;
  else delete client.flow;
  return true;
}

// ── Xray Stats API ──────────────────────────────────────────────────────────

function queryXrayStats(): TrafficStats[] {
  try {
    const output = execSync(
      `xray api statsquery --server=127.0.0.1:${XRAY_API_PORT} 2>/dev/null`,
      { encoding: "utf-8", timeout: 5000 }
    );
    return parseStatsOutput(output);
  } catch {
    return [];
  }
}

function parseStatsOutput(output: string): TrafficStats[] {
  const stats: Record<string, { upload: number; download: number }> = {};

  try {
    // Xray API returns JSON: { "stat": [ { "name": "user>>>email>>>traffic>>>uplink", "value": 123 }, ... ] }
    const json = JSON.parse(output);
    const entries = json.stat || json.stats || [];
    for (const entry of entries) {
      const name: string = entry.name || "";
      const value: number = Number(entry.value || 0);
      const match = name.match(/^user>>>([^>]+)>>>traffic>>>(uplink|downlink)$/);
      if (!match) continue;

      const email = match[1];
      const direction = match[2];
      if (!stats[email]) stats[email] = { upload: 0, download: 0 };
      if (direction === "uplink") stats[email].upload = value;
      else stats[email].download = value;
    }
  } catch {
    // Fallback: try line-by-line regex (older Xray versions)
    const lines = output.split("\n");
    for (const line of lines) {
      const match = line.match(/user>>>([^>]+)>>>traffic>>>(uplink|downlink)/);
      if (!match) continue;
      const email = match[1];
      const direction = match[2];
      const vm = line.match(/"value":\s*(\d+)/);
      if (vm) {
        if (!stats[email]) stats[email] = { upload: 0, download: 0 };
        if (direction === "uplink") stats[email].upload = Number(vm[1]);
        else stats[email].download = Number(vm[1]);
      }
    }
  }

  return Object.entries(stats).map(([email, { upload, download }]) => ({
    email,
    upload,
    download,
  }));
}

function resetXrayUserStats(email: string): boolean {
  try {
    execSync(
      `xray api statsquery --server=127.0.0.1:${XRAY_API_PORT} -reset -pattern "user>>>${email}>>>" 2>/dev/null`,
      { encoding: "utf-8", timeout: 5000 }
    );
    return true;
  } catch {
    return false;
  }
}

// ── DB Operations ───────────────────────────────────────────────────────────

export function listClients(filters?: {
  inbound_tag?: string;
  enabled?: boolean;
  search?: string;
}): ClientRow[] {
  const db = getDb();
  let sql = "SELECT * FROM clients WHERE 1=1";
  const params: any[] = [];

  if (filters?.inbound_tag) {
    sql += " AND inbound_tag = ?";
    params.push(filters.inbound_tag);
  }
  if (filters?.enabled !== undefined) {
    sql += " AND enabled = ?";
    params.push(filters.enabled ? 1 : 0);
  }
  if (filters?.search) {
    sql += " AND (email LIKE ? OR uuid LIKE ?)";
    const s = `%${filters.search}%`;
    params.push(s, s);
  }

  sql += " ORDER BY created_at DESC";
  return db.prepare(sql).all(...params) as ClientRow[];
}

export function getClient(id: number): ClientRow | undefined {
  return getDb().prepare("SELECT * FROM clients WHERE id = ?").get(id) as ClientRow | undefined;
}

export function getClientByEmail(email: string): ClientRow | undefined {
  return getDb().prepare("SELECT * FROM clients WHERE email = ?").get(email) as ClientRow | undefined;
}

export function createClient(input: ClientInput): { success: boolean; message: string; client?: ClientRow } {
  const db = getDb();

  // Validate inbound exists
  const config = readFullConfig();
  const inbound = (config.inbounds || []).find((ib: any) => ib.tag === input.inbound_tag);
  if (!inbound) {
    return { success: false, message: `Inbound "${input.inbound_tag}" not found in Xray config` };
  }

  // Check email uniqueness
  const existing = getClientByEmail(input.email);
  if (existing) {
    return { success: false, message: `Client with email "${input.email}" already exists` };
  }

  // Enable stats (only modifies config if needed)
  ensureStatsEnabled(config);

  // Add to Xray config file (persist)
  const added = addClientToXrayConfig(config, input.inbound_tag, input.uuid, input.email, input.flow || "");
  if (!added) {
    return { success: false, message: "Failed to add client to Xray config" };
  }

  // Save config and restart (stats API disabled, runtime add unavailable)
  const result = writeConfigValidateAndRestart(config);
  if (!result.success) {
    return { success: false, message: result.message };
  }

  // Insert into DB
  const stmt = db.prepare(`
    INSERT INTO clients (uuid, email, inbound_tag, traffic_limit, expiry_date, max_ips, enabled, flow)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    input.uuid,
    input.email,
    input.inbound_tag,
    input.traffic_limit || 0,
    input.expiry_date || null,
    input.max_ips || 0,
    input.enabled !== false ? 1 : 0,
    input.flow || ""
  );

  const client = getClient(info.lastInsertRowid as number);
  return { success: true, message: "Client created", client };
}

export function updateClient(id: number, updates: ClientUpdate): { success: boolean; message: string; client?: ClientRow } {
  const db = getDb();
  const client = getClient(id);
  if (!client) {
    return { success: false, message: "Client not found" };
  }

  const config = readFullConfig();
  let configChanged = false;

  // If email or flow changed, update config
  if (updates.email !== undefined || updates.flow !== undefined) {
    const newEmail = updates.email || client.email;
    const newFlow = updates.flow !== undefined ? updates.flow : client.flow;
    updateClientInXrayConfig(config, client.inbound_tag, client.uuid, newEmail, newFlow);
    configChanged = true;
  }

  // If enabled changed, add/remove from config
  if (updates.enabled !== undefined) {
    if (updates.enabled && !client.enabled) {
      addClientToXrayConfig(config, client.inbound_tag, client.uuid, updates.email || client.email, updates.flow !== undefined ? updates.flow : client.flow);
      configChanged = true;
    } else if (!updates.enabled && client.enabled) {
      removeClientFromXrayConfig(config, client.inbound_tag, client.uuid);
      configChanged = true;
    }
  }

  if (configChanged) {
    const result = writeConfigValidateAndRestart(config);
    if (!result.success) {
      return { success: false, message: result.message };
    }
  }

  // Update DB
  const sets: string[] = [];
  const params: any[] = [];

  if (updates.email !== undefined) { sets.push("email = ?"); params.push(updates.email); }
  if (updates.traffic_limit !== undefined) { sets.push("traffic_limit = ?"); params.push(updates.traffic_limit); }
  if (updates.expiry_date !== undefined) { sets.push("expiry_date = ?"); params.push(updates.expiry_date); }
  if (updates.max_ips !== undefined) { sets.push("max_ips = ?"); params.push(updates.max_ips); }
  if (updates.enabled !== undefined) { sets.push("enabled = ?"); params.push(updates.enabled ? 1 : 0); }
  if (updates.flow !== undefined) { sets.push("flow = ?"); params.push(updates.flow); }

  if (sets.length > 0) {
    sets.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare(`UPDATE clients SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  }

  return { success: true, message: "Client updated", client: getClient(id) };
}

export function deleteClient(id: number): { success: boolean; message: string } {
  const client = getClient(id);
  if (!client) {
    return { success: false, message: "Client not found" };
  }

  const config = readFullConfig();
  removeClientFromXrayConfig(config, client.inbound_tag, client.uuid);
  const result = writeConfigValidateAndRestart(config);
  if (!result.success) {
    return { success: false, message: result.message };
  }

  getDb().prepare("DELETE FROM clients WHERE id = ?").run(id);
  return { success: true, message: "Client deleted" };
}

export function toggleClient(id: number, enabled: boolean): { success: boolean; message: string } {
  return updateClient(id, { enabled }).success
    ? { success: true, message: enabled ? "Client enabled" : "Client disabled" }
    : { success: false, message: "Failed to toggle client" };
}

// ── Bulk Operations ─────────────────────────────────────────────────────────

export function bulkCreateClients(
  clients: ClientInput[]
): { success: boolean; created: number; errors: string[] } {
  const errors: string[] = [];
  let created = 0;

  for (const input of clients) {
    const result = createClient(input);
    if (result.success) {
      created++;
    } else {
      errors.push(`${input.email}: ${result.message}`);
    }
  }

  return { success: errors.length === 0, created, errors };
}

export function bulkDeleteClients(ids: number[]): { success: boolean; deleted: number; errors: string[] } {
  const errors: string[] = [];
  let deleted = 0;

  for (const id of ids) {
    const result = deleteClient(id);
    if (result.success) {
      deleted++;
    } else {
      errors.push(`ID ${id}: ${result.message}`);
    }
  }

  return { success: errors.length === 0, deleted, errors };
}

export function bulkToggleClients(ids: number[], enabled: boolean): { success: boolean; updated: number } {
  let updated = 0;
  for (const id of ids) {
    if (toggleClient(id, enabled).success) updated++;
  }
  return { success: true, updated };
}

// ── Traffic ─────────────────────────────────────────────────────────────────

export function syncTrafficFromXray(): { synced: number } {
  // Skip if no clients exist — avoid unnecessary xray api calls
  const clientCount = (getDb().prepare("SELECT COUNT(*) as c FROM clients").get() as any).c;
  if (clientCount === 0) return { synced: 0 };

  const stats = queryXrayStats();
  const db = getDb();
  let synced = 0;

  const updateStmt = db.prepare(`
    UPDATE clients SET traffic_up = traffic_up + ?, traffic_down = traffic_down + ?, updated_at = datetime('now')
    WHERE email = ?
  `);
  const historyStmt = db.prepare(`
    INSERT INTO client_traffic_history (client_id, upload, download) VALUES (?, ?, ?)
  `);

  const clientsToDisable: number[] = [];

  const transaction = db.transaction(() => {
    for (const stat of stats) {
      if (stat.upload === 0 && stat.download === 0) continue;

      const client = getClientByEmail(stat.email);
      if (!client) continue;

      updateStmt.run(stat.upload, stat.download, stat.email);
      historyStmt.run(client.id, stat.upload, stat.download);
      synced++;

      // Reset Xray counter after recording
      resetXrayUserStats(stat.email);

      // Mark for disable if traffic limit exceeded (don't restart Xray inside the loop)
      const updated = getClient(client.id);
      if (updated && updated.traffic_limit > 0) {
        const total = updated.traffic_up + updated.traffic_down;
        if (total >= updated.traffic_limit && updated.enabled) {
          clientsToDisable.push(client.id);
        }
      }
    }
  });

  transaction();

  // Disable over-limit clients
  if (clientsToDisable.length > 0) {
    const config = readFullConfig();
    const db2 = getDb();
    for (const id of clientsToDisable) {
      const c = getClient(id);
      if (c) {
        removeClientFromXrayConfig(config, c.inbound_tag, c.uuid);
        db2.prepare("UPDATE clients SET enabled = 0, updated_at = datetime('now') WHERE id = ?").run(id);
      }
    }
    writeConfigValidateAndRestart(config);
  }

  return { synced };
}

export function getTrafficHistory(
  clientId: number,
  days: number = 7
): { recorded_at: string; upload: number; download: number }[] {
  return getDb()
    .prepare(
      `SELECT recorded_at, upload, download FROM client_traffic_history
       WHERE client_id = ? AND recorded_at >= datetime('now', ?)
       ORDER BY recorded_at ASC`
    )
    .all(clientId, `-${days} days`) as any[];
}

export function resetClientTraffic(id: number): { success: boolean; message: string } {
  const client = getClient(id);
  if (!client) return { success: false, message: "Client not found" };

  getDb().prepare("UPDATE clients SET traffic_up = 0, traffic_down = 0, updated_at = datetime('now') WHERE id = ?").run(id);
  getDb().prepare("DELETE FROM client_traffic_history WHERE client_id = ?").run(id);
  resetXrayUserStats(client.email);

  // Re-enable if was disabled due to traffic limit
  if (!client.enabled && client.traffic_limit > 0) {
    toggleClient(id, true);
  }

  return { success: true, message: "Traffic reset" };
}

export function resetAllTraffic(): { success: boolean; message: string } {
  const db = getDb();
  const clients = listClients();

  db.prepare("UPDATE clients SET traffic_up = 0, traffic_down = 0, updated_at = datetime('now')").run();
  db.prepare("DELETE FROM client_traffic_history").run();

  for (const client of clients) {
    resetXrayUserStats(client.email);
  }

  return { success: true, message: "All traffic reset" };
}

// ── Expiry Check ────────────────────────────────────────────────────────────

export function checkAndDisableExpired(): { disabled: number } {
  const db = getDb();
  const clientCount = (db.prepare("SELECT COUNT(*) as c FROM clients").get() as any).c;
  if (clientCount === 0) return { disabled: 0 };
  const now = new Date().toISOString();
  const expired = db
    .prepare("SELECT * FROM clients WHERE enabled = 1 AND expiry_date IS NOT NULL AND expiry_date <= ?")
    .all(now) as ClientRow[];

  let disabled = 0;
  for (const client of expired) {
    if (toggleClient(client.id, false).success) disabled++;
  }
  return { disabled };
}

// ── Get online/active stats ─────────────────────────────────────────────────

export function getOnlineClients(): string[] {
  const stats = queryXrayStats();
  return stats
    .filter((s) => s.upload > 0 || s.download > 0)
    .map((s) => s.email);
}

// ── Summary stats ───────────────────────────────────────────────────────────

export function getClientsSummary(): {
  total: number;
  active: number;
  disabled: number;
  expired: number;
  trafficExceeded: number;
} {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) as c FROM clients").get() as any).c;
  const active = (db.prepare("SELECT COUNT(*) as c FROM clients WHERE enabled = 1").get() as any).c;
  const disabled = (db.prepare("SELECT COUNT(*) as c FROM clients WHERE enabled = 0").get() as any).c;
  const now = new Date().toISOString();
  const expired = (
    db.prepare("SELECT COUNT(*) as c FROM clients WHERE expiry_date IS NOT NULL AND expiry_date <= ?").get(now) as any
  ).c;
  const trafficExceeded = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM clients WHERE traffic_limit > 0 AND (traffic_up + traffic_down) >= traffic_limit"
      )
      .get() as any
  ).c;

  return { total, active, disabled, expired, trafficExceeded };
}

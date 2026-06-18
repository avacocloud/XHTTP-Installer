import { readFileSync, existsSync, writeFileSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";

const INSTALLER_ENV = process.env.INSTALLER_ENV_PATH || "/etc/xhttp-installer/info.env";
const XRAY_CONFIG = process.env.XRAY_CONFIG_PATH || "/usr/local/etc/xray/config.json";

export interface InstallerState {
  domain?: string;
  relayPath?: string;
  uuid?: string;
  platform?: string;
  vercelUrl?: string;
  clientLink?: string;
  [key: string]: string | undefined;
}

export function readInstallerState(): InstallerState {
  if (!existsSync(INSTALLER_ENV)) return {};

  const content = readFileSync(INSTALLER_ENV, "utf-8");
  const state: InstallerState = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    const keyMap: Record<string, string> = {
      CFG_DOMAIN: "domain",
      CFG_RELAY_PATH: "relayPath",
      INBOUND_UUID: "uuid",
      VLESS_UUID: "uuid",
      XHTTP_PATH: "relayPath",
      CFG_PLATFORM: "platform",
      VERCEL_URL: "vercelUrl",
      CLIENT_LINK: "clientLink",
    };

    state[keyMap[key] || key] = value;
  }

  return state;
}

export function readXrayConfig(): object | null {
  if (!existsSync(XRAY_CONFIG)) return null;
  try {
    return JSON.parse(readFileSync(XRAY_CONFIG, "utf-8"));
  } catch {
    return null;
  }
}

export function getConnectionLink(): string | null {
  const state = readInstallerState();
  if (state.clientLink) return state.clientLink;
  if (!state.uuid || !state.domain) return null;

  const path = state.relayPath || "/";
  return `vless://${state.uuid}@${state.domain}:443?encryption=none&security=tls&sni=${state.domain}&type=xhttp&path=${encodeURIComponent(path)}#XHTTP-${state.domain}`;
}

/**
 * Build a config link for a relay host, using CLIENT_LINK as template so all
 * xpadding / alpn / mode / extra params are preserved. Only the host is replaced.
 */
export function buildConfigLinkForHost(host: string, path: string, label: string, customUuid?: string): string {
  const state = readInstallerState();
  const uuid = customUuid || state.uuid;
  if (!uuid) return "";

  if (state.clientLink) {
    try {
      let link = state.clientLink;
      // Replace UUID in vless://UUID@host
      link = link.replace(/(vless:\/\/)[^@]+(@)/, `$1${uuid}$2`);
      // Replace host in vless://uuid@HOST:PORT
      link = link.replace(/(vless:\/\/[^@]+@)[^:]+(:)/, `$1${host}$2`);
      // Replace sni=
      link = link.replace(/([?&]sni=)[^&]+/, `$1${host}`);
      // Replace host= param
      link = link.replace(/([?&]host=)[^&]+/, `$1${host}`);
      // Replace path= param
      link = link.replace(/([?&]path=)[^&#]+/, `$1${encodeURIComponent(path || "/api")}`);
      // Strip extra (xpadding) — relay doesn't need client-side padding params
      link = link.replace(/[?&]extra=[^&#]+/, "");
      // Replace fragment
      link = link.replace(/#[^#]*$/, `#${label}`);
      return link;
    } catch {}
  }

  // Fallback: build from installer state fields
  const xpadding = state["XPADDING"];
  let extra = "";
  if (xpadding) {
    const obj: Record<string, string | boolean> = {
      xPaddingBytes: xpadding,
      xPaddingObfsMode: true,
    };
    if (state["XPADDING_KEY"]) obj.xPaddingKey = state["XPADDING_KEY"];
    if (state["XPADDING_HEADER"]) obj.xPaddingHeader = state["XPADDING_HEADER"];
    if (state["SC_MAX_POST_BYTES"]) obj.scMaxEachPostBytes = state["SC_MAX_POST_BYTES"];
    extra = `&extra=${encodeURIComponent(JSON.stringify(obj))}`;
  }
  return `vless://${uuid}@${host}:443?type=xhttp&security=tls&sni=${host}&host=${host}&fp=chrome&alpn=http/1.1,h2&path=${encodeURIComponent(path || "/api")}&mode=auto&allowInsecure=0${extra}#${label}`;
}

export interface ServerStatus {
  xrayRunning: boolean;
  uptime: string | null;
  sslExpiry: string | null;
  domain: string | null;
}

export function getServerStatus(): ServerStatus {
  const state = readInstallerState();

  let xrayRunning = false;
  let uptime: string | null = null;
  try {
    const output = execSync("systemctl is-active xray 2>/dev/null", { encoding: "utf-8" }).trim();
    xrayRunning = output === "active";
  } catch {
    xrayRunning = false;
  }

  if (xrayRunning) {
    try {
      const statusOutput = execSync("systemctl show xray --property=ActiveEnterTimestamp 2>/dev/null", {
        encoding: "utf-8",
      }).trim();
      const match = statusOutput.match(/ActiveEnterTimestamp=(.+)/);
      if (match) {
        const startTime = new Date(match[1]);
        const diff = Date.now() - startTime.getTime();
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        uptime = `${days}d ${hours}h ${minutes}m`;
      }
    } catch {}
  }

  let sslExpiry: string | null = null;
  if (state.domain) {
    try {
      const output = execSync(
        `echo | openssl s_client -connect ${state.domain}:443 -servername ${state.domain} 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null`,
        { encoding: "utf-8" }
      ).trim();
      const match = output.match(/notAfter=(.+)/);
      if (match) sslExpiry = match[1];
    } catch {}
  }

  return {
    xrayRunning,
    uptime,
    sslExpiry,
    domain: state.domain || null,
  };
}

export function restartXray(): { success: boolean; message: string } {
  try {
    execSync("systemctl restart xray 2>&1", { encoding: "utf-8" });
    return { success: true, message: "Xray restarted successfully" };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

// ── Inbound CRUD ─────────────────────────────────────────────────────────────

export interface XrayInbound {
  tag: string;
  listen: string;
  port: number;
  protocol: string;
  settings: Record<string, any>;
  streamSettings?: Record<string, any>;
  sniffing?: Record<string, any>;
  allocate?: Record<string, any>;
}

function readFullConfig(): Record<string, any> {
  if (!existsSync(XRAY_CONFIG)) return { log: {}, inbounds: [], outbounds: [] };
  try {
    return JSON.parse(readFileSync(XRAY_CONFIG, "utf-8"));
  } catch {
    return { log: {}, inbounds: [], outbounds: [] };
  }
}

function writeConfigAndRestart(config: Record<string, any>): { success: boolean; message: string } {
  // Backup before writing
  if (existsSync(XRAY_CONFIG)) {
    copyFileSync(XRAY_CONFIG, XRAY_CONFIG + ".bak");
  }
  writeFileSync(XRAY_CONFIG, JSON.stringify(config, null, 2), "utf-8");

  // Validate config with xray test
  try {
    execSync(`xray -test -config "${XRAY_CONFIG}" 2>&1`, { encoding: "utf-8", timeout: 10000, cwd: "/root" });
  } catch (err: any) {
    // Config invalid — restore backup
    if (existsSync(XRAY_CONFIG + ".bak")) {
      copyFileSync(XRAY_CONFIG + ".bak", XRAY_CONFIG);
    }
    return { success: false, message: "Invalid config: " + (err.stderr || err.stdout || String(err)).slice(0, 300) };
  }

  return restartXray();
}

export function getInbounds(): XrayInbound[] {
  const config = readFullConfig();
  return config.inbounds || [];
}

export function addInbound(inbound: XrayInbound): { success: boolean; message: string } {
  const config = readFullConfig();
  if (!config.inbounds) config.inbounds = [];

  // Check tag uniqueness
  if (config.inbounds.some((ib: any) => ib.tag === inbound.tag)) {
    return { success: false, message: `Inbound with tag "${inbound.tag}" already exists` };
  }
  // Check port conflict (same listen+port)
  if (config.inbounds.some((ib: any) => ib.port === inbound.port && ib.listen === inbound.listen)) {
    return { success: false, message: `Port ${inbound.port} is already in use` };
  }

  config.inbounds.push(inbound);
  return writeConfigAndRestart(config);
}

export function updateInbound(tag: string, data: Partial<XrayInbound>): { success: boolean; message: string } {
  const config = readFullConfig();
  const idx = (config.inbounds || []).findIndex((ib: any) => ib.tag === tag);
  if (idx === -1) return { success: false, message: `Inbound "${tag}" not found` };

  // Merge — keep tag unchanged
  const existing = config.inbounds[idx];
  config.inbounds[idx] = { ...existing, ...data, tag };

  return writeConfigAndRestart(config);
}

export function deleteInbound(tag: string): { success: boolean; message: string } {
  const config = readFullConfig();
  const before = (config.inbounds || []).length;
  config.inbounds = (config.inbounds || []).filter((ib: any) => ib.tag !== tag);
  if (config.inbounds.length === before) return { success: false, message: `Inbound "${tag}" not found` };

  return writeConfigAndRestart(config);
}

export function addClient(tag: string, client: { id: string; flow?: string; email?: string }): { success: boolean; message: string } {
  const config = readFullConfig();
  const inbound = (config.inbounds || []).find((ib: any) => ib.tag === tag);
  if (!inbound) return { success: false, message: `Inbound "${tag}" not found` };

  if (!inbound.settings) inbound.settings = {};
  if (!inbound.settings.clients) inbound.settings.clients = [];

  // Check UUID uniqueness within inbound
  if (inbound.settings.clients.some((c: any) => c.id === client.id)) {
    return { success: false, message: `Client with UUID "${client.id}" already exists in this inbound` };
  }

  inbound.settings.clients.push({ id: client.id, flow: client.flow || "", email: client.email || "" });
  return writeConfigAndRestart(config);
}

export function removeClient(tag: string, uuid: string): { success: boolean; message: string } {
  const config = readFullConfig();
  const inbound = (config.inbounds || []).find((ib: any) => ib.tag === tag);
  if (!inbound) return { success: false, message: `Inbound "${tag}" not found` };

  const clients = inbound.settings?.clients || [];
  const before = clients.length;
  inbound.settings.clients = clients.filter((c: any) => c.id !== uuid);
  if (inbound.settings.clients.length === before) {
    return { success: false, message: `Client "${uuid}" not found` };
  }

  return writeConfigAndRestart(config);
}

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { execSync, exec } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { readInstallerState } from "../services/xray.service.js";

const router = Router();

// ── Helper ──
function run(cmd: string, timeout = 30000): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, { encoding: "utf-8", timeout, cwd: "/root" }).trim();
    return { ok: true, output };
  } catch (err: any) {
    return { ok: false, output: err.stderr || err.message || String(err) };
  }
}

function cmdExists(name: string): boolean {
  try {
    execSync(`command -v ${name} 2>/dev/null`, { encoding: "utf-8", cwd: "/root" });
    return true;
  } catch {
    return false;
  }
}

// ── GET /setup/status — full setup status for all phases ──
router.get("/status", requireAuth, (_req, res) => {
  const INSTALLER_ENV = process.env.INSTALLER_ENV_PATH || "/etc/xhttp-installer/info.env";

  // Phase 1: System check
  const phase1 = {
    os: run("lsb_release -d -s 2>/dev/null || cat /etc/os-release 2>/dev/null | head -1").output || "Unknown",
    isRoot: process.getuid?.() === 0,
    nodeInstalled: cmdExists("node"),
    nodeVersion: run("node --version 2>/dev/null").output || null,
    npmInstalled: cmdExists("npm"),
    gitInstalled: cmdExists("git"),
    curlInstalled: cmdExists("curl"),
    completed: cmdExists("node") && cmdExists("npm") && cmdExists("git") && cmdExists("curl"),
  };

  // Phase 2: CLI & Tools
  const XRAY_BIN_PATHS = [
    "/usr/local/bin/xray",
    "/usr/local/x-ui/bin/xray",
    "/usr/local/x-ui/bin/xray-linux-amd64",
    "/usr/bin/xray",
  ];
  const xrayBin = XRAY_BIN_PATHS.find((p) => existsSync(p)) || null;
  const xrayInstalled = !!xrayBin || cmdExists("xray");
  const xrayVersionRaw = xrayBin ? run(`${xrayBin} version 2>/dev/null | head -1`).output : run("xray version 2>/dev/null | head -1").output;
  const railwayInstalled = cmdExists("railway");
  const fastlyInstalled = cmdExists("fastly");

  const phase2 = {
    xrayInstalled,
    xrayVersion: xrayVersionRaw || null,
    acmeInstalled: existsSync("/root/.acme.sh/acme.sh") || cmdExists("acme.sh"),
    vercelInstalled: cmdExists("vercel"),
    netlifyInstalled: cmdExists("netlify"),
    azureInstalled: cmdExists("az"),
    railwayInstalled,
    fastlyInstalled,
    completed: xrayInstalled && (existsSync("/root/.acme.sh/acme.sh") || cmdExists("acme.sh")),
  };

  // Phase 3: SSL Certificates
  let sslDomain: string | null = null;
  let sslExpiry: string | null = null;
  let sslValid = false;
  let certPath: string | null = null;

  // Try to get domain from installer state
  if (existsSync(INSTALLER_ENV)) {
    try {
      const content = readFileSync(INSTALLER_ENV, "utf-8");
      const match = content.match(/CFG_DOMAIN=["']?([^"'\n]+)/);
      if (match) sslDomain = match[1];
    } catch {}
  }

  // Fallback: find domain from acme.sh directory (non-IP certs)
  if (!sslDomain && existsSync("/root/.acme.sh")) {
    try {
      const entries = readdirSync("/root/.acme.sh");
      const domainDir = entries.find((d) =>
        !d.startsWith(".") &&
        !d.startsWith("ca") &&
        d !== "deploy" &&
        d !== "notify" &&
        d !== "http.header" &&
        !/^\d+\.\d+\.\d+\.\d+/.test(d) &&
        existsSync(`/root/.acme.sh/${d}/fullchain.cer`)
      );
      if (domainDir) sslDomain = domainDir.replace(/_ecc$/, "");
    } catch {}
  }

  if (sslDomain) {
    // Check local cert files
    const possiblePaths = [
      `/root/.acme.sh/${sslDomain}_ecc/fullchain.cer`,
      `/root/.acme.sh/${sslDomain}/fullchain.cer`,
      `/etc/letsencrypt/live/${sslDomain}/fullchain.pem`,
      `/usr/local/etc/xray/cert.pem`,
    ];
    certPath = possiblePaths.find((p) => existsSync(p)) || null;

    // Check SSL expiry from cert FILE (not network — Xray might not be running yet)
    if (certPath) {
      const sslCheck = run(
        `openssl x509 -noout -enddate -in "${certPath}" 2>/dev/null`
      );
      if (sslCheck.ok) {
        const m = sslCheck.output.match(/notAfter=(.+)/);
        if (m) {
          sslExpiry = m[1];
          sslValid = new Date(m[1]).getTime() > Date.now();
        }
      }
    }
  }

  const phase3 = {
    domain: sslDomain,
    certPath,
    certExists: !!certPath,
    sslExpiry,
    sslValid,
    completed: !!certPath && sslValid,
  };

  // Phase 4: Xray & Service
  let xrayRunning = false;
  let xrayUptime: string | null = null;
  let xrayConfigExists = false;
  let xrayServiceName = "xray";

  const XRAY_CONFIG_PATHS = [
    process.env.XRAY_CONFIG_PATH || "/usr/local/etc/xray/config.json",
    "/usr/local/x-ui/bin/config.json",
    "/etc/xray/config.json",
    "/usr/local/x-ui/bin/config.json",
  ];

  // Check multiple service names (xray, x-ui, hiddify-xray)
  for (const svc of ["xray", "x-ui", "hiddify-xray"]) {
    try {
      const r = execSync(`systemctl is-active ${svc} 2>/dev/null`, { encoding: "utf-8" }).trim();
      if (r === "active") { xrayRunning = true; xrayServiceName = svc; break; }
    } catch {}
  }

  // Also check if xray process is running even without systemd
  if (!xrayRunning) {
    try {
      const r = execSync("pgrep -x xray 2>/dev/null || pgrep -f xray-linux 2>/dev/null", { encoding: "utf-8" }).trim();
      if (r) xrayRunning = true;
    } catch {}
  }

  if (xrayRunning) {
    try {
      const s = execSync(`systemctl show ${xrayServiceName} --property=ActiveEnterTimestamp 2>/dev/null`, { encoding: "utf-8" }).trim();
      const m = s.match(/ActiveEnterTimestamp=(.+)/);
      if (m) {
        const diff = Date.now() - new Date(m[1]).getTime();
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const min = Math.floor((diff % 3600000) / 60000);
        xrayUptime = `${d}d ${h}h ${min}m`;
      }
    } catch {}
  }

  // Check config file exists AND has actual inbounds (not just empty {})
  let xrayConfigReady = false;
  for (const p of XRAY_CONFIG_PATHS) {
    if (existsSync(p)) {
      xrayConfigExists = true;
      try {
        const content = readFileSync(p, "utf-8");
        const parsed = JSON.parse(content);
        if (parsed.inbounds && Array.isArray(parsed.inbounds) && parsed.inbounds.length > 0) {
          xrayConfigReady = true;
        }
      } catch {}
      break;
    }
  }

  const phase4 = {
    xrayRunning,
    xrayUptime,
    xrayConfigExists,
    xrayConfigReady,
    completed: xrayRunning && xrayConfigReady,
  };

  // Overall
  const allCompleted = phase1.completed && phase2.completed && phase3.completed && phase4.completed;

  res.json({
    allCompleted,
    phase1,
    phase2,
    phase3,
    phase4,
  });
});

// ── POST /setup/phase1/run — install base packages ──
router.post("/phase1/run", requireAuth, (_req, res) => {
  try {
    const results: { step: string; ok: boolean; output: string }[] = [];

    if (!cmdExists("curl")) {
      results.push({ step: "curl", ...run("apt-get install -y -qq curl 2>&1") });
    } else {
      results.push({ step: "curl", ok: true, output: "already installed" });
    }

    if (!cmdExists("git")) {
      results.push({ step: "git", ...run("apt-get install -y -qq git 2>&1") });
    } else {
      results.push({ step: "git", ok: true, output: "already installed" });
    }

    if (!cmdExists("node")) {
      results.push({
        step: "nodejs",
        ...run("curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && apt-get install -y -qq nodejs 2>&1", 120000),
      });
    } else {
      results.push({ step: "nodejs", ok: true, output: "already installed" });
    }

    res.json({ success: results.every((r) => r.ok), results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /setup/phase2/install-xray ──
router.post("/phase2/install-xray", requireAuth, (_req, res) => {
  try {
    const result = run("bash -c 'bash <(curl -fsSL https://github.com/XTLS/Xray-install/raw/main/install-release.sh) install' 2>&1", 120000);
    res.json({ success: result.ok, output: result.output });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /setup/phase2/install-acme ──
router.post("/phase2/install-acme", requireAuth, (_req, res) => {
  try {
    const result = run("curl -fsSL https://get.acme.sh | sh -s email=admin@example.com 2>&1", 60000);
    // Verify it actually installed
    const installed = existsSync("/root/.acme.sh/acme.sh");
    res.json({ success: installed, output: result.output });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /setup/phase2/uninstall ──
router.post("/phase2/uninstall", requireAuth, (req, res) => {
  const { tool } = req.body;
  if (!tool) { res.status(400).json({ error: "Tool name is required" }); return; }

  const cmds: Record<string, string> = {
    xray: "bash <(curl -fsSL https://github.com/XTLS/Xray-install/raw/main/install-release.sh) remove 2>&1",
    acme: "~/.acme.sh/acme.sh --uninstall 2>&1 && rm -rf ~/.acme.sh",
    vercel: "npm uninstall -g vercel 2>&1",
    netlify: "npm uninstall -g netlify-cli 2>&1",
    azure: "apt-get remove -y azure-cli 2>&1 || npm uninstall -g azure-cli 2>&1",
    railway: "npm uninstall -g @railway/cli 2>&1 && echo 'Railway CLI removed'",
    fastly: "rm -f /usr/local/bin/fastly 2>&1 && echo 'Fastly CLI removed'",
  };

  const cmd = cmds[tool];
  if (!cmd) { res.status(400).json({ error: `Unknown tool: ${tool}` }); return; }

  try {
    const result = run(cmd, 60000);
    res.json({ success: result.ok, output: result.output });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /setup/phase2/install-cli ──
router.post("/phase2/install-cli", requireAuth, (req, res) => {
  const { tool } = req.body;
  if (!tool) { res.status(400).json({ error: "Tool name is required" }); return; }

  const cmds: Record<string, string> = {
    vercel: "npm install -g vercel 2>&1",
    netlify: "npm install -g netlify-cli 2>&1",
    azure: "curl -sL https://aka.ms/InstallAzureCLIDeb | bash 2>&1",
    railway: "npm install -g @railway/cli 2>&1 && echo 'Railway CLI installed'",
    fastly: "FASTLY_VER=$(curl -s https://api.github.com/repos/fastly/cli/releases/latest | grep -oP 'tag_name.*?v\\K[0-9][^\"]*' | head -1) && curl -fsSL https://github.com/fastly/cli/releases/download/v${FASTLY_VER}/fastly_v${FASTLY_VER}_linux-amd64.tar.gz -o /tmp/fastly.tar.gz && tar -xzf /tmp/fastly.tar.gz -C /usr/local/bin fastly && chmod +x /usr/local/bin/fastly && echo Fastly CLI installed",
  };

  const cmd = cmds[tool];
  if (!cmd) { res.status(400).json({ error: `Unknown tool: ${tool}` }); return; }

  try {
    const result = run(cmd, 120000);
    res.json({ success: result.ok, output: result.output });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Cert issuance state (async because nginx must stop during issue) ──
let certJob: { status: "idle" | "running" | "done" | "error"; output: string } = { status: "idle", output: "" };

// ── POST /setup/phase3/issue-cert ──
router.post("/phase3/issue-cert", requireAuth, (req, res) => {
  const { domain } = req.body;
  if (!domain) { res.status(400).json({ error: "Domain is required" }); return; }
  if (certJob.status === "running") { res.json({ success: true, started: true, message: "Already running" }); return; }

  // Sanitize domain
  const safeDomain = domain.replace(/[^a-zA-Z0-9._-]/g, "");

  // Mark as running and respond IMMEDIATELY (before stopping nginx)
  certJob = { status: "running", output: "" };
  res.json({ success: true, started: true, message: "Certificate issuance started" });

  // Use child_process.exec (async, non-blocking) so Node.js can still serve poll requests
  // IMPORTANT: use ; (not &&) so nginx ALWAYS restarts even if acme.sh fails
  // Clear stale ZeroSSL CA cache, force Let's Encrypt, and listen on IPv4 only
  // (same fixes as Deploy-Ubuntu.sh v1.0.3)
  //
  // IMPORTANT: cleanup() runs in a trap so that even if acme.sh fails, times out,
  // or the script is killed, port 80 is freed and nginx/xray are restarted.
  const script = `
    cleanup() {
      fuser -k 80/tcp 2>/dev/null || true
      sleep 1
      systemctl start nginx 2>/dev/null || true
      systemctl start xray 2>/dev/null || true
    }
    trap cleanup EXIT

    systemctl stop nginx 2>/dev/null; systemctl stop xray 2>/dev/null
    fuser -k 80/tcp 2>/dev/null; sleep 1

    rm -rf /root/.acme.sh/ca 2>/dev/null
    rm -f /root/.acme.sh/account.conf 2>/dev/null
    /root/.acme.sh/acme.sh --set-default-ca --server letsencrypt 2>&1
    /root/.acme.sh/acme.sh --register-account -m admin@${safeDomain} --server letsencrypt 2>&1
    /root/.acme.sh/acme.sh --issue -d ${safeDomain} --standalone --keylength ec-256 --listen-v4 --server letsencrypt --force 2>&1
    exit $?
  `;

  exec(script, { cwd: "/root", timeout: 120000, shell: "/bin/bash" }, (err, stdout, stderr) => {
    // Safety: even if exec timed out and trap didn't fire, force cleanup
    exec("fuser -k 80/tcp 2>/dev/null; sleep 1; systemctl start nginx 2>/dev/null; systemctl start xray 2>/dev/null", { cwd: "/root", shell: "/bin/bash" });
    if (err) {
      certJob = { status: "error", output: stdout || stderr || err.message };
    } else {
      certJob = { status: "done", output: stdout || "Certificate issued successfully" };
    }
  });
});

// ── GET /setup/phase3/cert-status ──
router.get("/phase3/cert-status", requireAuth, (_req, res) => {
  res.json(certJob);
});

// ── POST /setup/phase3/verify-cert ──
router.post("/phase3/verify-cert", requireAuth, (req, res) => {
  const { domain } = req.body;
  if (!domain) { res.status(400).json({ error: "Domain is required" }); return; }

  try {
    const safeDomain = domain.replace(/[^a-zA-Z0-9._-]/g, "");
    // Check cert FILE first (Xray might not be running on 443 yet)
    const certPaths = [
      `/root/.acme.sh/${safeDomain}_ecc/fullchain.cer`,
      `/root/.acme.sh/${safeDomain}/fullchain.cer`,
      `/etc/letsencrypt/live/${safeDomain}/fullchain.pem`,
    ];
    const certFile = certPaths.find((p) => existsSync(p));
    if (certFile) {
      const sslCheck = run(
        `openssl x509 -noout -dates -subject -in "${certFile}" 2>/dev/null`
      );
      res.json({ success: sslCheck.ok, output: sslCheck.output });
    } else {
      // Fallback: try network check (only works if something serves 443)
      const sslCheck = run(
        `echo | openssl s_client -connect ${safeDomain}:443 -servername ${safeDomain} 2>/dev/null | openssl x509 -noout -dates -subject 2>/dev/null`
      );
      res.json({ success: sslCheck.ok, output: sslCheck.output || "No certificate file found and port 443 not responding" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /setup/phase3/clear-cache ──
router.post("/phase3/clear-cache", requireAuth, (_req, res) => {
  try {
    const results = [
      run("/root/.acme.sh/acme.sh --remove -d '*' 2>&1 || true"),
      run("rm -rf /root/.acme.sh/ca 2>&1 || true"),
    ];
    res.json({ success: true, output: "Certificate cache cleared" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /setup/phase4/init-config ──
router.post("/phase4/init-config", requireAuth, (req, res) => {
  const { domain } = req.body;
  if (!domain) { res.status(400).json({ error: "Domain is required" }); return; }

  const safeDomain = domain.replace(/[^a-zA-Z0-9._-]/g, "");
  const XRAY_CONFIG = process.env.XRAY_CONFIG_PATH || "/usr/local/etc/xray/config.json";
  const CERT_DIR = `/etc/ssl/xhttp/${safeDomain}`;

  try {
    // 1. Find acme.sh cert files
    const acmePaths = [
      { cert: `/root/.acme.sh/${safeDomain}_ecc/fullchain.cer`, key: `/root/.acme.sh/${safeDomain}_ecc/${safeDomain}.key` },
      { cert: `/root/.acme.sh/${safeDomain}/fullchain.cer`, key: `/root/.acme.sh/${safeDomain}/${safeDomain}.key` },
    ];
    const found = acmePaths.find((p) => existsSync(p.cert) && existsSync(p.key));
    if (!found) {
      res.status(400).json({ error: "SSL certificate not found. Issue a certificate first (Phase 3)." });
      return;
    }

    // 2. Install certs to /etc/ssl/xhttp/DOMAIN/
    mkdirSync(CERT_DIR, { recursive: true });
    run(`cp "${found.cert}" "${CERT_DIR}/fullchain.pem"`);
    run(`cp "${found.key}" "${CERT_DIR}/privkey.pem"`);
    run(`chmod 644 "${CERT_DIR}/fullchain.pem" "${CERT_DIR}/privkey.pem"`);

    // 3. Generate UUID
    const uuid = randomUUID();

    // 4. Write default Xray config
    const config = {
      log: {
        loglevel: "warning",
        access: "/var/log/xray/access.log",
        error: "/var/log/xray/error.log",
      },
      inbounds: [
        {
          tag: "xhttp-tls",
          listen: "0.0.0.0",
          port: 443,
          protocol: "vless",
          settings: {
            clients: [{ id: uuid, flow: "" }],
            decryption: "none",
          },
          streamSettings: {
            network: "xhttp",
            security: "tls",
            tlsSettings: {
              alpn: ["h2", "http/1.1"],
              certificates: [
                {
                  certificateFile: `${CERT_DIR}/fullchain.pem`,
                  keyFile: `${CERT_DIR}/privkey.pem`,
                },
              ],
            },
            xhttpSettings: {
              path: "/api",
              host: safeDomain,
              mode: "auto",
            },
          },
        },
      ],
      outbounds: [
        { protocol: "freedom", tag: "direct" },
        { protocol: "blackhole", tag: "blocked" },
      ],
    };

    // Ensure config directory exists
    const configDir = XRAY_CONFIG.replace(/\/[^/]+$/, "");
    mkdirSync(configDir, { recursive: true });
    mkdirSync("/var/log/xray", { recursive: true });

    writeFileSync(XRAY_CONFIG, JSON.stringify(config, null, 2), "utf-8");

    // 5. Save domain + UUID to installer env for panel reference
    const ENV_PATH = process.env.INSTALLER_ENV_PATH || "/etc/xhttp-installer/info.env";
    const envDir = ENV_PATH.replace(/\/[^/]+$/, "");
    mkdirSync(envDir, { recursive: true });
    const envContent = [
      `CFG_DOMAIN="${safeDomain}"`,
      `VLESS_UUID="${uuid}"`,
      `XHTTP_PATH="/api"`,
    ].join("\n") + "\n";
    writeFileSync(ENV_PATH, envContent, "utf-8");

    // 6. Restart Xray
    run("systemctl restart xray 2>/dev/null || true");

    res.json({
      success: true,
      output: `Config created. Domain: ${safeDomain}, UUID: ${uuid}, Path: /api`,
      uuid,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /setup/phase4/restart-xray ──
router.post("/phase4/restart-xray", requireAuth, (_req, res) => {
  try {
    const result = run("systemctl restart xray 2>&1");
    res.json({ success: result.ok, output: result.output });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /setup/phase4/test-connection ──
router.post("/phase4/test-connection", requireAuth, (req, res) => {
  const { domain } = req.body;
  if (!domain) { res.status(400).json({ error: "Domain is required" }); return; }

  // Read port from installer state (default 443)
  const state = readInstallerState();
  const port = state.CFG_INBOUND_PORT || "443";
  const path = state.CFG_RELAY_PATH || "/api";
  const safeDomain = domain.replace(/[^a-zA-Z0-9._-]/g, "");

  // Use -k (insecure) to accept self-signed certs, and hit the actual xray port + relay path
  const portSuffix = port === "443" ? "" : `:${port}`;
  const testUrl = `https://${safeDomain}${portSuffix}${path}`;

  try {
    const result = run(
      `curl -sk -o /dev/null -w '%{http_code}|%{time_total}' --max-time 10 "${testUrl}" 2>&1`
    );
    if (result.ok) {
      const parts = result.output.trim().split("|");
      const code = Number(parts[0]) || 0;
      const time = parseFloat(parts[1]) || 0;
      // 4xx from xray = relay is alive (rejects invalid handshake), 2xx = also fine
      res.json({ success: code > 0 && code < 500, statusCode: code, responseTime: time, url: testUrl });
    } else {
      res.json({ success: false, output: result.output, url: testUrl });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

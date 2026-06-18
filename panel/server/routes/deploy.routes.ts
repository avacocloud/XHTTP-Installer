import { Router } from "express";
import { getDb } from "../db/init.js";
import { requireAuth } from "../middleware/auth.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { decrypt } from "../services/crypto.service.js";
import { deployToVercel, deleteVercelProject } from "../services/vercel.service.js";
import { deployToNetlify, deleteNetlifySite } from "../services/netlify.service.js";
import { deployToAzure, deleteAzureDeployment, DeployProgressEvent, AZURE_DEPLOY_STEPS } from "../services/azure.service.js";
import { deployToRailway, deleteRailwayProject, RAILWAY_DEPLOY_STEPS } from "../services/railway.service.js";
import { deployToFastly, deleteFastlyService, FASTLY_DEPLOY_STEPS } from "../services/fastly.service.js";
import { readInstallerState, buildConfigLinkForHost } from "../services/xray.service.js";
import { asyncHandler } from "../utils/helpers.js";

const router = Router();

// If user didn't include a port, append :443
function withPort(domain: string): string {
  return domain.includes(":") ? domain : `${domain}:443`;
}

// ── Progress store for SSE streaming ────────────────────────────────────────
interface StreamEntry {
  listeners: Set<(e: DeployProgressEvent) => void>;
  history: DeployProgressEvent[];
  done: boolean;
}
const deployStreams = new Map<number, StreamEntry>();

function initStream(id: number): StreamEntry {
  const entry: StreamEntry = { listeners: new Set(), history: [], done: false };
  deployStreams.set(id, entry);
  setTimeout(() => deployStreams.delete(id), 15 * 60 * 1000); // auto-cleanup 15 min
  return entry;
}

function emitProgress(id: number, event: DeployProgressEvent) {
  const entry = deployStreams.get(id);
  if (!entry) return;
  entry.history.push(event);
  if (event.status === "error" || (event.status === "done" && event.step === event.total)) {
    entry.done = true;
  }
  entry.listeners.forEach((fn) => fn(event));
}

// SSE endpoint — token passed as query param because EventSource can't set headers
router.get("/:id/stream", (req, res) => {
  const token = req.query.token as string;
  try {
    verifyAccessToken(token);
  } catch {
    res.status(401).end();
    return;
  }

  const id = Number(req.params.id);
  const entry = deployStreams.get(id);
  if (!entry) {
    res.status(404).end();
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (e: DeployProgressEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);

  // Replay history so late-connecting clients catch up
  entry.history.forEach(send);

  if (entry.done) {
    res.end();
    return;
  }

  entry.listeners.add(send);
  const keepalive = setInterval(() => res.write(": keepalive\n\n"), 20000);

  req.on("close", () => {
    clearInterval(keepalive);
    entry.listeners.delete(send);
  });
});

router.get("/", requireAuth, (_req, res) => {
  const db = getDb();
  const deploys = db
    .prepare(
      `SELECT id, platform, project_name, deploy_url, target_domain, relay_path,
              public_path, status, sku, resource_group, created_at, updated_at
       FROM deployments ORDER BY created_at DESC`
    )
    .all();
  res.json(deploys);
});

router.get("/:id", requireAuth, (req, res) => {
  const db = getDb();
  const deploy = db.prepare("SELECT * FROM deployments WHERE id = ?").get(Number(req.params.id));
  if (!deploy) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }
  res.json(deploy);
});

function getTokenData(tokenId: number): { platform: string; data: Record<string, string> } {
  const db = getDb();
  const row = db.prepare("SELECT platform, token_data FROM platform_tokens WHERE id = ?").get(tokenId) as
    | { platform: string; token_data: string }
    | undefined;
  if (!row) throw new Error("Token not found");
  try {
    return { platform: row.platform, data: JSON.parse(decrypt(row.token_data)) };
  } catch {
    throw new Error("Token data is corrupted or cannot be decrypted");
  }
}

// ── Generic SSE-based deploy runner ─────────────────────────────────────────
function runDeployWithSSE(
  deployId: number,
  fn: () => Promise<void>
) {
  (async () => {
    try { await fn(); } catch {}
  })();
}

// ── Vercel ───────────────────────────────────────────────────────────────────
router.post(
  "/vercel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { tokenId, projectName, targetDomain, relayPath, publicPath } = req.body;
    if (!tokenId || !projectName || !targetDomain) {
      res.status(400).json({ error: "tokenId, projectName, and targetDomain are required" });
      return;
    }
    const { data } = getTokenData(tokenId);
    const db = getDb();
    const deployId = Number(
      db.prepare(`INSERT INTO deployments (platform, token_id, project_name, target_domain, relay_path, public_path, status)
         VALUES ('vercel', ?, ?, ?, ?, ?, 'deploying')`)
        .run(tokenId, projectName, targetDomain, relayPath || "/api", publicPath || "/api")
        .lastInsertRowid
    );
    initStream(deployId);
    res.status(202).json({ id: deployId, status: "deploying" });

    runDeployWithSSE(deployId, async () => {
      const TOTAL = 3;
      try {
        emitProgress(deployId, { step: 1, total: TOTAL, label: "Creating Vercel project...", status: "active" });
        const result = await deployToVercel({
          token: data.token, projectName, targetDomain,
          relayPath: relayPath || "/api", publicPath: publicPath || "/api", teamId: data.teamId,
        });
        emitProgress(deployId, { step: 2, total: TOTAL, label: "Finalizing deployment...", status: "active" });

        let configLink: string | null = null;
        try { configLink = buildConfigLinkForHost(new URL(result.url).hostname, publicPath || "/api", `Vercel-${projectName}`); } catch {}
        db.prepare("UPDATE deployments SET status='active', deploy_url=?, config_json=?, updated_at=datetime('now') WHERE id=?")
          .run(result.url, JSON.stringify({ configLink }), deployId);
        db.prepare("INSERT INTO activity_log (action, detail) VALUES (?, ?)").run("deploy", `Deployed ${projectName} to Vercel: ${result.url}`);
        emitProgress(deployId, { step: TOTAL, total: TOTAL, label: "Deployed successfully!", status: "done", url: result.url, config: configLink ?? undefined });
      } catch (err) {
        db.prepare("UPDATE deployments SET status='failed', config_json=?, updated_at=datetime('now') WHERE id=?")
          .run(JSON.stringify({ error: String(err) }), deployId);
        emitProgress(deployId, { step: 1, total: TOTAL, label: "Deployment failed", detail: String(err), status: "error" });
      }
    });
  })
);

// ── Netlify ──────────────────────────────────────────────────────────────────
router.post(
  "/netlify",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { tokenId, projectName, targetDomain, relayPath, publicPath } = req.body;
    if (!tokenId || !projectName || !targetDomain) {
      res.status(400).json({ error: "tokenId, projectName, and targetDomain are required" });
      return;
    }
    const { data } = getTokenData(tokenId);
    const db = getDb();
    const deployId = Number(
      db.prepare(`INSERT INTO deployments (platform, token_id, project_name, target_domain, relay_path, public_path, status)
         VALUES ('netlify', ?, ?, ?, ?, ?, 'deploying')`)
        .run(tokenId, projectName, targetDomain, relayPath || "/api", publicPath || "/api")
        .lastInsertRowid
    );
    initStream(deployId);
    res.status(202).json({ id: deployId, status: "deploying" });

    runDeployWithSSE(deployId, async () => {
      const TOTAL = 3;
      try {
        emitProgress(deployId, { step: 1, total: TOTAL, label: "Creating Netlify site...", status: "active" });
        const result = await deployToNetlify({
          token: data.token, projectName, targetDomain,
          relayPath: relayPath || "/api", publicPath: publicPath || "/api",
        });
        emitProgress(deployId, { step: 2, total: TOTAL, label: "Finalizing deployment...", status: "active" });

        let configLink: string | null = null;
        try { configLink = buildConfigLinkForHost(new URL(result.url).hostname, publicPath || "/api", `Netlify-${projectName}`); } catch {}
        db.prepare("UPDATE deployments SET status='active', deploy_url=?, config_json=?, updated_at=datetime('now') WHERE id=?")
          .run(result.url, JSON.stringify({ siteId: result.siteId, configLink }), deployId);
        db.prepare("INSERT INTO activity_log (action, detail) VALUES (?, ?)").run("deploy", `Deployed ${projectName} to Netlify: ${result.url}`);
        emitProgress(deployId, { step: TOTAL, total: TOTAL, label: "Deployed successfully!", status: "done", url: result.url, config: configLink ?? undefined });
      } catch (err) {
        db.prepare("UPDATE deployments SET status='failed', config_json=?, updated_at=datetime('now') WHERE id=?")
          .run(JSON.stringify({ error: String(err) }), deployId);
        emitProgress(deployId, { step: 1, total: TOTAL, label: "Deployment failed", detail: String(err), status: "error" });
      }
    });
  })
);

// ── Railway ──────────────────────────────────────────────────────────────────
router.post(
  "/railway",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { tokenId, projectName, targetDomain, relayPath, publicPath, region, maxInflight, upstreamTimeoutMs, targetPort } = req.body;
    if (!tokenId || !projectName || !targetDomain) {
      res.status(400).json({ error: "tokenId, projectName, and targetDomain are required" });
      return;
    }
    const { data } = getTokenData(tokenId);
    const db = getDb();
    const deployId = Number(
      db.prepare(`INSERT INTO deployments (platform, token_id, project_name, target_domain, relay_path, public_path, status)
         VALUES ('railway', ?, ?, ?, ?, ?, 'deploying')`)
        .run(tokenId, projectName, targetDomain, relayPath || "/api", publicPath || "/api")
        .lastInsertRowid
    );
    initStream(deployId);
    res.status(202).json({ id: deployId, status: "deploying" });

    runDeployWithSSE(deployId, async () => {
      const TOTAL = RAILWAY_DEPLOY_STEPS;
      try {
        const result = await deployToRailway(
          {
            apiToken: data.apiToken, projectName, targetDomain,
            relayPath: relayPath || "/api", publicPath: publicPath || "/api",
            region: region || undefined,
            targetPort: targetPort ? Number(targetPort) : 443,
            maxInflight: maxInflight ? Number(maxInflight) : undefined,
            upstreamTimeoutMs: upstreamTimeoutMs !== undefined ? Number(upstreamTimeoutMs) : undefined,
          },
          undefined,
          (step, total, label) => emitProgress(deployId, { step, total, label, status: "active" })
        );

        let configLink: string | null = null;
        try { configLink = buildConfigLinkForHost(new URL(result.url).hostname, publicPath || "/api", `Railway-${projectName}`); } catch {}
        db.prepare("UPDATE deployments SET status='active', deploy_url=?, config_json=?, updated_at=datetime('now') WHERE id=?")
          .run(result.url, JSON.stringify({ projectId: result.projectId, configLink }), deployId);
        db.prepare("INSERT INTO activity_log (action, detail) VALUES (?, ?)").run("deploy", `Deployed ${projectName} to Railway: ${result.url}`);
        emitProgress(deployId, { step: TOTAL, total: TOTAL, label: "Deployed successfully!", status: "done", url: result.url, config: configLink ?? undefined });
      } catch (err) {
        db.prepare("UPDATE deployments SET status='failed', config_json=?, updated_at=datetime('now') WHERE id=?")
          .run(JSON.stringify({ error: String(err) }), deployId);
        emitProgress(deployId, { step: 1, total: TOTAL, label: "Deployment failed", detail: String(err), status: "error" });
      }
    });
  })
);

// ── Fastly ───────────────────────────────────────────────────────────────────
router.post(
  "/fastly",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { tokenId, projectName, targetDomain, relayPath, publicPath, customDomain } = req.body;
    if (!tokenId || !projectName || !targetDomain) {
      res.status(400).json({ error: "tokenId, projectName, and targetDomain are required" });
      return;
    }
    const { data } = getTokenData(tokenId);
    const db = getDb();
    const deployId = Number(
      db.prepare(`INSERT INTO deployments (platform, token_id, project_name, target_domain, relay_path, public_path, status)
         VALUES ('fastly', ?, ?, ?, ?, ?, 'deploying')`)
        .run(tokenId, projectName, targetDomain, relayPath || "/api", publicPath || "/api")
        .lastInsertRowid
    );
    initStream(deployId);
    res.status(202).json({ id: deployId, status: "deploying" });

    runDeployWithSSE(deployId, async () => {
      try {
        const result = await deployToFastly(
          { apiToken: data.apiToken, projectName, targetDomain, relayPath: relayPath || "/api", publicPath: publicPath || "/api", customDomain: customDomain || undefined },
          undefined,
          (step, total, label) => emitProgress(deployId, { step, total, label, status: step === total ? "done" : "active" })
        );

        let configLink: string | null = null;
        try { configLink = buildConfigLinkForHost(new URL(result.url).hostname, publicPath || "/api", `Fastly-${projectName}`); } catch {}
        db.prepare("UPDATE deployments SET status='active', deploy_url=?, config_json=?, updated_at=datetime('now') WHERE id=?")
          .run(result.url, JSON.stringify({ serviceId: result.serviceId, configLink }), deployId);
        db.prepare("INSERT INTO activity_log (action, detail) VALUES (?, ?)").run("deploy", `Deployed ${projectName} to Fastly: ${result.url}`);
        // Patch the final step to include url + config
        emitProgress(deployId, { step: FASTLY_DEPLOY_STEPS, total: FASTLY_DEPLOY_STEPS, label: "Fastly service live!", status: "done", url: result.url, config: configLink ?? undefined });
      } catch (err) {
        db.prepare("UPDATE deployments SET status='failed', config_json=?, updated_at=datetime('now') WHERE id=?")
          .run(JSON.stringify({ error: String(err) }), deployId);
        emitProgress(deployId, { step: 1, total: FASTLY_DEPLOY_STEPS, label: "Deployment failed", detail: String(err), status: "error" });
      }
    });
  })
);

router.post(
  "/azure",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { tokenId, projectName, targetDomain, relayPath, publicPath, resourceGroup, sku, location, targetPort, maxInflight, maxUpBps, maxDownBps } = req.body;
    if (!tokenId || !projectName || !targetDomain || !resourceGroup) {
      res.status(400).json({ error: "tokenId, projectName, targetDomain, and resourceGroup are required" });
      return;
    }

    const { data } = getTokenData(tokenId);
    const db = getDb();

    const insertResult = db
      .prepare(
        `INSERT INTO deployments (platform, token_id, project_name, target_domain, relay_path, public_path, status, sku, resource_group)
         VALUES ('azure', ?, ?, ?, ?, ?, 'deploying', ?, ?)`
      )
      .run(tokenId, projectName, targetDomain, relayPath || "/api", publicPath || "/api", sku || "B1", resourceGroup);

    const deployId = Number(insertResult.lastInsertRowid);

    // Init SSE stream BEFORE responding so client can subscribe immediately
    initStream(deployId);

    // Return the deploy ID immediately — client will watch SSE for progress
    res.status(202).json({ id: deployId, status: "deploying" });

    // Pre-compute config link using CLIENT_LINK as template (preserves xpadding/alpn/extra)
    const azureHost = `${projectName}.azurewebsites.net`;
    const configLink = buildConfigLinkForHost(azureHost, publicPath || "/api", `Azure-${projectName}`) || null;

    // Wrap onProgress to inject configLink into the final "done" event
    const progressWithConfig = (event: DeployProgressEvent) => {
      if (event.status === "done" && event.step === event.total && configLink) {
        emitProgress(deployId, { ...event, config: configLink });
      } else {
        emitProgress(deployId, event);
      }
    };

    // Run deployment in background
    (async () => {
      try {
        const result = await deployToAzure(
          {
            appId: data.appId,
            password: data.password,
            tenantId: data.tenantId,
            subscriptionId: data.subscriptionId,
            projectName,
            targetDomain,
            targetPort: targetPort ? Number(targetPort) : undefined,
            relayPath: relayPath || "/api",
            publicPath: publicPath || "/api",
            resourceGroup,
            sku,
            location,
            maxInflight: maxInflight ? Number(maxInflight) : undefined,
            maxUpBps: maxUpBps ? Number(maxUpBps) : undefined,
            maxDownBps: maxDownBps ? Number(maxDownBps) : undefined,
          },
          progressWithConfig
        );

        db.prepare("UPDATE deployments SET status = 'active', deploy_url = ?, config_json = ?, updated_at = datetime('now') WHERE id = ?").run(
          result.url, JSON.stringify({ configLink }), deployId
        );
        db.prepare("INSERT INTO activity_log (action, detail) VALUES (?, ?)").run(
          "deploy", `Deployed ${projectName} to Azure: ${result.url}`
        );
      } catch (err) {
        db.prepare("UPDATE deployments SET status = 'failed', config_json = ?, updated_at = datetime('now') WHERE id = ?").run(
          JSON.stringify({ error: String(err) }), deployId
        );
        // If azure.service didn't emit the error event (unexpected throw), emit it now
        const entry = deployStreams.get(deployId);
        if (entry && !entry.done) {
          emitProgress(deployId, { step: 0, total: AZURE_DEPLOY_STEPS, label: "Deployment failed", detail: String(err), status: "error" });
        }
      }
    })();
  })
);

router.post(
  "/:id/redeploy",
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const deploy = db.prepare("SELECT * FROM deployments WHERE id = ?").get(Number(req.params.id)) as
      | {
          id: number;
          platform: string;
          token_id: number;
          project_name: string;
          target_domain: string;
          relay_path: string;
          public_path: string;
          resource_group: string;
          sku: string;
          config_json: string;
        }
      | undefined;

    if (!deploy) {
      res.status(404).json({ error: "Deployment not found" });
      return;
    }

    const { data } = getTokenData(deploy.token_id);
    db.prepare("UPDATE deployments SET status = 'deploying', updated_at = datetime('now') WHERE id = ?").run(deploy.id);

    try {
      let url: string;

      if (deploy.platform === "vercel") {
        const result = await deployToVercel({
          token: data.token,
          projectName: deploy.project_name,
          targetDomain: deploy.target_domain,
          relayPath: deploy.relay_path,
          publicPath: deploy.public_path,
          teamId: data.teamId,
        });
        url = result.url;
      } else if (deploy.platform === "netlify") {
        const result = await deployToNetlify({
          token: data.token,
          projectName: deploy.project_name,
          targetDomain: deploy.target_domain,
          relayPath: deploy.relay_path,
          publicPath: deploy.public_path,
        });
        url = result.url;
      } else if (deploy.platform === "railway") {
        const cfg = deploy.config_json ? JSON.parse(deploy.config_json) : {};
        const result = await deployToRailway(
          {
            apiToken: data.apiToken,
            projectName: deploy.project_name,
            targetDomain: deploy.target_domain,
            relayPath: deploy.relay_path,
            publicPath: deploy.public_path,
          },
          cfg.projectId
        );
        url = result.url;
      } else if (deploy.platform === "fastly") {
        const cfg = deploy.config_json ? JSON.parse(deploy.config_json) : {};
        const result = await deployToFastly(
          {
            apiToken: data.apiToken,
            projectName: deploy.project_name,
            targetDomain: deploy.target_domain,
            relayPath: deploy.relay_path,
            publicPath: deploy.public_path,
          },
          cfg.serviceId
        );
        url = result.url;
      } else {
        const result = await deployToAzure({
          appId: data.appId,
          password: data.password,
          tenantId: data.tenantId,
          subscriptionId: data.subscriptionId,
          projectName: deploy.project_name,
          targetDomain: deploy.target_domain,
          relayPath: deploy.relay_path,
          publicPath: deploy.public_path,
          resourceGroup: deploy.resource_group,
          sku: deploy.sku,
        });
        url = result.url;
      }

      db.prepare("UPDATE deployments SET status = 'active', deploy_url = ?, updated_at = datetime('now') WHERE id = ?").run(
        url,
        deploy.id
      );

      res.json({ id: deploy.id, url, status: "active" });
    } catch (err) {
      db.prepare("UPDATE deployments SET status = 'failed', updated_at = datetime('now') WHERE id = ?").run(deploy.id);
      res.status(500).json({ error: String(err) });
    }
  })
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const deploy = db
      .prepare("SELECT id, platform, project_name, token_id, config_json, resource_group FROM deployments WHERE id = ?")
      .get(Number(req.params.id)) as
      | { id: number; platform: string; project_name: string; token_id: number; config_json: string; resource_group: string }
      | undefined;

    if (!deploy) {
      res.status(404).json({ error: "Deployment not found" });
      return;
    }

    try {
      const { data } = getTokenData(deploy.token_id);

      if (deploy.platform === "vercel") {
        await deleteVercelProject(data.token, deploy.project_name, data.teamId);
      } else if (deploy.platform === "netlify") {
        const config = deploy.config_json ? JSON.parse(deploy.config_json) : {};
        if (config.siteId) {
          await deleteNetlifySite(data.token, config.siteId);
        }
      } else if (deploy.platform === "railway") {
        const config = deploy.config_json ? JSON.parse(deploy.config_json) : {};
        if (config.projectId) {
          await deleteRailwayProject(data.apiToken, config.projectId);
        }
      } else if (deploy.platform === "fastly") {
        const config = deploy.config_json ? JSON.parse(deploy.config_json) : {};
        if (config.serviceId) {
          await deleteFastlyService(data.apiToken, config.serviceId);
        }
      } else if (deploy.platform === "azure" && deploy.resource_group) {
        await deleteAzureDeployment(
          {
            appId: data.appId,
            password: data.password,
            tenantId: data.tenantId,
            subscriptionId: data.subscriptionId,
          },
          deploy.resource_group
        );
      }
    } catch (err) {
      console.error("Warning: failed to delete remote resource:", err);
    }

    db.prepare("DELETE FROM health_checks WHERE deployment_id = ?").run(deploy.id);
    db.prepare("DELETE FROM deployments WHERE id = ?").run(deploy.id);

    db.prepare("INSERT INTO activity_log (action, detail) VALUES (?, ?)").run(
      "delete_deploy",
      `Deleted ${deploy.platform} deployment: ${deploy.project_name}`
    );

    res.json({ message: "Deployment deleted" });
  })
);

router.get(
  "/:id/health",
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const deploy = db.prepare("SELECT id, deploy_url, public_path FROM deployments WHERE id = ?").get(Number(req.params.id)) as
      | { id: number; deploy_url: string; public_path: string }
      | undefined;

    if (!deploy) {
      res.status(404).json({ error: "Deployment not found" });
      return;
    }
    if (!deploy.deploy_url) {
      res.status(400).json({ error: "Deployment has no URL" });
      return;
    }

    const start = Date.now();
    // Probe the deployed service at its configured public relay path (e.g., /api)
    const base = deploy.deploy_url.replace(/\/$/, "");
    const p = (deploy.public_path || "/").startsWith("/") ? deploy.public_path : `/${deploy.public_path}`;
    const probeUrl = `${base}${p}`;
    try {
      const resp = await fetch(probeUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(10000),
      });
      const responseTime = Date.now() - start;

      db.prepare("INSERT INTO health_checks (deployment_id, status_code, response_time_ms) VALUES (?, ?, ?)").run(
        deploy.id,
        resp.status,
        responseTime
      );

      res.json({ statusCode: resp.status, responseTimeMs: responseTime, url: probeUrl });
    } catch (err) {
      const responseTime = Date.now() - start;
      db.prepare("INSERT INTO health_checks (deployment_id, status_code, response_time_ms) VALUES (?, ?, ?)").run(
        deploy.id,
        0,
        responseTime
      );
      res.json({ statusCode: 0, responseTimeMs: responseTime, error: String(err), url: probeUrl });
    }
  })
);

export default router;

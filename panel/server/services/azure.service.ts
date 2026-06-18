import { readFile, mkdir, rm, cp } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Compiled path: dist/server/services/ → resources at dist/server/resources/azure/
const AZURE_RESOURCES = join(__dirname, "..", "resources", "azure");

export interface AzureCredentials {
  appId: string;
  password: string;
  tenantId: string;
  subscriptionId: string;
}

export interface AzureDeployParams extends AzureCredentials {
  projectName: string;
  targetDomain: string;
  targetPort?: number;
  relayPath: string;
  publicPath: string;
  resourceGroup: string;
  sku?: string;
  location?: string;
  maxInflight?: number;
  maxUpBps?: number;
  maxDownBps?: number;
  upstreamTimeoutMs?: number;
}

export interface DeployProgressEvent {
  step: number;
  total: number;
  label: string;
  detail?: string;
  status: "active" | "done" | "error";
  url?: string;
  config?: string;
}

export interface AzureDeployResult {
  url: string;
  resourceGroup: string;
  appName: string;
  publicPath: string;
}

export const AZURE_DEPLOY_STEPS = 8;

// ── Azure auth ────────────────────────────────────────────────────────────────

async function getAzureToken(creds: AzureCredentials): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: creds.appId,
    client_secret: creds.password,
    scope: "https://management.azure.com/.default",
  });

  const resp = await fetch(
    `https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`,
    { method: "POST", body: params }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Azure auth failed (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as { access_token: string };
  return data.access_token;
}

async function azureRest(
  token: string,
  method: string,
  url: string,
  body?: object | Uint8Array,
  contentType = "application/json"
): Promise<Response> {
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
    },
  };
  if (body instanceof Uint8Array) {
    opts.body = body as unknown as BodyInit;
  } else if (body) {
    opts.body = JSON.stringify(body);
  }
  return fetch(url, opts);
}

const API_RG = "2022-09-01";
const API_WEB = "2023-12-01";

// ── Package builder ───────────────────────────────────────────────────────────

async function buildPackage(params: {
  targetDomain: string;
  relayPath: string;
  publicPath: string;
}): Promise<Buffer> {
  const tempDir = join(tmpdir(), `xhttp-az-${randomBytes(4).toString("hex")}`);
  try {
    await mkdir(tempDir, { recursive: true });

    // Copy index.js, package.json, scripts/, templates/
    await cp(AZURE_RESOURCES, tempDir, { recursive: true });

    // Run prepare-build.mjs to generate public/
    await execFileAsync("node", ["scripts/prepare-build.mjs"], {
      cwd: tempDir,
      env: {
        ...process.env,
        TARGET_DOMAIN: params.targetDomain,
        RELAY_PATH: params.relayPath,
        PUBLIC_RELAY_PATH: params.publicPath,
      },
      timeout: 30_000,
    });

    // Create zip: index.js + package.json + public/
    await execFileAsync("zip", ["-r", "deploy.zip", "index.js", "package.json", "public/"], {
      cwd: tempDir,
      timeout: 60_000,
    });

    return await readFile(join(tempDir, "deploy.zip"));
  } finally {
    rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Main deploy ───────────────────────────────────────────────────────────────

export async function deployToAzure(
  params: AzureDeployParams,
  onProgress?: (event: DeployProgressEvent) => void
): Promise<AzureDeployResult> {
  const emit = (e: DeployProgressEvent) => onProgress?.(e);
  const T = AZURE_DEPLOY_STEPS;

  const sub = params.subscriptionId;
  const rg = params.resourceGroup;
  const location = params.location || "westeurope";
  const sku = params.sku || "B1";
  const alwaysOn = sku !== "F1";
  const appName = params.projectName;
  const planName = `${appName}-plan`;
  const base = `https://management.azure.com/subscriptions/${sub}`;

  const targetDomainFull = params.targetPort
    ? `https://${params.targetDomain}:${params.targetPort}`
    : `https://${params.targetDomain}`;

  // ── Step 1: Auth ──────────────────────────────────────────────────────────
  emit({ step: 1, total: T, label: "Authenticating with Azure", status: "active" });
  let token: string;
  try {
    token = await getAzureToken(params);
  } catch (err) {
    const msg = String(err);
    emit({ step: 1, total: T, label: "Authentication failed", detail: msg, status: "error" });
    throw err;
  }
  emit({ step: 1, total: T, label: "Authenticated with Azure", status: "done" });

  // ── Step 2: Resource Group ────────────────────────────────────────────────
  emit({ step: 2, total: T, label: `Creating Resource Group "${rg}"`, status: "active" });
  const rgResp = await azureRest(token, "PUT", `${base}/resourcegroups/${rg}?api-version=${API_RG}`, { location });
  if (!rgResp.ok && rgResp.status !== 409 && rgResp.status !== 403) {
    const detail = await rgResp.text();
    emit({ step: 2, total: T, label: "Resource Group failed", detail, status: "error" });
    throw new Error(`[Step 2] Failed to create Resource Group: ${detail}`);
  }
  emit({ step: 2, total: T, label: `Resource Group "${rg}" ready`, status: "done" });

  // ── Step 3: App Service Plan ──────────────────────────────────────────────
  emit({ step: 3, total: T, label: `Creating App Service Plan (${sku})`, status: "active" });
  const planResp = await azureRest(
    token, "PUT",
    `${base}/resourceGroups/${rg}/providers/Microsoft.Web/serverfarms/${planName}?api-version=${API_WEB}`,
    {
      location,
      sku: { name: sku, tier: sku === "F1" ? "Free" : "Basic" },
      kind: "linux",
      properties: { reserved: true },
    }
  );
  if (!planResp.ok) {
    const detail = await planResp.text();
    emit({ step: 3, total: T, label: "App Service Plan failed", detail, status: "error" });
    throw new Error(`[Step 3] Failed to create App Service Plan: ${detail}`);
  }
  const plan = (await planResp.json()) as { id: string };
  emit({ step: 3, total: T, label: `App Service Plan "${planName}" ready`, status: "done" });

  // ── Step 4: Web App ───────────────────────────────────────────────────────
  emit({ step: 4, total: T, label: `Creating Web App "${appName}"…`, status: "active" });

  // Emit elapsed-time updates while waiting (Azure can take 1-3 min)
  let elapsed = 0;
  const ticker = setInterval(() => {
    elapsed += 15;
    emit({ step: 4, total: T, label: `Creating Web App "${appName}"… (${elapsed}s)`, status: "active" });
  }, 15_000);

  let appResp: Response;
  try {
    appResp = await azureRest(
      token, "PUT",
      `${base}/resourceGroups/${rg}/providers/Microsoft.Web/sites/${appName}?api-version=${API_WEB}`,
      {
        location,
        kind: "app,linux",
        properties: {
          serverFarmId: plan.id,
          siteConfig: {
            linuxFxVersion: "NODE|20-lts",
            appCommandLine: "node index.js",
            alwaysOn,
            http20Enabled: true,
            webSocketsEnabled: true,
            use32BitWorkerProcess: sku === "F1",
          },
        },
      }
    );
  } finally {
    clearInterval(ticker);
  }

  if (!appResp.ok && appResp.status !== 201 && appResp.status !== 202) {
    const detail = await appResp.text();
    emit({ step: 4, total: T, label: "Web App creation failed", detail, status: "error" });
    throw new Error(`[Step 4] Failed to create Web App: ${detail}`);
  }

  // 202 = Azure is provisioning async — poll until ready
  let hostName: string | undefined;
  if (appResp.status === 202) {
    const asyncOpUrl = appResp.headers.get("azure-asyncoperation") || appResp.headers.get("location");
    if (asyncOpUrl) {
      const asyncDeadline = Date.now() + 5 * 60_000;
      let pollElapsed = 0;
      while (Date.now() < asyncDeadline) {
        await new Promise((r) => setTimeout(r, 10_000));
        pollElapsed += 10;
        emit({ step: 4, total: T, label: `Provisioning Web App… (${elapsed + pollElapsed}s)`, status: "active" });
        const poll = await fetch(asyncOpUrl, { headers: { Authorization: `Bearer ${token}` } });
        const pollData = (await poll.json()) as { status?: string; error?: { message: string } };
        if (pollData.status === "Succeeded") break;
        if (pollData.status === "Failed") {
          const detail = pollData.error?.message || JSON.stringify(pollData);
          emit({ step: 4, total: T, label: "Web App provisioning failed", detail, status: "error" });
          throw new Error(`[Step 4] Web App provisioning failed: ${detail}`);
        }
      }
    }
    // GET the web app after async op to get defaultHostName
    const getResp = await azureRest(token, "GET",
      `${base}/resourceGroups/${rg}/providers/Microsoft.Web/sites/${appName}?api-version=${API_WEB}`);
    const app = (await getResp.json()) as { properties: { defaultHostName: string } };
    hostName = app.properties.defaultHostName;
  } else {
    const app = (await appResp.json()) as { properties: { defaultHostName: string } };
    hostName = app.properties.defaultHostName;
  }

  if (!hostName) hostName = `${appName}.azurewebsites.net`;
  const url = `https://${hostName}`;
  emit({ step: 4, total: T, label: `Web App "${appName}" created`, status: "done" });

  // ── Step 5: App Settings ──────────────────────────────────────────────────
  emit({ step: 5, total: T, label: "Configuring environment variables", status: "active" });
  const settingsResp = await azureRest(
    token, "PUT",
    `${base}/resourceGroups/${rg}/providers/Microsoft.Web/sites/${appName}/config/appsettings?api-version=${API_WEB}`,
    {
      properties: {
        TARGET_DOMAIN: targetDomainFull,
        RELAY_PATH: params.relayPath,
        PUBLIC_RELAY_PATH: params.publicPath,
        UPSTREAM_TIMEOUT_MS: String(params.upstreamTimeoutMs ?? 0),
        MAX_INFLIGHT: String(params.maxInflight ?? 128),
        MAX_UP_BPS: String(params.maxUpBps ?? 0),
        MAX_DOWN_BPS: String(params.maxDownBps ?? 0),
        SCM_DO_BUILD_DURING_DEPLOYMENT: "false",
        ENABLE_ORYX_BUILD: "false",
        WEBSITE_RUN_FROM_PACKAGE: "1",
        WEBSITES_PORT: "8080",
      },
    }
  );
  if (!settingsResp.ok) {
    const detail = await settingsResp.text();
    emit({ step: 5, total: T, label: "Failed to set app settings", detail, status: "error" });
    throw new Error(`[Step 5] Failed to set app settings: ${detail}`);
  }
  emit({ step: 5, total: T, label: "Environment variables configured", status: "done" });

  // ── Step 6: Build package ─────────────────────────────────────────────────
  emit({ step: 6, total: T, label: "Building relay package...", status: "active" });
  let zipBuffer: Buffer;
  try {
    zipBuffer = await buildPackage({
      targetDomain: targetDomainFull,
      relayPath: params.relayPath,
      publicPath: params.publicPath,
    });
  } catch (err) {
    const msg = String(err);
    emit({ step: 6, total: T, label: "Package build failed", detail: msg, status: "error" });
    throw new Error(`[Step 6] Build failed: ${msg}`);
  }
  emit({ step: 6, total: T, label: `Package ready (${(zipBuffer.length / 1024).toFixed(0)} KB)`, status: "done" });

  // ── Step 7: Upload ZIP (retry on 409 — previous deploy still running) ──────
  emit({ step: 7, total: T, label: "Uploading code to Azure (1-2 min)…", status: "active" });
  const zipUrl = `${base}/resourceGroups/${rg}/providers/Microsoft.Web/sites/${appName}/extensions/onedeploy?api-version=${API_WEB}&type=zip&restart=true&clean=false`;
  let deployResp: Response | null = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    deployResp = await azureRest(token, "PUT", zipUrl, zipBuffer, "application/octet-stream");
    if (deployResp.ok || deployResp.status === 202) break;
    if (deployResp.status === 409) {
      emit({ step: 7, total: T, label: `Azure busy — retrying in 20s (attempt ${attempt}/5)…`, status: "active" });
      await new Promise((r) => setTimeout(r, 20_000));
      continue;
    }
    break; // other error — stop retrying
  }
  if (!deployResp || (!deployResp.ok && deployResp.status !== 202)) {
    const detail = await deployResp?.text() ?? "No response";
    emit({ step: 7, total: T, label: "ZIP upload failed", detail, status: "error" });
    throw new Error(`[Step 7] ZIP deploy failed (${deployResp?.status}): ${detail}`);
  }
  emit({ step: 7, total: T, label: "Code uploaded — app restarting", status: "done" });

  // ── Step 8: Health check + relay test ────────────────────────────────────
  emit({ step: 8, total: T, label: "Waiting for app to start…", status: "active" });
  const healthUrl = `${url}/health`;
  const deadline = Date.now() + 3 * 60 * 1000;
  let healthy = false;
  while (Date.now() < deadline) {
    try {
      const hr = await fetch(healthUrl, { signal: AbortSignal.timeout(10_000) });
      if (hr.ok || hr.status < 500) { healthy = true; break; }
    } catch { /* still starting */ }
    await new Promise((r) => setTimeout(r, 8_000));
  }

  if (!healthy) {
    emit({ step: 8, total: T, label: "App deployed — still warming up, check /health in a minute", status: "done", url });
    return { url, resourceGroup: rg, appName, publicPath: params.publicPath };
  }

  // Test relay path (a GET to the public path should be forwarded by the relay)
  emit({ step: 8, total: T, label: "Testing relay path…", status: "active" });
  const relayUrl = `${url}${params.publicPath}`;
  let relayStatusCode = 0;
  let relayDetail = "";
  try {
    const rr = await fetch(relayUrl, { method: "GET", signal: AbortSignal.timeout(15_000) });
    relayStatusCode = rr.status;
    if (relayStatusCode >= 500) {
      relayDetail = (await rr.text()).slice(0, 300);
    }
  } catch (e) {
    relayDetail = String(e);
  }

  if (relayStatusCode === 404) {
    emit({ step: 8, total: T, label: "⚠️ Relay path returned 404 — env vars may not have reloaded yet, wait 1 min and retry", status: "done", url });
  } else if (relayStatusCode >= 500) {
    emit({ step: 8, total: T, label: `⚠️ Relay returned ${relayStatusCode} — check configuration`, detail: relayDetail, status: "done", url });
  } else {
    emit({ step: 8, total: T, label: `✓ App live · relay path active (HTTP ${relayStatusCode || "ok"})`, status: "done", url });
  }

  return { url, resourceGroup: rg, appName, publicPath: params.publicPath };
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteAzureDeployment(
  creds: AzureCredentials,
  resourceGroup: string
): Promise<void> {
  const token = await getAzureToken(creds);
  const resp = await azureRest(
    token, "DELETE",
    `https://management.azure.com/subscriptions/${creds.subscriptionId}/resourcegroups/${resourceGroup}?api-version=${API_RG}`
  );

  // 404 = already deleted, 200/202 = accepted
  if (resp.status === 404) return;
  if (!resp.ok && resp.status !== 202) {
    throw new Error(`Failed to delete RG: ${await resp.text()}`);
  }

  // Azure RG deletion is async — poll until succeeded/failed (max 10 min)
  const pollUrl =
    resp.headers.get("Azure-AsyncOperation") ||
    resp.headers.get("Location");

  if (!pollUrl) return; // no poll URL, fire-and-forget

  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10_000)); // wait 10s
    try {
      const poll = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!poll.ok) break;
      const json = await poll.json().catch(() => ({}));
      const status = (json.status ?? "").toLowerCase();
      if (status === "succeeded") return;
      if (status === "failed" || status === "canceled") {
        throw new Error(`Azure RG deletion ${status}: ${JSON.stringify(json.error ?? {})}`);
      }
      // status === "inprogress" → keep polling
    } catch (err: any) {
      // timeout on individual poll — keep trying
      if (err?.name === "TimeoutError") continue;
      throw err;
    }
  }
  // Timed out but deletion was accepted — Azure will finish in background
}

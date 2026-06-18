import { readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAILWAY_GQL = "https://backboard.railway.app/graphql/v2";
const RAILWAY_HOST = "railway.app";

// ── GraphQL helper ────────────────────────────────────────────────────────────

async function gql<T>(
  token: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const resp = await fetch(RAILWAY_GQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await resp.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  if (!resp.ok) throw new Error(`Railway API HTTP ${resp.status}`);
  return json.data as T;
}

function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// ── Param types ───────────────────────────────────────────────────────────────

export interface RailwayDeployParams {
  apiToken: string;
  projectName: string;
  targetDomain: string;
  relayPath: string;
  publicPath: string;
  region?: string;
  targetPort?: number;
  maxInflight?: number;
  upstreamTimeoutMs?: number;
}

export type RailwayProgressFn = (step: number, total: number, label: string) => void;
export const RAILWAY_DEPLOY_STEPS = 7;

// ── Build archive ─────────────────────────────────────────────────────────────

function buildTarGz(dir: string): Buffer {
  return execFileSync("tar", ["-czf", "-", "-C", dir, "."], {
    timeout: 30_000,
    maxBuffer: 50 * 1024 * 1024,
  }) as unknown as Buffer;
}

// ── deploy ────────────────────────────────────────────────────────────────────

export async function deployToRailway(
  params: RailwayDeployParams,
  existingProjectId?: string,
  onProgress?: RailwayProgressFn
): Promise<{ url: string; projectId: string }> {
  const TOTAL = RAILWAY_DEPLOY_STEPS;
  const emit = (step: number, label: string) => onProgress?.(step, TOTAL, label);
  const tmpDir = mkdtempSync(resolve(tmpdir(), "railway-deploy-"));

  try {
    // ── Step 1: Prepare source files ─────────────────────────────────────────
    emit(1, "Preparing source files...");
    const srcDir = resolve(__dirname, "../resources/railway");
    mkdirSync(resolve(tmpDir, "src"), { recursive: true });

    writeFileSync(resolve(tmpDir, "src/index.js"), readFileSync(resolve(srcDir, "src/index.js"), "utf8"), "utf8");
    writeFileSync(resolve(tmpDir, "package.json"),  readFileSync(resolve(srcDir, "package.json"),  "utf8"), "utf8");

    const deploySection: Record<string, unknown> = {
      startCommand: "node src/index.js",
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
    };
    if (params.region) deploySection.region = params.region;

    const railwayCfg: Record<string, unknown> = {
      $schema: "https://schema.railway.app/railway.schema.json",
      build: { builder: "NIXPACKS" },
      deploy: deploySection,
    };
    writeFileSync(resolve(tmpDir, "railway.json"), JSON.stringify(railwayCfg, null, 2), "utf8");

    // ── Step 2: Create / link project ────────────────────────────────────────
    emit(2, "Creating Railway project...");

    const meData = await gql<{ me: { workspaces: Array<{ id: string }> } }>(
      params.apiToken,
      `{ me { workspaces { id } } }`
    );
    const workspaceId = meData.me?.workspaces?.[0]?.id;

    let projectId: string;

    if (existingProjectId && isUUID(existingProjectId)) {
      projectId = existingProjectId;
    } else {
      try {
        const listData = await gql<{
          projects: { edges: Array<{ node: { id: string; name: string } }> };
        }>(params.apiToken, `{ projects { edges { node { id name } } } }`);
        if (listData.projects?.edges?.length >= 2) {
          throw new Error(
            "Railway free plan limit: you already have 2+ projects. Delete an existing project first, then try again."
          );
        }
      } catch (err: any) {
        if (err.message.includes("free plan") || err.message.includes("Delete an existing")) throw err;
      }

      const createInput: Record<string, unknown> = { name: params.projectName };
      if (workspaceId) createInput.workspaceId = workspaceId;

      const projData = await gql<{ projectCreate: { id: string } }>(
        params.apiToken,
        `mutation($input: ProjectCreateInput!) { projectCreate(input: $input) { id } }`,
        { input: createInput }
      );
      projectId = projData.projectCreate.id;
    }

    // ── Step 3: Create service ────────────────────────────────────────────────
    emit(3, "Creating service...");
    let serviceId: string;
    try {
      const svcData = await gql<{ serviceCreate: { id: string } }>(
        params.apiToken,
        `mutation($input: ServiceCreateInput!) { serviceCreate(input: $input) { id } }`,
        { input: { projectId, name: "relay" } }
      );
      serviceId = svcData.serviceCreate.id;
    } catch {
      const projData = await gql<{
        project: { services: { edges: Array<{ node: { id: string } }> } };
      }>(
        params.apiToken,
        `query($id: String!) { project(id: $id) { services { edges { node { id } } } } }`,
        { id: projectId }
      );
      const existing = projData.project?.services?.edges?.[0]?.node?.id;
      if (!existing) throw new Error("Could not create or find service");
      serviceId = existing;
    }

    // ── Step 4: Get environment ID ────────────────────────────────────────────
    const envData = await gql<{
      project: { environments: { edges: Array<{ node: { id: string; name: string } }> } };
    }>(
      params.apiToken,
      `query($id: String!) { project(id: $id) { environments { edges { node { id name } } } } }`,
      { id: projectId }
    );
    const envEdge =
      envData.project?.environments?.edges?.find((e) => e.node.name === "production") ??
      envData.project?.environments?.edges?.[0];
    if (!envEdge) throw new Error("No environment found for project");
    const environmentId = envEdge.node.id;

    // ── Step 5: Set variables BEFORE upload (skipDeploys: true) ────────────────
    // Region is already embedded in railway.json inside the archive.
    const targetUrl = params.targetDomain.includes("://")
      ? params.targetDomain.replace(/\/$/, "")
      : `https://${params.targetDomain}:${params.targetPort || 443}`;

    emit(5, `Setting environment variables (TARGET=${targetUrl})...`);

    const variables: Record<string, string> = {
      TARGET_DOMAIN: targetUrl,
      RELAY_PATH: params.relayPath,
      PUBLIC_RELAY_PATH: params.publicPath,
    };
    if (params.maxInflight !== undefined && params.maxInflight > 0) {
      variables.MAX_INFLIGHT = String(params.maxInflight);
    }
    if (params.upstreamTimeoutMs !== undefined) {
      variables.UPSTREAM_TIMEOUT_MS = String(params.upstreamTimeoutMs);
    }

    await gql(
      params.apiToken,
      `mutation($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }`,
      { input: { projectId, environmentId, serviceId, variables, skipDeploys: true } }
    );

    // ── Step 6: Upload source code → single deployment with all vars set ──────
    emit(6, "Uploading & building code (1-2 min)...");

    const archive = buildTarGz(tmpDir);
    const uploadUrl = `https://backboard.${RAILWAY_HOST}/project/${projectId}/environment/${environmentId}/up?serviceId=${serviceId}`;
    const uploadResp = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiToken}`,
        "Content-Type": "application/gzip",
      },
      body: archive as unknown as BodyInit,
    });

    if (!uploadResp.ok) {
      const body = await uploadResp.text().catch(() => "");
      throw new Error(`Railway upload failed (${uploadResp.status}): ${body}`);
    }

    // ── Step 7: Generate public domain ───────────────────────────────────────
    emit(7, "Generating public domain...");

    let url = "";
    try {
      const domainData = await gql<{ serviceDomainCreate: { domain: string } }>(
        params.apiToken,
        `mutation($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { id domain } }`,
        { input: { environmentId, serviceId } }
      );
      if (domainData.serviceDomainCreate?.domain) {
        url = `https://${domainData.serviceDomainCreate.domain}`;
      }
    } catch {
      // Domain may already exist — query it
      try {
        const svcData = await gql<{
          project: {
            services: {
              edges: Array<{
                node: { domains: { serviceDomains: Array<{ domain: string }> } };
              }>;
            };
          };
        }>(
          params.apiToken,
          `query($id: String!) {
            project(id: $id) {
              services { edges { node { domains { serviceDomains { domain } } } } }
            }
          }`,
          { id: projectId }
        );
        const d =
          svcData.project?.services?.edges?.[0]?.node?.domains?.serviceDomains?.[0]?.domain;
        if (d) url = `https://${d}`;
      } catch {}
    }

    if (!url) url = `https://${params.projectName}.up.railway.app`;

    emit(7, `Railway service live: ${url}`);
    return { url, projectId };

  } finally {
    try { rmSync(tmpDir, { recursive: true }); } catch {}
  }
}

// ── change region ────────────────────────────────────────────────────────────
// Re-uploads the relay code with a new railway.json containing the chosen region.
// This triggers a redeploy in the new region without changing any other settings.

export async function changeRailwayRegion(
  apiToken: string,
  projectId: string,
  newRegion: string
): Promise<void> {
  // Get service + env from existing project
  const projData = await gql<{
    project: {
      services: { edges: Array<{ node: { id: string } }> };
      environments: { edges: Array<{ node: { id: string; name: string } }> };
    };
  }>(
    apiToken,
    `query($id: String!) {
      project(id: $id) {
        services { edges { node { id } } }
        environments { edges { node { id name } } }
      }
    }`,
    { id: projectId }
  );

  const serviceId = projData.project?.services?.edges?.[0]?.node?.id;
  if (!serviceId) throw new Error("No service found in project");

  const envEdge =
    projData.project?.environments?.edges?.find((e) => e.node.name === "production") ??
    projData.project?.environments?.edges?.[0];
  if (!envEdge) throw new Error("No environment found in project");
  const environmentId = envEdge.node.id;

  // Build minimal archive with new region in railway.json
  const tmpDir = mkdtempSync(resolve(tmpdir(), "railway-region-"));
  try {
    const srcDir = resolve(__dirname, "../resources/railway");
    mkdirSync(resolve(tmpDir, "src"), { recursive: true });
    writeFileSync(resolve(tmpDir, "src/index.js"), readFileSync(resolve(srcDir, "src/index.js"), "utf8"), "utf8");
    writeFileSync(resolve(tmpDir, "package.json"),  readFileSync(resolve(srcDir, "package.json"),  "utf8"), "utf8");
    writeFileSync(
      resolve(tmpDir, "railway.json"),
      JSON.stringify({
        $schema: "https://schema.railway.app/railway.schema.json",
        build: { builder: "NIXPACKS" },
        deploy: {
          startCommand: "node src/index.js",
          restartPolicyType: "ON_FAILURE",
          restartPolicyMaxRetries: 10,
          region: newRegion,
        },
      }, null, 2),
      "utf8"
    );

    const archive = buildTarGz(tmpDir);
    const uploadUrl = `https://backboard.${RAILWAY_HOST}/project/${projectId}/environment/${environmentId}/up?serviceId=${serviceId}`;
    const resp = await fetch(uploadUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/gzip" },
      body: archive as unknown as BodyInit,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Region redeploy failed (${resp.status}): ${body}`);
    }
  } finally {
    try { rmSync(tmpDir, { recursive: true }); } catch {}
  }
}

// ── delete ────────────────────────────────────────────────────────────────────

export async function deleteRailwayProject(
  apiToken: string,
  projectId: string
): Promise<void> {
  try {
    let targetId = projectId;
    if (!isUUID(targetId)) {
      const data = await gql<{
        projects: { edges: Array<{ node: { id: string; name: string } }> };
      }>(apiToken, `{ projects { edges { node { id name } } } }`);
      const found = data.projects?.edges?.find(
        (e) => e.node.name === targetId || e.node.id === targetId
      );
      if (found) targetId = found.node.id;
    }
    if (isUUID(targetId)) {
      await gql(apiToken, `mutation { projectDelete(id: "${targetId}") }`);
    }
  } catch {}
}

// ── test token ────────────────────────────────────────────────────────────────

export async function testRailwayToken(
  apiToken: string
): Promise<{ valid: boolean; detail: string }> {
  try {
    const data = await gql<{ me: { id: string; name: string; email: string } }>(
      apiToken,
      `{ me { id name email } }`
    );
    if (data?.me) {
      const who = data.me.name || data.me.email || data.me.id;
      return { valid: true, detail: `Railway account: ${who}` };
    }
    return { valid: false, detail: "Could not verify token" };
  } catch (err: any) {
    return { valid: false, detail: String(err).slice(0, 200) };
  }
}

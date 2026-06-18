import { readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync, execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FASTLY_API = "https://api.fastly.com";

// ── CLI helpers ───────────────────────────────────────────────────────────────

function findFastlyBin(): string | null {
  const candidates = ["/usr/local/bin/fastly", "/usr/bin/fastly"];
  for (const p of candidates) {
    try { execFileSync(p, ["version"], { timeout: 5000 }); return p; } catch {}
  }
  try {
    const w = execSync("which fastly 2>/dev/null", { timeout: 5000, encoding: "utf8" }).trim();
    if (w) return w;
  } catch {}
  try {
    const prefix = execSync("npm config get prefix 2>/dev/null", { timeout: 5000, encoding: "utf8" }).trim();
    if (prefix) {
      const p = `${prefix}/bin/fastly`;
      execFileSync(p, ["version"], { timeout: 5000 });
      return p;
    }
  } catch {}
  return null;
}

function runFastly(args: string[], cwd: string, token: string): string {
  const bin = findFastlyBin();
  if (!bin) {
    throw new Error(
      "Fastly CLI not installed. Go to Initial Setup → Phase 2 → Fastly CLI → Install."
    );
  }
  try {
    return execFileSync(bin, args, {
      cwd,
      encoding: "utf8",
      timeout: 300_000, // 5 min — WASM build can be slow
      env: {
        ...process.env,
        FASTLY_API_TOKEN: token,
        NO_COLOR: "1",
        CI: "1",
      },
    });
  } catch (err: any) {
    const msg = (err.stderr || err.stdout || err.message || String(err)).trim();
    throw new Error(msg);
  }
}

// ── Param types ───────────────────────────────────────────────────────────────

export interface FastlyDeployParams {
  apiToken: string;
  projectName: string;
  targetDomain: string;
  relayPath: string;
  publicPath: string;
  customDomain?: string;
}

export type FastlyProgressFn = (step: number, total: number, label: string) => void;

export const FASTLY_DEPLOY_STEPS = 4;

// ── deploy ────────────────────────────────────────────────────────────────────

export async function deployToFastly(
  params: FastlyDeployParams,
  existingServiceId?: string,
  onProgress?: FastlyProgressFn
): Promise<{ url: string; serviceId: string }> {
  const TOTAL = FASTLY_DEPLOY_STEPS;
  const emit = (step: number, label: string) => onProgress?.(step, TOTAL, label);

  const tmpDir = mkdtempSync(resolve(tmpdir(), "fastly-deploy-"));

  try {
    // Step 1 — write source files + package.json + fastly.toml
    emit(1, "Preparing build files...");

    const srcDir = resolve(__dirname, "../resources/fastly");
    mkdirSync(resolve(tmpDir, "src"), { recursive: true });
    mkdirSync(resolve(tmpDir, "bin"), { recursive: true });

    writeFileSync(
      resolve(tmpDir, "src/index.js"),
      readFileSync(resolve(srcDir, "src/index.js"), "utf8"),
      "utf8"
    );

    const safeName = params.projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-");

    // Comma-separated in ONE --env flag — required by js-compute-runtime
    const envStr = [
      `TARGET_DOMAIN=https://${params.targetDomain.includes(":") ? params.targetDomain : params.targetDomain + ":443"}`,
      `PUBLIC_RELAY_PATH=${params.publicPath}`,
      `RELAY_PATH=${params.relayPath}`,
    ].join(",");

    const pkg = {
      name: safeName,
      private: true,
      type: "module",
      scripts: { build: `js-compute-runtime --env ${envStr} ./src/index.js ./bin/main.wasm` },
      devDependencies: { "@fastly/js-compute": "^3.29.2" },
    };
    writeFileSync(resolve(tmpDir, "package.json"), JSON.stringify(pkg, null, 2), "utf8");

    const tomlLines = [
      `authors = ["avaco"]`,
      `description = "avaco relay for ${safeName}"`,
      `language = "javascript"`,
      `manifest_version = 3`,
      `name = "${safeName}"`,
      ...(existingServiceId ? [`service_id = "${existingServiceId}"`] : []),
      ``,
      `[scripts]`,
      `  build = "npm run build"`,
      `  post_init = "npm install"`,
    ];
    writeFileSync(resolve(tmpDir, "fastly.toml"), tomlLines.join("\n"), "utf8");

    // Step 2 — npm install
    emit(2, "Installing npm dependencies...");
    execFileSync("npm", ["install"], {
      cwd: tmpDir,
      encoding: "utf8",
      timeout: 120_000,
      env: { ...process.env },
    });

    // Step 3 — fastly compute publish (build WASM + upload + activate)
    // Use publish for both new and existing services — it handles both cases
    // with --service-id for updates and creates a new one otherwise.
    emit(3, "Building WebAssembly & deploying to Fastly (2-4 min)...");
    const publishArgs = [
      "compute", "publish",
      "--token", params.apiToken,
      "--non-interactive",
    ];
    if (existingServiceId) publishArgs.push("--service-id", existingServiceId);
    if (params.customDomain) {
      publishArgs.push("--domain", `${params.customDomain}.edgecompute.app`);
    }

    const output = runFastly(publishArgs, tmpDir, params.apiToken);

    // Read service_id written back to fastly.toml by CLI
    let serviceId = existingServiceId || "";
    try {
      const updatedToml = readFileSync(resolve(tmpDir, "fastly.toml"), "utf8");
      const m = updatedToml.match(/service_id\s*=\s*"([^"]+)"/);
      if (m) serviceId = m[1];
    } catch {}

    // Fallback: parse service ID from CLI output (e.g. "Service ID: xxxx" or "service_id = xxxx")
    if (!serviceId) {
      const sidMatch = output.match(/(?:Service\s+ID|service_id)\s*[:=]\s*"?([a-zA-Z0-9]{20,})"?/i);
      if (sidMatch) serviceId = sidMatch[1];
    }

    // Fallback: list services via API and match by name
    if (!serviceId) {
      try {
        const resp = await fetch(`${FASTLY_API}/service?direction=desc&page=1&per_page=5&sort=created_at`, {
          headers: { "Fastly-Key": params.apiToken, Accept: "application/json" },
        });
        if (resp.ok) {
          const services = (await resp.json()) as Array<{ id: string; name: string }>;
          const match = services.find((s) => s.name === safeName);
          if (match) serviceId = match.id;
        }
      } catch {}
    }

    // Parse domain from CLI output
    let url = "";
    const domainMatch = output.match(/https?:\/\/[\w-]+\.edgecompute\.app/);
    if (domainMatch) url = domainMatch[0];

    // Fallback: query Fastly API
    if (!url && serviceId) {
      try {
        const resp = await fetch(`${FASTLY_API}/service/${serviceId}/domain`, {
          headers: { "Fastly-Key": params.apiToken, Accept: "application/json" },
        });
        if (resp.ok) {
          const domains = (await resp.json()) as Array<{ name: string }>;
          if (domains.length > 0) url = `https://${domains[0].name}`;
        }
      } catch {}
    }

    if (!url) url = `https://${safeName}.edgecompute.app`;

    // Step 4 — done
    emit(4, `Fastly service live: ${url}`);
    return { url, serviceId };
  } finally {
    try { rmSync(tmpDir, { recursive: true }); } catch {}
  }
}

// ── delete ────────────────────────────────────────────────────────────────────

export async function deleteFastlyService(
  apiToken: string,
  serviceId: string
): Promise<void> {
  try {
    await fetch(`${FASTLY_API}/service/${serviceId}`, {
      method: "DELETE",
      headers: { "Fastly-Key": apiToken, Accept: "application/json" },
    });
  } catch {}
}

// ── test token ────────────────────────────────────────────────────────────────

export async function testFastlyToken(
  apiToken: string
): Promise<{ valid: boolean; detail: string }> {
  try {
    const resp = await fetch(`${FASTLY_API}/current_user`, {
      headers: { "Fastly-Key": apiToken, Accept: "application/json" },
    });
    if (resp.ok) {
      const user = (await resp.json()) as { name?: string; login?: string; id?: string };
      const name = user.name || user.login || user.id || "unknown";
      return { valid: true, detail: `Fastly account: ${name}` };
    }
    return { valid: false, detail: `HTTP ${resp.status}` };
  } catch (err: any) {
    return { valid: false, detail: String(err).slice(0, 200) };
  }
}

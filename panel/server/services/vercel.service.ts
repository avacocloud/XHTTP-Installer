import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERCEL_DEPLOY_DIR = resolve(__dirname, "../../deploy/vercel");

interface VercelFile {
  file: string;
  data: string;
  encoding: "base64";
}

function collectFiles(dir: string, base: string = dir): VercelFile[] {
  const files: VercelFile[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".vercel") continue;
    const fullPath = resolve(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectFiles(fullPath, base));
    } else {
      files.push({
        file: relative(base, fullPath),
        data: readFileSync(fullPath).toString("base64"),
        encoding: "base64",
      });
    }
  }
  return files;
}

export interface VercelDeployParams {
  token: string;
  projectName: string;
  targetDomain: string;
  relayPath: string;
  publicPath: string;
  teamId?: string;
}

export async function deployToVercel(params: VercelDeployParams): Promise<{ url: string; deployId: string }> {
  const files = collectFiles(resolve(__dirname, "../..", "deploy/vercel"));

  const envVars: Record<string, string> = {
    TARGET_DOMAIN: `https://${params.targetDomain.includes(":") ? params.targetDomain : params.targetDomain + ":443"}`,
    RELAY_PATH: params.relayPath,
    PUBLIC_RELAY_PATH: params.publicPath,
  };

  const body = {
    name: params.projectName,
    files,
    projectSettings: {
      framework: null,
    },
    env: envVars,
  };

  const url = params.teamId
    ? `https://api.vercel.com/v13/deployments?teamId=${params.teamId}`
    : "https://api.vercel.com/v13/deployments";

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Vercel deploy failed (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as { id: string; url: string };
  return { url: `https://${data.url}`, deployId: data.id };
}

export async function deleteVercelProject(token: string, projectName: string, teamId?: string): Promise<void> {
  const url = teamId
    ? `https://api.vercel.com/v9/projects/${projectName}?teamId=${teamId}`
    : `https://api.vercel.com/v9/projects/${projectName}`;

  const resp = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok && resp.status !== 404) {
    const text = await resp.text();
    throw new Error(`Vercel delete failed (${resp.status}): ${text}`);
  }
}

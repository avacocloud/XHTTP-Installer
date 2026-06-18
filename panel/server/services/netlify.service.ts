import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface FileDigest {
  path: string;
  fullPath: string;
  sha1: string;
}

function collectFiles(dir: string, base: string = dir): FileDigest[] {
  const files: FileDigest[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".netlify") continue;
    const fullPath = resolve(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectFiles(fullPath, base));
    } else {
      const content = readFileSync(fullPath);
      const sha1 = createHash("sha1").update(content).digest("hex");
      files.push({ path: `/${relative(base, fullPath)}`, fullPath, sha1 });
    }
  }
  return files;
}

export interface NetlifyDeployParams {
  token: string;
  projectName: string;
  targetDomain: string;
  relayPath: string;
  publicPath: string;
}

export async function deployToNetlify(params: NetlifyDeployParams): Promise<{ url: string; siteId: string }> {
  const headers = {
    Authorization: `Bearer ${params.token}`,
    "Content-Type": "application/json",
  };

  // Create or get site
  let siteId: string;
  const listResp = await fetch(
    `https://api.netlify.com/api/v1/sites?name=${params.projectName}`,
    { headers }
  );
  const sites = (await listResp.json()) as Array<{ id: string; name: string }>;
  const existing = sites.find((s) => s.name === params.projectName);

  if (existing) {
    siteId = existing.id;
  } else {
    let siteName = params.projectName;
    let createResp = await fetch("https://api.netlify.com/api/v1/sites", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: siteName }),
    });
    if (!createResp.ok && createResp.status === 422) {
      const suffix = Math.random().toString(36).slice(2, 8);
      siteName = `${params.projectName}-${suffix}`;
      createResp = await fetch("https://api.netlify.com/api/v1/sites", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: siteName }),
      });
    }
    if (!createResp.ok) {
      const text = await createResp.text();
      throw new Error(`Netlify site creation failed (${createResp.status}): ${text}`);
    }
    const site = (await createResp.json()) as { id: string };
    siteId = site.id;
  }

  // Set env vars
  const envVars = [
    { key: "TARGET_DOMAIN", values: [{ value: `https://${params.targetDomain.includes(":") ? params.targetDomain : params.targetDomain + ":443"}`, context: "all" }] },
    { key: "RELAY_PATH", values: [{ value: params.relayPath, context: "all" }] },
    { key: "PUBLIC_RELAY_PATH", values: [{ value: params.publicPath, context: "all" }] },
  ];

  for (const env of envVars) {
    await fetch(`https://api.netlify.com/api/v1/accounts/me/env?site_id=${siteId}`, {
      method: "POST",
      headers,
      body: JSON.stringify([env]),
    });
  }

  // Collect files and create deploy
  const netlifyDir = resolve(__dirname, "../..", "deploy/netlify");
  const files = collectFiles(netlifyDir);

  const fileDigests: Record<string, string> = {};
  for (const f of files) {
    fileDigests[f.path] = f.sha1;
  }

  const deployResp = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
    method: "POST",
    headers,
    body: JSON.stringify({ files: fileDigests }),
  });

  if (!deployResp.ok) {
    const text = await deployResp.text();
    throw new Error(`Netlify deploy failed (${deployResp.status}): ${text}`);
  }

  const deploy = (await deployResp.json()) as { id: string; required: string[]; ssl_url: string };

  // Upload required files
  for (const sha of deploy.required || []) {
    const file = files.find((f) => f.sha1 === sha);
    if (!file) continue;

    await fetch(`https://api.netlify.com/api/v1/deploys/${deploy.id}/files${file.path}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${params.token}`,
        "Content-Type": "application/octet-stream",
      },
      body: readFileSync(file.fullPath),
    });
  }

  return { url: deploy.ssl_url || `https://${params.projectName}.netlify.app`, siteId };
}

export async function deleteNetlifySite(token: string, siteId: string): Promise<void> {
  const resp = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok && resp.status !== 404) {
    const text = await resp.text();
    throw new Error(`Netlify delete failed (${resp.status}): ${text}`);
  }
}

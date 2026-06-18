import { Router } from "express";
import { getDb } from "../db/init.js";
import { requireAuth } from "../middleware/auth.js";
import { encrypt, decrypt } from "../services/crypto.service.js";
import { asyncHandler } from "../utils/helpers.js";
import { testRailwayToken } from "../services/railway.service.js";
import { testFastlyToken } from "../services/fastly.service.js";

const router = Router();

function maskToken(value: string): string {
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

router.get("/", requireAuth, (_req, res) => {
  const db = getDb();
  const tokens = db
    .prepare("SELECT id, platform, label, is_active, created_at, updated_at FROM platform_tokens ORDER BY platform, created_at DESC")
    .all() as Array<{ id: number; platform: string; label: string; is_active: number; created_at: string; updated_at: string }>;

  const result = tokens.map((t) => {
    try {
      const raw = decrypt(
        (db.prepare("SELECT token_data FROM platform_tokens WHERE id = ?").get(t.id) as { token_data: string }).token_data
      );
      const parsed = JSON.parse(raw);
      const masked: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        masked[k] = maskToken(String(v));
      }
      return { ...t, maskedData: masked };
    } catch {
      return { ...t, maskedData: {} };
    }
  });

  res.json(result);
});

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { platform, label, tokenData } = req.body;
    if (!platform || !label || !tokenData) {
      res.status(400).json({ error: "platform, label, and tokenData are required" });
      return;
    }

    const validPlatforms = ["vercel", "netlify", "azure", "railway", "fastly"];
    if (!validPlatforms.includes(platform)) {
      res.status(400).json({ error: "Invalid platform. Must be: vercel, netlify, azure, railway, or fastly" });
      return;
    }

    const db = getDb();
    const encrypted = encrypt(JSON.stringify(tokenData));

    const result = db
      .prepare("INSERT INTO platform_tokens (platform, label, token_data) VALUES (?, ?, ?)")
      .run(platform, label, encrypted);

    db.prepare("INSERT INTO activity_log (action, detail) VALUES (?, ?)").run(
      "add_token",
      `Added ${platform} token: ${label}`
    );

    res.status(201).json({ id: result.lastInsertRowid, platform, label });
  })
);

router.put(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { label, tokenData } = req.body;

    const db = getDb();
    const existing = db.prepare("SELECT id FROM platform_tokens WHERE id = ?").get(Number(id));
    if (!existing) {
      res.status(404).json({ error: "Token not found" });
      return;
    }

    if (tokenData) {
      const encrypted = encrypt(JSON.stringify(tokenData));
      db.prepare("UPDATE platform_tokens SET token_data = ?, updated_at = datetime('now') WHERE id = ?").run(
        encrypted,
        Number(id)
      );
    }
    if (label) {
      db.prepare("UPDATE platform_tokens SET label = ?, updated_at = datetime('now') WHERE id = ?").run(
        label,
        Number(id)
      );
    }

    res.json({ message: "Token updated" });
  })
);

router.delete("/:id", requireAuth, (_req, res) => {
  const db = getDb();
  const { id } = _req.params;

  const existing = db.prepare("SELECT id, platform, label FROM platform_tokens WHERE id = ?").get(Number(id)) as
    | { id: number; platform: string; label: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: "Token not found" });
    return;
  }

  db.prepare("UPDATE deployments SET token_id = NULL WHERE token_id = ?").run(Number(id));
  db.prepare("DELETE FROM platform_tokens WHERE id = ?").run(Number(id));
  db.prepare("INSERT INTO activity_log (action, detail) VALUES (?, ?)").run(
    "delete_token",
    `Deleted ${existing.platform} token: ${existing.label}`
  );

  res.json({ message: "Token deleted" });
});

router.post(
  "/:id/test",
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const { id } = req.params;

    const row = db.prepare("SELECT platform, token_data FROM platform_tokens WHERE id = ?").get(Number(id)) as
      | { platform: string; token_data: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: "Token not found" });
      return;
    }

    const data = JSON.parse(decrypt(row.token_data));

    try {
      let valid = false;
      let detail = "";

      if (row.platform === "vercel") {
        const resp = await fetch("https://api.vercel.com/v2/user", {
          headers: { Authorization: `Bearer ${data.token}` },
        });
        valid = resp.ok;
        if (valid) {
          const user = (await resp.json()) as { user?: { username?: string } };
          detail = `Vercel user: ${user.user?.username || "unknown"}`;
        } else {
          detail = `HTTP ${resp.status}`;
        }
      } else if (row.platform === "netlify") {
        const resp = await fetch("https://api.netlify.com/api/v1/user", {
          headers: { Authorization: `Bearer ${data.token}` },
        });
        valid = resp.ok;
        if (valid) {
          const user = (await resp.json()) as { full_name?: string; email?: string; slug?: string };
          detail = `Netlify user: ${user.full_name || user.email || user.slug || "unknown"}`;
        } else {
          detail = `HTTP ${resp.status}`;
        }
      } else if (row.platform === "railway") {
        const result = await testRailwayToken(data.apiToken);
        valid = result.valid;
        detail = result.detail;
      } else if (row.platform === "fastly") {
        const result = await testFastlyToken(data.apiToken);
        valid = result.valid;
        detail = result.detail;
      } else if (row.platform === "azure") {
        const params = new URLSearchParams({
          grant_type: "client_credentials",
          client_id: data.appId,
          client_secret: data.password,
          scope: "https://management.azure.com/.default",
        });
        const resp = await fetch(
          `https://login.microsoftonline.com/${data.tenantId}/oauth2/v2.0/token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
          }
        );
        if (resp.ok) {
          valid = true;
          detail = `Azure SP valid — subscription: ${data.subscriptionId?.slice(0, 8) || "?"}...`;
        } else {
          const err = await resp.json().catch(() => ({})) as { error_description?: string };
          detail = err.error_description?.slice(0, 120) || `HTTP ${resp.status}`;
        }
      }

      res.json({ valid, detail });
    } catch (err) {
      res.json({ valid: false, detail: String(err) });
    }
  })
);

export default router;

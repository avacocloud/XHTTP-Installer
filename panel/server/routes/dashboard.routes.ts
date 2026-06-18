import { Router } from "express";
import { getDb } from "../db/init.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/stats", requireAuth, (_req, res) => {
  const db = getDb();

  const total = (db.prepare("SELECT COUNT(*) as count FROM deployments").get() as { count: number }).count;
  const active = (
    db.prepare("SELECT COUNT(*) as count FROM deployments WHERE status = 'active'").get() as { count: number }
  ).count;
  const failed = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT deployment_id) as count FROM health_checks
         WHERE status_code IS NOT NULL AND status_code >= 400
         AND checked_at > datetime('now', '-1 day')`
      )
      .get() as { count: number }
  ).count;

  res.json({ totalDeployments: total, activeDeployments: active, failedHealthChecks: failed });
});

router.get("/recent-deploys", requireAuth, (_req, res) => {
  const db = getDb();
  const deploys = db
    .prepare(
      `SELECT id, platform, project_name, deploy_url, target_domain, status, created_at, updated_at
       FROM deployments ORDER BY created_at DESC LIMIT 10`
    )
    .all();

  res.json(deploys);
});

export default router;

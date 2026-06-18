import { Router } from "express";
import { getDb } from "../db/init.js";
import { requireAuth } from "../middleware/auth.js";
import { totalmem, freemem, cpus, uptime } from "node:os";
import { readFileSync, statfsSync } from "node:fs";

const router = Router();

router.get("/", requireAuth, (_req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;

  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  res.json(settings);
});

router.put("/", requireAuth, (req, res) => {
  const db = getDb();
  const entries = req.body as Record<string, string>;

  if (!entries || typeof entries !== "object") {
    res.status(400).json({ error: "Request body must be a JSON object" });
    return;
  }

  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );

  const transaction = db.transaction(() => {
    for (const [key, value] of Object.entries(entries)) {
      upsert.run(key, String(value));
    }
  });

  transaction();
  res.json({ message: "Settings updated" });
});

// ── Network stats helpers ─────────────────────────────────────────────────────

let prevNet: { rx: number; tx: number; ts: number } | null = null;

function readNetBytes(): { rx: number; tx: number } {
  try {
    const lines = readFileSync("/proc/net/dev", "utf8").split("\n");
    let rx = 0, tx = 0;
    for (const line of lines.slice(2)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      const iface = parts[0].replace(":", "");
      if (iface === "lo") continue;
      rx += Number(parts[1]) || 0;
      tx += Number(parts[9]) || 0;
    }
    return { rx, tx };
  } catch {
    return { rx: 0, tx: 0 };
  }
}

function getCpuUsage(): number {
  const list = cpus();
  let idle = 0, total = 0;
  for (const cpu of list) {
    for (const val of Object.values(cpu.times)) total += val;
    idle += cpu.times.idle;
  }
  return total > 0 ? Math.round((1 - idle / total) * 100) : 0;
}

router.get("/system-stats", requireAuth, (_req, res) => {
  const totalMem = totalmem();
  const usedMem  = totalMem - freemem();

  const net = readNetBytes();
  const now = Date.now();
  let rxBps = 0, txBps = 0;
  if (prevNet) {
    const dt = (now - prevNet.ts) / 1000;
    rxBps = dt > 0 ? Math.round((net.rx - prevNet.rx) / dt) : 0;
    txBps = dt > 0 ? Math.round((net.tx - prevNet.tx) / dt) : 0;
  }
  prevNet = { rx: net.rx, tx: net.tx, ts: now };

  // Disk usage
  let diskTotal = 0, diskFree = 0;
  try {
    const st = statfsSync("/");
    diskTotal = st.bsize * st.blocks;
    diskFree  = st.bsize * st.bfree;
  } catch {}
  const diskUsed = diskTotal - diskFree;

  res.json({
    cpu:       getCpuUsage(),
    memUsed:   usedMem,
    memTotal:  totalMem,
    memPct:    Math.round((usedMem / totalMem) * 100),
    netRxBps:  Math.max(0, rxBps),
    netTxBps:  Math.max(0, txBps),
    diskUsed,
    diskTotal,
    diskPct:   diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0,
    uptime:    Math.floor(uptime()),
  });
});

export default router;

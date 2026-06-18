import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  getInbounds,
  addInbound,
  updateInbound,
  deleteInbound,
  addClient,
  removeClient,
} from "../services/xray.service.js";

const router = Router();

// ── GET /inbounds — list all inbounds ────────────────────────────────────────
router.get("/", requireAuth, (_req, res) => {
  try {
    const inbounds = getInbounds().filter((ib) => ib.tag !== "api");
    res.json(inbounds);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /inbounds — add new inbound ─────────────────────────────────────────
router.post("/", requireAuth, (req, res) => {
  const inbound = req.body;
  if (!inbound.tag || !inbound.port || !inbound.protocol) {
    res.status(400).json({ error: "tag, port, and protocol are required" });
    return;
  }
  const result = addInbound(inbound);
  if (result.success) {
    res.json({ success: true, message: result.message });
  } else {
    res.status(400).json({ error: result.message });
  }
});

// ── PUT /inbounds/:tag — update inbound ──────────────────────────────────────
router.put("/:tag", requireAuth, (req, res) => {
  const result = updateInbound(String(req.params.tag), req.body);
  if (result.success) {
    res.json({ success: true, message: result.message });
  } else {
    res.status(400).json({ error: result.message });
  }
});

// ── DELETE /inbounds/:tag — delete inbound ───────────────────────────────────
router.delete("/:tag", requireAuth, (req, res) => {
  const result = deleteInbound(String(req.params.tag));
  if (result.success) {
    res.json({ success: true, message: result.message });
  } else {
    res.status(400).json({ error: result.message });
  }
});

// ── POST /inbounds/:tag/clients — add client ────────────────────────────────
router.post("/:tag/clients", requireAuth, (req, res) => {
  const { id, flow, email } = req.body;
  if (!id) {
    res.status(400).json({ error: "Client UUID (id) is required" });
    return;
  }
  const result = addClient(String(req.params.tag), { id, flow, email });
  if (result.success) {
    res.json({ success: true, message: result.message });
  } else {
    res.status(400).json({ error: result.message });
  }
});

// ── DELETE /inbounds/:tag/clients/:uuid — remove client ──────────────────────
router.delete("/:tag/clients/:uuid", requireAuth, (req, res) => {
  const result = removeClient(String(req.params.tag), String(req.params.uuid));
  if (result.success) {
    res.json({ success: true, message: result.message });
  } else {
    res.status(400).json({ error: result.message });
  }
});

export default router;

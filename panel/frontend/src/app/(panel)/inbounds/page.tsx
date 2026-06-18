"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Trash2, Pencil, Copy, RefreshCw, Loader2, Users, ChevronDown, ChevronUp, Network,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface XrayClient {
  id: string;
  flow?: string;
  email?: string;
  password?: string;
  method?: string;
}

interface XrayInbound {
  tag: string;
  listen: string;
  port: number;
  protocol: string;
  settings: Record<string, any>;
  streamSettings?: Record<string, any>;
  sniffing?: Record<string, any>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const PROTOCOLS = ["vless", "vmess", "trojan", "shadowsocks", "dokodemo-door", "socks", "http"];
const NETWORKS = ["tcp", "ws", "grpc", "xhttp", "kcp", "quic", "httpupgrade", "splithttp", "h2"];
const SECURITIES = ["none", "tls", "reality"];
const ALPN_OPTIONS = ["h2", "http/1.1", "h2,http/1.1"];
const FINGERPRINTS = ["chrome", "firefox", "safari", "ios", "android", "edge", "360", "qq", "random", "randomized"];
const FLOW_OPTIONS = ["none", "xtls-rprx-vision"];
const HEADER_TYPES = ["none", "http"];
const QUIC_SECURITIES = ["none", "aes-128-gcm", "chacha20-poly1305"];
const SS_METHODS = [
  "2022-blake3-aes-128-gcm", "2022-blake3-aes-256-gcm", "2022-blake3-chacha20-poly1305",
  "aes-256-gcm", "aes-128-gcm", "chacha20-poly1305", "xchacha20-poly1305",
  "none", "plain",
];

const PROTOCOL_COLORS: Record<string, string> = {
  vless: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  vmess: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  trojan: "bg-red-500/20 text-red-400 border-red-500/30",
  shadowsocks: "bg-green-500/20 text-green-400 border-green-500/30",
  socks: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  http: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "dokodemo-door": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
};

// ── Helper: generate UUID (works on HTTP too) ───────────────────────────────
function genUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    try { return crypto.randomUUID(); } catch {}
  }
  // Fallback for non-secure contexts (HTTP)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Default inbound ──────────────────────────────────────────────────────────

function newInbound(): XrayInbound {
  return {
    tag: "",
    listen: "0.0.0.0",
    port: 443,
    protocol: "vless",
    settings: { clients: [{ id: genUUID(), flow: "" }], decryption: "none" },
    streamSettings: {
      network: "xhttp",
      security: "tls",
      tlsSettings: { alpn: ["h2", "http/1.1"], certificates: [{ certificateFile: "", keyFile: "" }] },
      xhttpSettings: { path: "/api", host: "", mode: "auto" },
    },
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function InboundsPage() {
  const { t } = useI18n();
  const [inbounds, setInbounds] = useState<XrayInbound[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<string | null>(null); // null = adding new
  const [form, setForm] = useState<XrayInbound>(newInbound());

  // Delete confirm
  const [deleteTag, setDeleteTag] = useState<string | null>(null);

  // Expanded clients
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  // Advanced toggle (reserved for future use)
  // const [showAdvanced, setShowAdvanced] = useState(false);

  const fetchInbounds = useCallback(() => {
    setLoading(true);
    api.get("/inbounds")
      .then((r) => setInbounds(r.data))
      .catch(() => toast.error("Failed to load inbounds"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchInbounds(); }, [fetchInbounds]);

  // ── Form helpers ─────────────────────────────────────────────────────────

  const updateForm = (patch: Partial<XrayInbound>) => setForm((f) => ({ ...f, ...patch }));
  const updateStream = (patch: Record<string, any>) =>
    setForm((f) => ({ ...f, streamSettings: { ...f.streamSettings, ...patch } }));
  const updateSettings = (patch: Record<string, any>) =>
    setForm((f) => ({ ...f, settings: { ...f.settings, ...patch } }));

  const getStream = () => form.streamSettings || {};
  const getNetwork = () => getStream().network || "tcp";
  const getSecurity = () => getStream().security || "none";

  // Get/set network-specific settings
  const getNetSettings = () => {
    const net = getNetwork();
    const key = net === "xhttp" ? "xhttpSettings"
      : net === "ws" ? "wsSettings"
      : net === "grpc" ? "grpcSettings"
      : net === "kcp" ? "kcpSettings"
      : net === "quic" ? "quicSettings"
      : net === "h2" ? "httpSettings"
      : net === "httpupgrade" ? "httpupgradeSettings"
      : net === "splithttp" ? "splithttpSettings"
      : "tcpSettings";
    return getStream()[key] || {};
  };
  const setNetSettings = (val: Record<string, any>) => {
    const net = getNetwork();
    const key = net === "xhttp" ? "xhttpSettings"
      : net === "ws" ? "wsSettings"
      : net === "grpc" ? "grpcSettings"
      : net === "kcp" ? "kcpSettings"
      : net === "quic" ? "quicSettings"
      : net === "h2" ? "httpSettings"
      : net === "httpupgrade" ? "httpupgradeSettings"
      : net === "splithttp" ? "splithttpSettings"
      : "tcpSettings";
    updateStream({ [key]: val });
  };

  const getTlsSettings = () => getStream().tlsSettings || {};
  const setTlsSettings = (val: Record<string, any>) => updateStream({ tlsSettings: val });
  const getRealitySettings = () => getStream().realitySettings || {};
  const setRealitySettings = (val: Record<string, any>) => updateStream({ realitySettings: val });

  // ── Protocol change: reset settings ──────────────────────────────────────

  const handleProtocolChange = (proto: string) => {
    const base: Record<string, any> = {};
    if (proto === "vless") {
      base.clients = [{ id: genUUID(), flow: "" }];
      base.decryption = "none";
    } else if (proto === "vmess") {
      base.clients = [{ id: genUUID() }];
    } else if (proto === "trojan") {
      base.clients = [{ id: genUUID(), password: "" }];
    } else if (proto === "shadowsocks") {
      base.method = "aes-256-gcm";
      base.password = "";
      base.clients = [];
    } else if (proto === "socks") {
      base.auth = "noauth";
      base.accounts = [];
    } else if (proto === "http") {
      base.accounts = [];
    } else if (proto === "dokodemo-door") {
      base.address = "";
      base.port = 0;
      base.network = "tcp,udp";
    }
    updateForm({ protocol: proto, settings: base });
  };

  // ── Save (add or update) ─────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.tag || !form.port || !form.protocol) {
      toast.error("Tag, port, and protocol are required");
      return;
    }
    setSaving(true);
    try {
      if (editingTag) {
        await api.put(`/inbounds/${encodeURIComponent(editingTag)}`, form);
      } else {
        await api.post("/inbounds", form);
      }
      toast.success(t("inbounds.saved"));
      setDialogOpen(false);
      fetchInbounds();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = async (tag: string) => {
    try {
      await api.delete(`/inbounds/${encodeURIComponent(tag)}`);
      toast.success(t("inbounds.deleted"));
      setDeleteTag(null);
      fetchInbounds();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to delete");
    }
  };

  // ── Open dialog for edit ─────────────────────────────────────────────────

  const openEdit = (ib: XrayInbound) => {
    setEditingTag(ib.tag);
    // Deep clone + ensure streamSettings has all needed nested objects
    const clone = JSON.parse(JSON.stringify(ib));
    if (!clone.streamSettings) clone.streamSettings = { network: "tcp", security: "none" };
    if (!clone.settings) clone.settings = {};
    setForm(clone);
    setDialogOpen(true);
  };

  const openAdd = async () => {
    setEditingTag(null);
    const ib = newInbound();
    // Auto-fill only SSL cert paths
    try {
      const res = await api.get("/configs/ssl-paths");
      const { certFile, keyFile } = res.data;
      if (certFile && keyFile && ib.streamSettings?.tlsSettings) {
        ib.streamSettings.tlsSettings.certificates = [{ certificateFile: certFile, keyFile }];
      }
    } catch {}
    setForm(ib);
    setDialogOpen(true);
  };

  // ── Clients from an inbound ──────────────────────────────────────────────

  const getClients = (ib: XrayInbound): XrayClient[] => {
    return ib.settings?.clients || [];
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading && inbounds.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("inbounds.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("inbounds.subtitle").replace("{count}", String(inbounds.length))}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchInbounds} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button size="sm" onClick={openAdd} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("inbounds.addInbound")}
          </Button>
        </div>
      </div>

      {/* No inbounds */}
      {inbounds.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <Network className="mx-auto h-10 w-10 mb-3 opacity-40" />
          <p>{t("inbounds.noInbounds")}</p>
        </div>
      )}

      {/* Inbound cards */}
      <div className="grid gap-3">
        {inbounds.map((ib) => {
          const clients = getClients(ib);
          const net = ib.streamSettings?.network || "tcp";
          const sec = ib.streamSettings?.security || "none";
          const netSettings = ib.streamSettings?.[net === "xhttp" ? "xhttpSettings" : net === "ws" ? "wsSettings" : net === "grpc" ? "grpcSettings" : `${net}Settings`] || {};
          const expanded = expandedClients.has(ib.tag);

          return (
            <div key={ib.tag} className="rounded-xl border bg-card overflow-hidden">
              {/* Card header */}
              <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{ib.tag}</span>
                  <Badge variant="outline" className={cn("text-[10px] font-mono", PROTOCOL_COLORS[ib.protocol])}>
                    {ib.protocol.toUpperCase()}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    :{ib.port}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {net}
                  </Badge>
                  {sec !== "none" && (
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      🔒 {sec}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(ib)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTag(ib.tag)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Card body */}
              <div className="px-4 py-3 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Listen:</span> <span className="font-mono">{ib.listen}</span></div>
                  {netSettings.path && <div><span className="text-muted-foreground">Path:</span> <span className="font-mono">{netSettings.path}</span></div>}
                  {netSettings.host && <div><span className="text-muted-foreground">Host:</span> <span className="font-mono">{netSettings.host}</span></div>}
                  {netSettings.mode && <div><span className="text-muted-foreground">Mode:</span> <span className="font-mono">{netSettings.mode}</span></div>}
                </div>

                {/* Clients toggle */}
                {clients.length > 0 && (
                  <div>
                    <button
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                      onClick={() => setExpandedClients((s) => {
                        const n = new Set(s);
                        if (n.has(ib.tag)) n.delete(ib.tag); else n.add(ib.tag);
                        return n;
                      })}
                    >
                      <Users className="h-3.5 w-3.5" />
                      {clients.length} {t("inbounds.clients")}
                      {expanded ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                    </button>

                    {expanded && (
                      <div className="mt-2 space-y-1.5">
                        {clients.map((c) => (
                          <div key={c.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs font-mono">
                            <span className="truncate flex-1">{c.id}</span>
                            {c.email && <span className="text-muted-foreground">{c.email}</span>}
                            <Button
                              variant="ghost" size="icon" className="h-5 w-5 shrink-0"
                              onClick={() => { try { navigator.clipboard.writeText(c.id); } catch { const ta=document.createElement("textarea");ta.value=c.id;ta.style.cssText="position:fixed;opacity:0";document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta); } toast.success("Copied"); }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteTag} onOpenChange={(o) => !o && setDeleteTag(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("inbounds.deleteInbound")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("inbounds.deleteConfirm").replace("{tag}", deleteTag || "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteTag && handleDelete(deleteTag)}>
              {t("inbounds.deleteInbound")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTag ? t("inbounds.editInbound") : t("inbounds.addInbound")}</DialogTitle>
            <DialogDescription />
          </DialogHeader>

          <div className="space-y-5">
            {/* ── Basic ─────────────────────────────────────────────────── */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">{t("inbounds.basic")}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("inbounds.tag")}</Label>
                  <Input className="h-9 text-sm font-mono" value={form.tag} disabled={!!editingTag}
                    onChange={(e) => updateForm({ tag: e.target.value.replace(/[^a-zA-Z0-9_-]/g, "") })} placeholder="xhttp-tls" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("inbounds.protocol")}</Label>
                  <Select value={form.protocol} onValueChange={handleProtocolChange}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROTOCOLS.map((p) => <SelectItem key={p} value={p} className="text-sm font-mono">{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("inbounds.listen")}</Label>
                  <Input className="h-9 text-sm font-mono" value={form.listen}
                    onChange={(e) => updateForm({ listen: e.target.value })} placeholder="0.0.0.0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("inbounds.port")}</Label>
                  <Input className="h-9 text-sm font-mono" type="number" min={1} max={65535} value={form.port}
                    onChange={(e) => updateForm({ port: Number(e.target.value) })} />
                </div>
              </div>
            </div>

            {/* ── Stream Settings ────────────────────────────────────────── */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">{t("inbounds.stream")}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("inbounds.network")}</Label>
                  <Select value={getNetwork()} onValueChange={(v) => updateStream({ network: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {NETWORKS.map((n) => <SelectItem key={n} value={n} className="text-sm font-mono">{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("inbounds.security")}</Label>
                  <Select value={getSecurity()} onValueChange={(v) => updateStream({ security: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SECURITIES.map((s) => <SelectItem key={s} value={s} className="text-sm font-mono">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* ── Network-specific settings ──────────────────────────────── */}
            {(["xhttp", "ws", "grpc", "kcp", "quic", "h2", "httpupgrade", "splithttp"].includes(getNetwork())) && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground">{t("inbounds.networkSettings")}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {/* Path — for xhttp, ws, httpupgrade, splithttp, h2 */}
                  {["xhttp", "ws", "httpupgrade", "splithttp", "h2"].includes(getNetwork()) && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("inbounds.path")}</Label>
                      <Input className="h-9 text-sm font-mono" value={getNetSettings().path || ""}
                        onChange={(e) => setNetSettings({ ...getNetSettings(), path: e.target.value })} placeholder="/api" />
                    </div>
                  )}
                  {/* Host — for xhttp, ws, httpupgrade, h2 */}
                  {["xhttp", "ws", "httpupgrade", "h2"].includes(getNetwork()) && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("inbounds.host")}</Label>
                      <Input className="h-9 text-sm font-mono" value={getNetSettings().host || ""}
                        onChange={(e) => setNetSettings({ ...getNetSettings(), host: e.target.value })} placeholder="example.com" />
                    </div>
                  )}
                  {/* Mode — for xhttp */}
                  {getNetwork() === "xhttp" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("inbounds.mode")}</Label>
                      <Select value={getNetSettings().mode || "auto"} onValueChange={(v) => setNetSettings({ ...getNetSettings(), mode: v })}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["auto", "packet-up", "stream-up", "stream-one"].map((m) => (
                            <SelectItem key={m} value={m} className="text-sm font-mono">{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {/* gRPC serviceName */}
                  {getNetwork() === "grpc" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("inbounds.serviceName")}</Label>
                      <Input className="h-9 text-sm font-mono" value={getNetSettings().serviceName || ""}
                        onChange={(e) => setNetSettings({ ...getNetSettings(), serviceName: e.target.value })} />
                    </div>
                  )}
                  {/* KCP */}
                  {getNetwork() === "kcp" && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("inbounds.headerType")}</Label>
                        <Select value={getNetSettings().header?.type || "none"}
                          onValueChange={(v) => setNetSettings({ ...getNetSettings(), header: { type: v } })}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {HEADER_TYPES.map((h) => <SelectItem key={h} value={h} className="text-sm font-mono">{h}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("inbounds.seed")}</Label>
                        <Input className="h-9 text-sm font-mono" value={getNetSettings().seed || ""}
                          onChange={(e) => setNetSettings({ ...getNetSettings(), seed: e.target.value })} />
                      </div>
                    </>
                  )}
                  {/* QUIC */}
                  {getNetwork() === "quic" && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("inbounds.quicSecurity")}</Label>
                        <Select value={getNetSettings().security || "none"}
                          onValueChange={(v) => setNetSettings({ ...getNetSettings(), security: v })}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {QUIC_SECURITIES.map((q) => <SelectItem key={q} value={q} className="text-sm font-mono">{q}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("inbounds.key")}</Label>
                        <Input className="h-9 text-sm font-mono" value={getNetSettings().key || ""}
                          onChange={(e) => setNetSettings({ ...getNetSettings(), key: e.target.value })} />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── TLS Settings ──────────────────────────────────────────── */}
            {getSecurity() === "tls" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground">{t("inbounds.tlsSettings")}</h3>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={async () => {
                    try {
                      const res = await api.get("/configs/ssl-paths");
                      const { certFile, keyFile } = res.data;
                      if (certFile && keyFile) {
                        setTlsSettings({ ...getTlsSettings(), certificates: [{ certificateFile: certFile, keyFile }] });
                        toast.success("SSL paths auto-filled");
                      } else {
                        toast.error("No SSL certificate found on server");
                      }
                    } catch { toast.error("Failed to detect SSL paths"); }
                  }}>
                    <RefreshCw className="h-3 w-3" /> Auto-fill SSL
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("inbounds.certFile")}</Label>
                    <Input className="h-9 text-sm font-mono" value={getTlsSettings().certificates?.[0]?.certificateFile || ""}
                      onChange={(e) => setTlsSettings({ ...getTlsSettings(), certificates: [{ ...getTlsSettings().certificates?.[0], certificateFile: e.target.value }] })}
                      placeholder="/etc/ssl/xhttp/domain/fullchain.pem" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("inbounds.keyFile")}</Label>
                    <Input className="h-9 text-sm font-mono" value={getTlsSettings().certificates?.[0]?.keyFile || ""}
                      onChange={(e) => setTlsSettings({ ...getTlsSettings(), certificates: [{ ...getTlsSettings().certificates?.[0], keyFile: e.target.value }] })}
                      placeholder="/etc/ssl/xhttp/domain/privkey.pem" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("inbounds.alpn")}</Label>
                    <Select value={(getTlsSettings().alpn || ["h2", "http/1.1"]).join(",") || "h2,http/1.1"} onValueChange={(v) => setTlsSettings({ ...getTlsSettings(), alpn: v.split(",") })}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ALPN_OPTIONS.map((a) => <SelectItem key={a} value={a} className="text-sm font-mono">{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("inbounds.sni")}</Label>
                    <Input className="h-9 text-sm font-mono" value={getTlsSettings().serverName || ""}
                      onChange={(e) => setTlsSettings({ ...getTlsSettings(), serverName: e.target.value })} placeholder="example.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("inbounds.fingerprint")}</Label>
                    <Select value={getTlsSettings().fingerprint || "chrome"} onValueChange={(v) => setTlsSettings({ ...getTlsSettings(), fingerprint: v })}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FINGERPRINTS.map((f) => <SelectItem key={f} value={f} className="text-sm font-mono">{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* ── Reality Settings ───────────────────────────────────────── */}
            {getSecurity() === "reality" && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground">{t("inbounds.realitySettings")}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("inbounds.dest")}</Label>
                    <Input className="h-9 text-sm font-mono" value={getRealitySettings().dest || ""}
                      onChange={(e) => setRealitySettings({ ...getRealitySettings(), dest: e.target.value })} placeholder="www.google.com:443" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("inbounds.serverNames")}</Label>
                    <Input className="h-9 text-sm font-mono" value={(getRealitySettings().serverNames || []).join(",")}
                      onChange={(e) => setRealitySettings({ ...getRealitySettings(), serverNames: e.target.value.split(",").map((s: string) => s.trim()) })}
                      placeholder="www.google.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("inbounds.privateKey")}</Label>
                    <Input className="h-9 text-sm font-mono" value={getRealitySettings().privateKey || ""}
                      onChange={(e) => setRealitySettings({ ...getRealitySettings(), privateKey: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("inbounds.publicKey")}</Label>
                    <Input className="h-9 text-sm font-mono" value={getRealitySettings().publicKey || ""}
                      onChange={(e) => setRealitySettings({ ...getRealitySettings(), publicKey: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("inbounds.shortIds")}</Label>
                    <Input className="h-9 text-sm font-mono" value={(getRealitySettings().shortIds || []).join(",")}
                      onChange={(e) => setRealitySettings({ ...getRealitySettings(), shortIds: e.target.value.split(",").map((s: string) => s.trim()) })}
                      placeholder="abcd1234" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("inbounds.spiderX")}</Label>
                    <Input className="h-9 text-sm font-mono" value={getRealitySettings().spiderX || ""}
                      onChange={(e) => setRealitySettings({ ...getRealitySettings(), spiderX: e.target.value })} placeholder="/" />
                  </div>
                </div>
              </div>
            )}

            {/* ── Clients (for vless, vmess, trojan) ─────────────────────── */}
            {["vless", "vmess", "trojan"].includes(form.protocol) && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground">{t("inbounds.clients")}</h3>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => {
                    const clients = form.settings.clients || [];
                    clients.push({ id: genUUID(), flow: "" });
                    updateSettings({ clients: [...clients] });
                  }}>
                    <Plus className="h-3 w-3" /> {t("inbounds.addClient")}
                  </Button>
                </div>
                <div className="space-y-2">
                  {(form.settings.clients || []).map((c: XrayClient, i: number) => (
                    <div key={i} className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-2">
                      <div className="flex-1 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Input className="h-7 text-xs font-mono flex-1" value={c.id}
                            onChange={(e) => {
                              const clients = [...(form.settings.clients || [])];
                              clients[i] = { ...clients[i], id: e.target.value };
                              updateSettings({ clients });
                            }} placeholder="UUID" />
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => {
                            const clients = [...(form.settings.clients || [])];
                            clients[i] = { ...clients[i], id: genUUID() };
                            updateSettings({ clients });
                          }}>
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        </div>
                        {form.protocol === "vless" && (
                          <Select value={c.flow || "none"} onValueChange={(v) => {
                            const clients = [...(form.settings.clients || [])];
                            clients[i] = { ...clients[i], flow: v === "none" ? "" : v };
                            updateSettings({ clients });
                          }}>
                            <SelectTrigger className="h-7 text-xs w-48"><SelectValue placeholder="Flow" /></SelectTrigger>
                            <SelectContent>
                              {FLOW_OPTIONS.map((f) => <SelectItem key={f} value={f} className="text-xs font-mono">{f === "none" ? "(none)" : f}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => {
                        const clients = (form.settings.clients || []).filter((_: any, j: number) => j !== i);
                        updateSettings({ clients });
                      }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Shadowsocks settings ───────────────────────────────────── */}
            {form.protocol === "shadowsocks" && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground">Shadowsocks</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("inbounds.method")}</Label>
                    <Select value={form.settings.method || "aes-256-gcm"} onValueChange={(v) => updateSettings({ method: v })}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SS_METHODS.map((m) => <SelectItem key={m} value={m} className="text-sm font-mono">{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("inbounds.password")}</Label>
                    <Input className="h-9 text-sm font-mono" value={form.settings.password || ""}
                      onChange={(e) => updateSettings({ password: e.target.value })} />
                  </div>
                </div>
              </div>
            )}

            {/* ── Dokodemo-door settings ──────────────────────────────────── */}
            {form.protocol === "dokodemo-door" && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground">Dokodemo-door</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Address</Label>
                    <Input className="h-9 text-sm font-mono" value={form.settings.address || ""}
                      onChange={(e) => updateSettings({ address: e.target.value })} placeholder="127.0.0.1" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("inbounds.port")}</Label>
                    <Input className="h-9 text-sm font-mono" type="number" value={form.settings.port || 0}
                      onChange={(e) => updateSettings({ port: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("inbounds.network")}</Label>
                    <Input className="h-9 text-sm font-mono" value={form.settings.network || "tcp,udp"}
                      onChange={(e) => updateSettings({ network: e.target.value })} placeholder="tcp,udp" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingTag ? t("inbounds.editInbound") : t("inbounds.addInbound")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

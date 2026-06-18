"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Trash2, Pencil, Copy, RefreshCw, Loader2, Users, MoreHorizontal,
  Search, Power, PowerOff, RotateCcw, Download, Upload,
  Shield, ShieldOff, Clock, WifiOff, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface Client {
  id: number;
  uuid: string;
  email: string;
  inbound_tag: string;
  traffic_limit: number;
  traffic_up: number;
  traffic_down: number;
  expiry_date: string | null;
  max_ips: number;
  enabled: number;
  flow: string;
  created_at: string;
  updated_at: string;
}

interface DeployOption {
  id: number | string;
  platform: string;
  name: string;
}

interface Inbound {
  tag: string;
  protocol: string;
  port: number;
}

interface Summary {
  total: number;
  active: number;
  disabled: number;
  expired: number;
  trafficExceeded: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function genUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    try { return crypto.randomUUID(); } catch {}
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatBytesShort(bytes: number): string {
  if (bytes === 0) return "0";
  const k = 1024;
  if (bytes < k) return bytes + " B";
  if (bytes < k * k) return (bytes / k).toFixed(1) + " KB";
  if (bytes < k * k * k) return (bytes / (k * k)).toFixed(1) + " MB";
  return (bytes / (k * k * k)).toFixed(2) + " GB";
}

function getExpiryInfo(expiryDate: string | null): { status: "ok" | "warning" | "expired" | "none"; label: string } {
  if (!expiryDate) return { status: "none", label: "" };
  const now = new Date();
  const exp = new Date(expiryDate);
  const diff = exp.getTime() - now.getTime();
  if (diff <= 0) return { status: "expired", label: "Expired" };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 7) return { status: "ok", label: `${days}d` };
  if (days > 0) return { status: "warning", label: `${days}d ${hours}h` };
  return { status: "warning", label: `${hours}h` };
}

function getClientStatus(client: Client): "active" | "disabled" | "expired" | "traffic_exceeded" {
  if (!client.enabled) return "disabled";
  if (client.expiry_date) {
    const exp = new Date(client.expiry_date);
    if (exp.getTime() <= Date.now()) return "expired";
  }
  if (client.traffic_limit > 0 && (client.traffic_up + client.traffic_down) >= client.traffic_limit) return "traffic_exceeded";
  return "active";
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
  disabled: "bg-zinc-500/15 text-zinc-500 border-zinc-500/25",
  expired: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25",
  traffic_exceeded: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25",
};

const STATUS_LABELS: Record<string, string> = {
  active: "clients.active",
  disabled: "clients.disabled",
  expired: "clients.expired",
  traffic_exceeded: "clients.trafficExceeded",
};

// ── Page Component ──────────────────────────────────────────────────────────

export default function ClientsPage() {
  const { t } = useI18n();

  // Data
  const [clients, setClients] = useState<Client[]>([]);
  const [inbounds, setInbounds] = useState<Inbound[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, active: 0, disabled: 0, expired: 0, trafficExceeded: 0 });
  const [onlineEmails, setOnlineEmails] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "disabled" | "expired">("all");
  const [filterInbound, setFilterInbound] = useState<string>("all");

  // Selection
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    uuid: genUUID(),
    email: "",
    inbound_tag: "",
    traffic_limit: 0,
    expiry_date: "",
    max_ips: 0,
    flow: "",
    enabled: true,
  });
  const [saving, setSaving] = useState(false);

  // Delete/Reset confirm
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [resetId, setResetId] = useState<number | null>(null);
  const [resetAllOpen, setResetAllOpen] = useState(false);

  // Config links
  const [configLinksId, setConfigLinksId] = useState<number | null>(null);
  const [deployOptions, setDeployOptions] = useState<DeployOption[]>([]);
  const [configLinksLoading, setConfigLinksLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string>("");
  const [generatingDeploy, setGeneratingDeploy] = useState<string | number | null>(null);

  // Traffic detail
  const [trafficDetailId, setTrafficDetailId] = useState<number | null>(null);
  const [trafficHistory, setTrafficHistory] = useState<{ recorded_at: string; upload: number; download: number }[]>([]);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [clientsRes, inboundsRes, summaryRes] = await Promise.all([
        api.get("/clients"),
        api.get("/inbounds"),
        api.get("/clients/summary"),
      ]);
      setClients(clientsRes.data);
      setInbounds(inboundsRes.data.map((ib: any) => ({ tag: ib.tag, protocol: ib.protocol, port: ib.port })));
      setSummary(summaryRes.data);
    } catch {
      if (showLoading) toast.error("Failed to load data");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const fetchOnline = useCallback(async () => {
    try {
      const res = await api.get("/clients/online");
      setOnlineEmails(new Set(res.data));
    } catch {}
  }, []);

  useEffect(() => { fetchAll(true); fetchOnline(); }, [fetchAll, fetchOnline]);

  // Auto-refresh data every 30s (server syncs traffic from Xray every 10s)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAll();
      fetchOnline();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchAll, fetchOnline]);

  // ── Filtered clients ──────────────────────────────────────────────────────

  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      if (search) {
        const s = search.toLowerCase();
        if (!c.email.toLowerCase().includes(s) && !c.uuid.toLowerCase().includes(s)) return false;
      }
      if (filterInbound !== "all" && c.inbound_tag !== filterInbound) return false;
      if (filterStatus !== "all") {
        const status = getClientStatus(c);
        if (filterStatus === "active" && status !== "active") return false;
        if (filterStatus === "disabled" && status !== "disabled") return false;
        if (filterStatus === "expired" && status !== "expired" && status !== "traffic_exceeded") return false;
      }
      return true;
    });
  }, [clients, search, filterStatus, filterInbound]);

  // ── Selection helpers ─────────────────────────────────────────────────────

  const allSelected = filteredClients.length > 0 && filteredClients.every((c) => selected.has(c.id));
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredClients.map((c) => c.id)));
    }
  };
  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleSyncTraffic = async () => {
    setSyncing(true);
    try {
      await api.post("/clients/sync-traffic");
      toast.success(t("clients.synced"));
      fetchAll();
      fetchOnline();
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleCheckExpiry = async () => {
    try {
      const res = await api.post("/clients/check-expiry");
      toast.success(`${res.data.disabled} clients disabled`);
      fetchAll();
    } catch {
      toast.error("Failed");
    }
  };

  const handleSave = async () => {
    if (!form.email || !form.inbound_tag) {
      toast.error("Email and inbound are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        traffic_limit: form.traffic_limit * 1024 * 1024 * 1024, // GB to bytes
        expiry_date: form.expiry_date || null,
      };
      if (editingId) {
        await api.put(`/clients/${editingId}`, payload);
      } else {
        await api.post("/clients", payload);
      }
      toast.success(t("clients.saved"));
      setDialogOpen(false);
      setTimeout(() => fetchAll(true), 1500);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/clients/${id}`);
      toast.success(t("clients.deleted"));
      setDeleteId(null);
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      setTimeout(() => fetchAll(true), 1500);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed");
    }
  };

  const handleToggle = async (id: number, enabled: boolean) => {
    try {
      await api.patch(`/clients/${id}/toggle`, { enabled });
      setTimeout(() => fetchAll(), 1500);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed");
    }
  };

  const handleResetTraffic = async (id: number) => {
    try {
      await api.post(`/clients/${id}/reset-traffic`);
      toast.success(t("clients.trafficReset"));
      setResetId(null);
      fetchAll();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed");
    }
  };

  const handleResetAllTraffic = async () => {
    try {
      await api.post("/clients/reset-all-traffic");
      toast.success(t("clients.trafficReset"));
      setResetAllOpen(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed");
    }
  };

  // Bulk
  const handleBulkDelete = async () => {
    try {
      await api.post("/clients/bulk", { action: "delete", ids: Array.from(selected) });
      toast.success(t("clients.deleted"));
      setSelected(new Set());
      fetchAll();
    } catch {
      toast.error("Failed");
    }
  };

  const handleBulkToggle = async (enabled: boolean) => {
    try {
      await api.post("/clients/bulk", { action: "toggle", ids: Array.from(selected), enabled });
      setSelected(new Set());
      fetchAll();
    } catch {
      toast.error("Failed");
    }
  };

  const openConfigLinks = async (id: number) => {
    setConfigLinksId(id);
    setConfigLinksLoading(true);
    setGeneratedLink("");
    setGeneratingDeploy(null);
    try {
      const res = await api.get(`/clients/${id}/deployments`);
      setDeployOptions(res.data);
    } catch {
      setDeployOptions([]);
    } finally {
      setConfigLinksLoading(false);
    }
  };

  const handleSelectDeploy = async (clientId: number, deployId: string | number) => {
    setGeneratingDeploy(deployId);
    setGeneratedLink("");
    try {
      const res = await api.get(`/clients/${clientId}/config-link?deployId=${deployId}`);
      setGeneratedLink(res.data.configLink);
    } catch {
      toast.error("Failed to generate config");
    } finally {
      setGeneratingDeploy(null);
    }
  };

  // Open dialogs
  const openAdd = () => {
    setEditingId(null);
    setForm({
      uuid: genUUID(),
      email: "",
      inbound_tag: inbounds.length > 0 ? inbounds[0].tag : "",
      traffic_limit: 0,
      expiry_date: "",
      max_ips: 0,
      flow: "",
      enabled: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (c: Client) => {
    setEditingId(c.id);
    setForm({
      uuid: c.uuid,
      email: c.email,
      inbound_tag: c.inbound_tag,
      traffic_limit: c.traffic_limit > 0 ? Math.round(c.traffic_limit / (1024 * 1024 * 1024) * 100) / 100 : 0,
      expiry_date: c.expiry_date ? c.expiry_date.slice(0, 16) : "",
      max_ips: c.max_ips,
      flow: c.flow,
      enabled: !!c.enabled,
    });
    setDialogOpen(true);
  };

  const openTrafficDetail = async (id: number) => {
    setTrafficDetailId(id);
    try {
      const res = await api.get(`/clients/${id}/traffic-history?days=7`);
      setTrafficHistory(res.data);
    } catch {
      setTrafficHistory([]);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading && clients.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const deleteClient = clients.find((c) => c.id === deleteId);
  const resetClient = clients.find((c) => c.id === resetId);
  const trafficClient = clients.find((c) => c.id === trafficDetailId);

  return (
    <div className="space-y-4">
      {/* ── Summary Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: t("clients.totalClients"), value: summary.total, icon: Users, color: "text-foreground" },
          { label: t("clients.activeClients"), value: summary.active, icon: Shield, color: "text-emerald-500" },
          { label: t("clients.disabledClients"), value: summary.disabled, icon: ShieldOff, color: "text-zinc-400" },
          { label: t("clients.expiredClients"), value: summary.expired, icon: Clock, color: "text-amber-500" },
          { label: t("clients.trafficExceededClients"), value: summary.trafficExceeded, icon: WifiOff, color: "text-red-500" },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{card.label}</span>
              <card.icon className={cn("h-4 w-4", card.color)} />
            </div>
            <p className={cn("text-2xl font-bold mt-1", card.color)}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* ── Header + Actions ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("clients.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("clients.subtitle").replace("{count}", String(clients.length))}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleSyncTraffic} disabled={syncing} className="gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
            {t("clients.syncTraffic")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCheckExpiry}>
                <Clock className="h-4 w-4 mr-2" /> {t("clients.checkExpiry")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setResetAllOpen(true)} className="text-destructive">
                <RotateCcw className="h-4 w-4 mr-2" /> {t("clients.resetAllTraffic")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={openAdd} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("clients.addClient")}
          </Button>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder={t("clients.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={(v: any) => setFilterStatus(v)}>
          <SelectTrigger className="h-9 w-[130px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("clients.filterAll")}</SelectItem>
            <SelectItem value="active">{t("clients.filterActive")}</SelectItem>
            <SelectItem value="disabled">{t("clients.filterDisabled")}</SelectItem>
            <SelectItem value="expired">{t("clients.filterExpired")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterInbound} onValueChange={setFilterInbound}>
          <SelectTrigger className="h-9 w-[160px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("clients.filterAll")} Inbounds</SelectItem>
            {inbounds.map((ib) => (
              <SelectItem key={ib.tag} value={ib.tag} className="font-mono text-sm">
                {ib.tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Bulk Actions Bar ───────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
          <span className="text-sm font-medium">
            {t("clients.selectedCount").replace("{count}", String(selected.size))}
          </span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleBulkToggle(true)}>
            <Power className="h-3 w-3" /> {t("clients.bulkEnable")}
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleBulkToggle(false)}>
            <PowerOff className="h-3 w-3" /> {t("clients.bulkDisable")}
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={handleBulkDelete}>
            <Trash2 className="h-3 w-3" /> {t("clients.bulkDelete")}
          </Button>
        </div>
      )}

      {/* ── No Clients ─────────────────────────────────────────────────────── */}
      {clients.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <Users className="mx-auto h-10 w-10 mb-3 opacity-40" />
          <p>{t("clients.noClients")}</p>
        </div>
      )}

      {/* ── Client Table ───────────────────────────────────────────────────── */}
      {filteredClients.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="w-10 px-3 py-2.5">
                    <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">{t("clients.email")}</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">{t("clients.status")}</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">{t("clients.inboundTag")}</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">{t("clients.trafficUsed")}</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">{t("clients.expiryDate")}</th>
                  <th className="px-3 py-2.5 text-right font-medium text-muted-foreground text-xs">{t("clients.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((c) => {
                  const status = getClientStatus(c);
                  const isOnline = onlineEmails.has(c.email);
                  const trafficTotal = c.traffic_up + c.traffic_down;
                  const trafficPct = c.traffic_limit > 0 ? Math.min((trafficTotal / c.traffic_limit) * 100, 100) : 0;
                  const expiry = getExpiryInfo(c.expiry_date);

                  return (
                    <tr key={c.id} className={cn(
                      "border-b last:border-0 transition-colors hover:bg-muted/20",
                      selected.has(c.id) && "bg-primary/5"
                    )}>
                      {/* Checkbox */}
                      <td className="px-3 py-2.5">
                        <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
                      </td>

                      {/* Email + UUID */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {isOnline && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium truncate">{c.email}</p>
                            <p className="text-[11px] text-muted-foreground font-mono truncate max-w-[180px]">{c.uuid}</p>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className={cn("text-[10px] font-medium", STATUS_STYLES[status])}>
                          {t(STATUS_LABELS[status])}
                        </Badge>
                      </td>

                      {/* Inbound */}
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-xs">{c.inbound_tag}</span>
                      </td>

                      {/* Traffic */}
                      <td className="px-3 py-2.5">
                        <div className="space-y-1 min-w-[140px]">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1">
                              <Upload className="h-3 w-3 text-blue-400" />
                              {formatBytesShort(c.traffic_up)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Download className="h-3 w-3 text-emerald-400" />
                              {formatBytesShort(c.traffic_down)}
                            </span>
                          </div>
                          {c.traffic_limit > 0 ? (
                            <>
                              <Progress value={trafficPct} className="h-1.5" />
                              <p className="text-[10px] text-muted-foreground text-center">
                                {formatBytes(trafficTotal)} / {formatBytes(c.traffic_limit)}
                              </p>
                            </>
                          ) : (
                            <p className="text-[10px] text-muted-foreground">
                              {formatBytes(trafficTotal)} — {t("clients.unlimited")}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Expiry */}
                      <td className="px-3 py-2.5">
                        {c.expiry_date ? (
                          <div className="flex items-center gap-1.5">
                            <Clock className={cn("h-3.5 w-3.5", {
                              "text-emerald-500": expiry.status === "ok",
                              "text-amber-500": expiry.status === "warning",
                              "text-red-500": expiry.status === "expired",
                            })} />
                            <div>
                              <p className="text-xs">{new Date(c.expiry_date).toLocaleDateString()}</p>
                              <p className={cn("text-[10px]", {
                                "text-emerald-500": expiry.status === "ok",
                                "text-amber-500": expiry.status === "warning",
                                "text-red-500": expiry.status === "expired",
                              })}>{expiry.label}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Switch
                            checked={!!c.enabled}
                            onCheckedChange={(checked) => handleToggle(c.id, checked)}
                            className="scale-75"
                          />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => openEdit(c)}>
                                <Pencil className="h-4 w-4 mr-2" /> {t("clients.editClient")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                try { navigator.clipboard.writeText(c.uuid); } catch { const ta=document.createElement("textarea");ta.value=c.uuid;ta.style.cssText="position:fixed;opacity:0";document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta); }
                                toast.success(t("clients.copyUuid"));
                              }}>
                                <Copy className="h-4 w-4 mr-2" /> {t("clients.copyUuid")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openConfigLinks(c.id)}>
                                <Download className="h-4 w-4 mr-2" /> {t("clients.copyLink")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openTrafficDetail(c.id)}>
                                <BarChart3 className="h-4 w-4 mr-2" /> {t("clients.trafficHistory")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setResetId(c.id)}>
                                <RotateCcw className="h-4 w-4 mr-2" /> {t("clients.resetTraffic")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setDeleteId(c.id)} className="text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" /> {t("clients.deleteClient")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add/Edit Dialog ────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? t("clients.editClient") : t("clients.addClient")}</DialogTitle>
            <DialogDescription />
          </DialogHeader>

          <div className="space-y-4">
            {/* UUID */}
            <div className="space-y-1.5">
              <Label className="text-xs">{t("clients.uuid")}</Label>
              <div className="flex gap-2">
                <Input className="h-9 text-sm font-mono flex-1" value={form.uuid}
                  disabled={!!editingId}
                  onChange={(e) => setForm((f) => ({ ...f, uuid: e.target.value }))} />
                {!editingId && (
                  <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"
                    onClick={() => setForm((f) => ({ ...f, uuid: genUUID() }))}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label className="text-xs">{t("clients.email")}</Label>
              <Input className="h-9 text-sm" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder={t("clients.emailPlaceholder")} />
            </div>

            {/* Inbound */}
            <div className="space-y-1.5">
              <Label className="text-xs">{t("clients.inboundTag")}</Label>
              <Select value={form.inbound_tag} disabled={!!editingId}
                onValueChange={(v) => setForm((f) => ({ ...f, inbound_tag: v }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={t("clients.selectInbound")} />
                </SelectTrigger>
                <SelectContent>
                  {inbounds.map((ib) => (
                    <SelectItem key={ib.tag} value={ib.tag} className="text-sm font-mono">
                      {ib.tag} ({ib.protocol}:{ib.port})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Traffic Limit */}
              <div className="space-y-1.5">
                <Label className="text-xs">{t("clients.trafficLimit")} (GB)</Label>
                <Input className="h-9 text-sm" type="number" min={0} step={0.1}
                  value={form.traffic_limit}
                  onChange={(e) => setForm((f) => ({ ...f, traffic_limit: Number(e.target.value) }))} />
                <p className="text-[10px] text-muted-foreground">{t("clients.trafficLimitHint")}</p>
              </div>

              {/* Max IPs */}
              <div className="space-y-1.5">
                <Label className="text-xs">{t("clients.maxIps")}</Label>
                <Input className="h-9 text-sm" type="number" min={0}
                  value={form.max_ips}
                  onChange={(e) => setForm((f) => ({ ...f, max_ips: Number(e.target.value) }))} />
                <p className="text-[10px] text-muted-foreground">{t("clients.maxIpsHint")}</p>
              </div>
            </div>

            {/* Expiry */}
            <div className="space-y-1.5">
              <Label className="text-xs">{t("clients.expiryDate")}</Label>
              <Input className="h-9 text-sm" type="datetime-local"
                value={form.expiry_date}
                onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))} />
            </div>

            {/* Flow */}
            <div className="space-y-1.5">
              <Label className="text-xs">{t("clients.flow")}</Label>
              <Select value={form.flow || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, flow: v === "none" ? "" : v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-sm">(none)</SelectItem>
                  <SelectItem value="xtls-rprx-vision" className="text-sm font-mono">xtls-rprx-vision</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Enabled */}
            <div className="flex items-center justify-between">
              <Label className="text-xs">{t("clients.enabled")}</Label>
              <Switch checked={form.enabled}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, enabled: checked }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? t("clients.editClient") : t("clients.addClient")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ─────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("clients.deleteClient")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("clients.deleteConfirm").replace("{email}", deleteClient?.email || "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground"
              onClick={() => deleteId && handleDelete(deleteId)}>
              {t("clients.deleteClient")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reset Traffic Confirm ──────────────────────────────────────────── */}
      <AlertDialog open={!!resetId} onOpenChange={(o) => !o && setResetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("clients.resetTraffic")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("clients.resetTrafficConfirm").replace("{email}", resetClient?.email || "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetId && handleResetTraffic(resetId)}>
              {t("clients.resetTraffic")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reset All Traffic Confirm ──────────────────────────────────────── */}
      <AlertDialog open={resetAllOpen} onOpenChange={setResetAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("clients.resetAllTraffic")}</AlertDialogTitle>
            <AlertDialogDescription>{t("clients.resetAllTrafficConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground"
              onClick={handleResetAllTraffic}>
              {t("clients.resetAllTraffic")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Traffic History Dialog ──────────────────────────────────────────── */}
      <Dialog open={!!trafficDetailId} onOpenChange={(o) => !o && setTrafficDetailId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {t("clients.trafficHistory")} — {trafficClient?.email}
            </DialogTitle>
            <DialogDescription />
          </DialogHeader>

          {trafficHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No traffic data yet</p>
          ) : (
            <div className="space-y-3">
              {/* Simple bar chart */}
              <div className="space-y-1.5">
                {(() => {
                  // Aggregate by day
                  const dailyMap = new Map<string, { up: number; down: number }>();
                  for (const h of trafficHistory) {
                    const day = h.recorded_at.slice(0, 10);
                    const existing = dailyMap.get(day) || { up: 0, down: 0 };
                    existing.up += h.upload;
                    existing.down += h.download;
                    dailyMap.set(day, existing);
                  }
                  const daily = Array.from(dailyMap.entries()).map(([day, d]) => ({ day, ...d }));
                  const maxVal = Math.max(...daily.map((d) => d.up + d.down), 1);

                  return daily.map((d) => (
                    <div key={d.day} className="flex items-center gap-2 text-xs">
                      <span className="w-20 text-muted-foreground font-mono">{d.day.slice(5)}</span>
                      <div className="flex-1 flex h-5 rounded overflow-hidden bg-muted/30">
                        <div className="bg-blue-500/60 h-full transition-all"
                          style={{ width: `${(d.up / maxVal) * 100}%` }} />
                        <div className="bg-emerald-500/60 h-full transition-all"
                          style={{ width: `${(d.down / maxVal) * 100}%` }} />
                      </div>
                      <span className="w-20 text-right font-mono">{formatBytesShort(d.up + d.down)}</span>
                    </div>
                  ));
                })()}
              </div>
              <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-blue-500/60" /> {t("clients.upload")}</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-emerald-500/60" /> {t("clients.download")}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* ── Config Links Dialog ──────────────────────────────────────────── */}
      <Dialog open={!!configLinksId} onOpenChange={(o) => { if (!o) { setConfigLinksId(null); setGeneratedLink(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              {t("clients.copyLink")}
            </DialogTitle>
            <DialogDescription>
              {clients.find((c) => c.id === configLinksId)?.email}
            </DialogDescription>
          </DialogHeader>

          {configLinksLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : deployOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No deployments found</p>
          ) : (
            <div className="space-y-3">
              {/* Deployment list */}
              <div className="space-y-1.5">
                {deployOptions.map((d) => (
                  <button
                    key={d.id}
                    className={cn(
                      "flex items-center gap-3 w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                      generatingDeploy === d.id ? "opacity-50" : "hover:bg-muted/50"
                    )}
                    disabled={generatingDeploy === d.id}
                    onClick={() => configLinksId && handleSelectDeploy(configLinksId, d.id)}
                  >
                    <Badge variant="secondary" className="text-[10px] capitalize shrink-0">{d.platform}</Badge>
                    <span className="text-sm font-medium truncate flex-1">{d.name}</span>
                    {generatingDeploy === d.id && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              {/* Generated link + copy button */}
              {generatedLink && (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                  <textarea
                    id="config-link-text"
                    readOnly
                    value={generatedLink}
                    dir="ltr"
                    className="w-full rounded bg-muted p-2 text-[10px] font-mono break-all resize-none border-0 focus:ring-1 focus:ring-primary"
                    rows={4}
                    onFocus={(e) => e.target.select()}
                  />
                  <Button
                    size="sm"
                    className="w-full gap-1.5"
                    onClick={() => {
                      const el = document.getElementById("config-link-text") as HTMLTextAreaElement;
                      if (el) {
                        el.focus();
                        el.select();
                        document.execCommand("copy");
                        toast.success(t("clients.copyLink"));
                      }
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> {t("clients.copyLink")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

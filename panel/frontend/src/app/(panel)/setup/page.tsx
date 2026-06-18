"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Check, Loader2, RefreshCw, X,
  Monitor, Terminal, Shield, Server,
  Download, ShieldCheck, ShieldAlert, Trash2, Wifi, FileCode,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Phase1 {
  os: string; isRoot: boolean; nodeInstalled: boolean; nodeVersion: string | null;
  npmInstalled: boolean; gitInstalled: boolean; curlInstalled: boolean; completed: boolean;
}
interface Phase2 {
  xrayInstalled: boolean; xrayVersion: string | null; acmeInstalled: boolean;
  vercelInstalled: boolean; netlifyInstalled: boolean; azureInstalled: boolean;
  railwayInstalled: boolean; fastlyInstalled: boolean; completed: boolean;
}
interface Phase3 {
  domain: string | null; certPath: string | null; certExists: boolean;
  sslExpiry: string | null; sslValid: boolean; completed: boolean;
}
interface Phase4 {
  xrayRunning: boolean; xrayUptime: string | null;
  xrayConfigExists: boolean; xrayConfigReady: boolean; completed: boolean;
}
interface SetupStatus {
  allCompleted: boolean; phase1: Phase1; phase2: Phase2; phase3: Phase3; phase4: Phase4;
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok
    ? <Check className="h-4 w-4 text-emerald-500 shrink-0" />
    : <X className="h-4 w-4 text-destructive shrink-0" />;
}

function StatusRow({ label, ok, value }: { label: string; ok?: boolean; value?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-3">
        {ok !== undefined && <StatusIcon ok={ok} />}
        <span className="text-sm text-foreground">{label}</span>
      </div>
      {value && <span className="text-xs text-muted-foreground font-mono">{value}</span>}
    </div>
  );
}

function ToolRow({ label, installed, version, onInstall, onUninstall, actionLoading, t }: {
  label: string; installed: boolean; version?: string | null;
  onInstall?: () => void; onUninstall?: () => void;
  actionLoading: boolean; t: (k: string) => string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-3">
        <StatusIcon ok={installed} />
        <div>
          <span className="text-sm">{label}</span>
          {version && <span className="text-xs text-muted-foreground font-mono ml-2">{version}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!installed && onInstall && (
          <Button size="sm" variant="outline" onClick={onInstall} disabled={actionLoading} className="h-8 gap-1.5">
            {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {t("setup.installCli")}
          </Button>
        )}
        {installed && onUninstall && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive" disabled={actionLoading}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("common.areYouSure")}</AlertDialogTitle>
                <AlertDialogDescription>{t("setup.uninstallConfirm")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={onUninstall} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {t("setup.uninstall")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

function PhaseCard({
  index, icon: Icon, title, completed, children,
}: {
  index: number; icon: React.ElementType; title: string; completed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className={cn(
        "flex items-center gap-3 px-5 py-4 border-b border-border",
        completed ? "bg-emerald-500/5" : "bg-muted/30",
      )}>
        <div className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold shrink-0",
          completed
            ? "bg-emerald-500 text-white"
            : "bg-muted text-muted-foreground border border-border",
        )}>
          {completed ? <Check className="h-4 w-4" /> : index}
        </div>
        <div className="flex items-center gap-2 flex-1">
          <Icon className={cn("h-4 w-4", completed ? "text-emerald-500" : "text-muted-foreground")} />
          <span className="font-semibold text-sm">{title}</span>
        </div>
        <Badge
          variant={completed ? "default" : "secondary"}
          className={cn("text-xs", completed && "bg-emerald-500 text-white")}
        >
          {completed ? "Complete" : "Pending"}
        </Badge>
      </div>
      <div className="px-5 py-1">{children}</div>
    </div>
  );
}

export default function SetupPage() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [certDomain, setCertDomain] = useState("");
  const { t } = useI18n();

  const fetchStatus = () => {
    setLoading(true);
    api.get("/setup/status")
      .then((r) => {
        setStatus(r.data);
        if (r.data.phase3.domain && !certDomain) setCertDomain(r.data.phase3.domain);
      })
      .catch(() => toast.error(t("setup.failed")))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchStatus(); }, []);

  const runAction = async (key: string, endpoint: string, body?: Record<string, any>) => {
    setActionLoading(key);
    try {
      const { data } = await api.post(endpoint, body);
      if (data.success) toast.success(t("setup.success"));
      else toast.error(data.output || t("setup.failed"));
      fetchStatus();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("setup.failed"));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading && !status) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="h-16 bg-muted/30 animate-pulse" />
              <div className="px-5 py-4 space-y-3">
                {[...Array(3)].map((_, j) => <div key={j} className="h-5 bg-muted rounded animate-pulse" />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!status) return null;

  const phases = [status.phase1, status.phase2, status.phase3, status.phase4];
  const completedCount = phases.filter((p) => p.completed).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("setup.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {status.allCompleted
              ? t("setup.overallComplete")
              : `${completedCount} of 4 phases complete`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStatus} disabled={loading} className="gap-2">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-1.5">
        {phases.map((phase, i) => (
          <div key={i} className="flex items-center flex-1 gap-1.5">
            <div className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-300",
              phase.completed ? "bg-emerald-500" : "bg-muted",
            )} />
            {i < 3 && <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
      {/* Phase 1 — System */}
      <PhaseCard index={1} icon={Monitor} title={t("setup.phase1Title")} completed={status.phase1.completed}>
        <StatusRow label={t("setup.os")} value={status.phase1.os} />
        <StatusRow label={t("setup.rootAccess")} ok={status.phase1.isRoot} />
        <StatusRow label={t("setup.nodeJs")} ok={status.phase1.nodeInstalled}
          value={status.phase1.nodeVersion ?? undefined} />
        <StatusRow label={t("setup.npm")} ok={status.phase1.npmInstalled} />
        <StatusRow label={t("setup.git")} ok={status.phase1.gitInstalled} />
        <StatusRow label={t("setup.curl")} ok={status.phase1.curlInstalled} />
        {!status.phase1.completed && (
          <div className="py-4">
            <Button className="w-full gap-2" onClick={() => runAction("p1", "/setup/phase1/run")} disabled={actionLoading === "p1"}>
              {actionLoading === "p1" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {t("setup.installPrereqs")}
            </Button>
          </div>
        )}
      </PhaseCard>

      {/* Phase 2 — CLI Tools */}
      <PhaseCard index={2} icon={Terminal} title={t("setup.phase2Title")} completed={status.phase2.completed}>
        <ToolRow
          label={t("setup.xrayCore")} installed={status.phase2.xrayInstalled}
          version={status.phase2.xrayVersion}
          onInstall={() => runAction("xray-i", "/setup/phase2/install-xray")}
          onUninstall={() => runAction("xray-u", "/setup/phase2/uninstall", { tool: "xray" })}
          actionLoading={actionLoading === "xray-i" || actionLoading === "xray-u"} t={t}
        />
        <ToolRow
          label={t("setup.acmeSh")} installed={status.phase2.acmeInstalled}
          onInstall={() => runAction("acme-i", "/setup/phase2/install-acme")}
          onUninstall={() => runAction("acme-u", "/setup/phase2/uninstall", { tool: "acme" })}
          actionLoading={actionLoading === "acme-i" || actionLoading === "acme-u"} t={t}
        />
        <ToolRow
          label={t("setup.vercelCli")} installed={status.phase2.vercelInstalled}
          onInstall={() => runAction("vercel-i", "/setup/phase2/install-cli", { tool: "vercel" })}
          onUninstall={() => runAction("vercel-u", "/setup/phase2/uninstall", { tool: "vercel" })}
          actionLoading={actionLoading === "vercel-i" || actionLoading === "vercel-u"} t={t}
        />
        <ToolRow
          label={t("setup.netlifyCli")} installed={status.phase2.netlifyInstalled}
          onInstall={() => runAction("netlify-i", "/setup/phase2/install-cli", { tool: "netlify" })}
          onUninstall={() => runAction("netlify-u", "/setup/phase2/uninstall", { tool: "netlify" })}
          actionLoading={actionLoading === "netlify-i" || actionLoading === "netlify-u"} t={t}
        />
        <ToolRow
          label={t("setup.azureCli")} installed={status.phase2.azureInstalled}
          onInstall={() => runAction("azure-i", "/setup/phase2/install-cli", { tool: "azure" })}
          onUninstall={() => runAction("azure-u", "/setup/phase2/uninstall", { tool: "azure" })}
          actionLoading={actionLoading === "azure-i" || actionLoading === "azure-u"} t={t}
        />
        <ToolRow
          label={t("setup.railwayCli")} installed={status.phase2.railwayInstalled}
          onInstall={() => runAction("railway-i", "/setup/phase2/install-cli", { tool: "railway" })}
          onUninstall={() => runAction("railway-u", "/setup/phase2/uninstall", { tool: "railway" })}
          actionLoading={actionLoading === "railway-i" || actionLoading === "railway-u"} t={t}
        />
        <ToolRow
          label={t("setup.fastlyCli")} installed={status.phase2.fastlyInstalled}
          onInstall={() => runAction("fastly-i", "/setup/phase2/install-cli", { tool: "fastly" })}
          onUninstall={() => runAction("fastly-u", "/setup/phase2/uninstall", { tool: "fastly" })}
          actionLoading={actionLoading === "fastly-i" || actionLoading === "fastly-u"} t={t}
        />
      </PhaseCard>

      {/* Phase 3 — SSL */}
      <PhaseCard index={3} icon={Shield} title={t("setup.phase3Title")} completed={status.phase3.completed}>
        <StatusRow label={t("setup.domain")} value={status.phase3.domain || "—"} />
        <StatusRow label={t("setup.certFile")} ok={status.phase3.certExists} />
        <StatusRow
          label={t("setup.sslStatus")}
          ok={status.phase3.sslValid}
          value={
            status.phase3.certExists
              ? (status.phase3.sslValid ? t("setup.sslStatusValid") : t("setup.sslStatusExpired"))
              : t("setup.sslStatusMissing")
          }
        />
        {status.phase3.sslExpiry && (
          <StatusRow label={t("setup.sslExpiry")} value={status.phase3.sslExpiry} />
        )}
        <div className="py-4 space-y-3">
          <Input
            value={certDomain}
            onChange={(e) => setCertDomain(e.target.value)}
            placeholder={t("setup.domainPlaceholder")}
            className="h-9"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline" className="gap-2"
              onClick={async () => {
                setActionLoading("cert-issue");
                try {
                  await api.post("/setup/phase3/issue-cert", { domain: certDomain });
                  // nginx stops → connection drops. Poll for result after it comes back.
                  toast.info("Setting certificate... please wait ~30s");
                  const poll = async (retries = 30): Promise<void> => {
                    await new Promise(r => setTimeout(r, 5000));
                    try {
                      const { data } = await api.get("/setup/phase3/cert-status");
                      if (data.status === "running") {
                        if (retries > 0) return poll(retries - 1);
                        toast.error("Timeout");
                      } else if (data.status === "done") {
                        toast.success(t("setup.success"));
                        fetchStatus();
                      } else {
                        toast.error(data.output || t("setup.failed"));
                      }
                    } catch {
                      if (retries > 0) return poll(retries - 1);
                      toast.error(t("setup.failed"));
                    }
                  };
                  await poll();
                } catch {
                  // Expected — nginx dropped. Start polling.
                  const poll = async (retries = 30): Promise<void> => {
                    await new Promise(r => setTimeout(r, 5000));
                    try {
                      const { data } = await api.get("/setup/phase3/cert-status");
                      if (data.status === "running") {
                        if (retries > 0) return poll(retries - 1);
                        toast.error("Timeout");
                      } else if (data.status === "done") {
                        toast.success(t("setup.success"));
                        fetchStatus();
                      } else {
                        toast.error(data.output || t("setup.failed"));
                      }
                    } catch {
                      if (retries > 0) return poll(retries - 1);
                      toast.error(t("setup.failed"));
                    }
                  };
                  await poll();
                } finally {
                  setActionLoading(null);
                }
              }}
              disabled={!certDomain || !!actionLoading}
            >
              {actionLoading === "cert-issue" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {t("setup.issueCert")}
            </Button>
            <Button
              variant="outline" className="gap-2"
              onClick={() => runAction("cert-verify", "/setup/phase3/verify-cert", { domain: certDomain })}
              disabled={!certDomain || !!actionLoading}
            >
              {actionLoading === "cert-verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
              {t("setup.verifyCert")}
            </Button>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full gap-2 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60">
                <Trash2 className="h-4 w-4" />
                {t("setup.clearCache")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("common.areYouSure")}</AlertDialogTitle>
                <AlertDialogDescription>{t("common.cannotBeUndone")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={() => runAction("cert-clear", "/setup/phase3/clear-cache")} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {t("setup.clearCache")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </PhaseCard>

      {/* Phase 4 — Xray Service */}
      <PhaseCard index={4} icon={Server} title={t("setup.phase4Title")} completed={status.phase4.completed}>
        <StatusRow label={t("setup.xrayConfig")} ok={status.phase4.xrayConfigReady} />
        <StatusRow
          label={t("setup.xrayService")}
          ok={status.phase4.xrayRunning}
          value={status.phase4.xrayRunning ? t("setup.running") : t("setup.stopped")}
        />
        {status.phase4.xrayUptime && (
          <StatusRow label={t("setup.xrayUptime")} value={status.phase4.xrayUptime} />
        )}
        <div className="py-4 space-y-2">
          {(
            <Button
              variant="outline" className="w-full gap-2"
              onClick={() => runAction("init-config", "/setup/phase4/init-config", { domain: certDomain || status.phase3.domain })}
              disabled={!(certDomain || status.phase3.domain) || !!actionLoading}
            >
              {actionLoading === "init-config" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCode className="h-4 w-4" />}
              {t("setup.initConfig")}
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={!!actionLoading}>
                  <RefreshCw className="h-4 w-4" />
                  {t("setup.restartXray")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("configs.restartTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("configs.restartDescription")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => runAction("xray-restart", "/setup/phase4/restart-xray")}>
                    {t("common.confirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              variant="outline" className="gap-2"
              onClick={() => runAction("conn-test", "/setup/phase4/test-connection", { domain: certDomain || status.phase3.domain })}
              disabled={!(certDomain || status.phase3.domain) || !!actionLoading}
            >
              {actionLoading === "conn-test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
              {t("setup.testConnection")}
            </Button>
          </div>
        </div>
      </PhaseCard>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Copy, Check, RefreshCw, Loader2, Server, Shield, Clock, QrCode, Wifi, WifiOff, Trash2 } from "lucide-react";

interface ServerStatus {
  xrayRunning: boolean;
  uptime: string | null;
  sslExpiry: string | null;
  domain: string | null;
}

interface DeployLink {
  id: number;
  platform: string;
  projectName: string;
  url: string;
  configLink: string;
  publicPath?: string;
}

interface AllLinks {
  serverLink: string | null;
  deployLinks: DeployLink[];
}

function LinkCard({ label, sublabel, link, platform, checkUrl, checkPath, deployId, onDeleted }: {
  label: string; sublabel?: string; link: string; platform?: string; checkUrl?: string;
  checkPath?: string; deployId?: number; onDeleted?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [checkResult, setCheckResult] = useState<{ ok: boolean; status: number; ms: number } | null>(null);
  const { t } = useI18n();

  const handleDelete = async () => {
    if (!deployId) return;
    setDeleting(true);
    try {
      await api.delete(`/deploy/${deployId}`);
      toast.success(t("deploy.deletedSuccess"));
      onDeleted?.();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("deploy.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  const handleCheck = async () => {
    if (!checkUrl) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const params = new URLSearchParams({ url: checkUrl });
      if (checkPath) params.set("path", checkPath);
      const r = await api.get(`/configs/check-relay?${params.toString()}`);
      setCheckResult(r.data);
    } catch {
      setCheckResult({ ok: false, status: 0, ms: 0 });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium">{label}</p>
          {sublabel && <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{sublabel}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {checkResult && (
            <span className={`text-[10px] font-mono ${checkResult.ok ? "text-green-500" : "text-destructive"}`}>
              {checkResult.ok ? `✓ ${checkResult.status} (${checkResult.ms}ms)` : `✗ ${checkResult.status || "err"}`}
            </span>
          )}
          {platform && (
            <Badge variant="secondary" className="h-5 text-[10px] capitalize">{platform}</Badge>
          )}
        </div>
      </div>
      <textarea
        id={`config-link-${label}`}
        readOnly
        value={link}
        dir="ltr"
        className="w-full rounded bg-muted p-2 text-[10px] font-mono break-all resize-none border-0 focus:ring-1 focus:ring-primary"
        rows={3}
        onFocus={(e) => e.target.select()}
      />
      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => {
          const el = document.getElementById(`config-link-${label}`) as HTMLTextAreaElement;
          if (el) { el.focus(); el.select(); document.execCommand("copy"); }
          setCopied(true);
          toast.success(t("configs.copied"));
          setTimeout(() => setCopied(false), 2000);
        }}>
          {copied ? <><Check className="h-3 w-3" /> {t("configs.copied")}</> : <><Copy className="h-3 w-3" /> {t("configs.copyLink")}</>}
        </Button>
        {checkUrl && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleCheck} disabled={checking}>
                {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : checkResult ? (checkResult.ok ? <Wifi className="h-3.5 w-3.5 text-green-500" /> : <WifiOff className="h-3.5 w-3.5 text-destructive" />) : <Wifi className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Check relay</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setShowQR(!showQR)}>
              <QrCode className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>QR Code</TooltipContent>
        </Tooltip>
        {deployId && (
          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="icon" className="h-7 w-7 text-destructive hover:text-destructive border-destructive/20 hover:border-destructive/50" disabled={deleting}>
                    {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent>{t("common.delete")}</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("deploy.deleteTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("deploy.deleteDescription")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {t("common.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      <Collapsible open={showQR} onOpenChange={setShowQR}>
        <CollapsibleContent>
          <div className="flex justify-center rounded-lg bg-white p-4">
            <QRCodeSVG value={link} size={160} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export default function ConfigsPage() {
  const [allLinks, setAllLinks] = useState<AllLinks | null>(null);
  const [linksLoading, setLinksLoading] = useState(true);
  const [config, setConfig] = useState<object | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [restarting, setRestarting] = useState(false);
  const { t } = useI18n();

  const loadLinks = () => {
    setLinksLoading(true);
    api.get("/configs/all-links")
      .then((r) => setAllLinks(r.data))
      .catch(() => setAllLinks({ serverLink: null, deployLinks: [] }))
      .finally(() => setLinksLoading(false));
  };

  useEffect(() => {
    loadLinks();
    api.get("/configs/xray").then((r) => setConfig(r.data)).catch(() => {});
    api.get("/configs/server-status").then((r) => setStatus(r.data)).catch(() => {});
  }, []);

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await api.post("/configs/xray/restart");
      toast.success(t("configs.restartSuccess"));
      const s = await api.get("/configs/server-status");
      setStatus(s.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Restart failed");
    } finally {
      setRestarting(false);
    }
  };

  const totalLinks = (allLinks?.serverLink ? 1 : 0) + (allLinks?.deployLinks.length || 0);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t("configs.title")}</h1>

      <Tabs defaultValue="connection" className="w-full">
        <TabsList>
          <TabsTrigger value="connection">
            {t("configs.connectionTab")}
            {totalLinks > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{totalLinks}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="status">{t("configs.statusTab")}</TabsTrigger>
          <TabsTrigger value="config">{t("configs.configTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="connection" className="mt-4 space-y-3">
          {linksLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : totalLinks === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {t("configs.noLink")}
              </CardContent>
            </Card>
          ) : (
            <>
              {allLinks?.serverLink && (
                <LinkCard
                  label={t("configs.serverLink") || "Server (Direct)"}
                  sublabel={t("configs.serverLinkDesc") || "Direct connection via your VPS"}
                  link={allLinks.serverLink}
                />
              )}
              {allLinks?.deployLinks.map((d) => (
                <LinkCard
                  key={`${d.platform}-${d.projectName}`}
                  label={d.projectName}
                  sublabel={d.url}
                  link={d.configLink}
                  platform={d.platform}
                  checkUrl={d.url}
                  checkPath={d.publicPath}
                  deployId={d.id}
                  onDeleted={loadLinks}
                />
              ))}
              {allLinks && allLinks.deployLinks.length > 0 && (
                <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-muted-foreground" onClick={loadLinks}>
                  <RefreshCw className="h-3 w-3 mr-1" /> {t("common.refresh") || "Refresh"}
                </Button>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="status" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-4 w-4" />
                {t("configs.serverStatus")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {status ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t("configs.xrayService")}</span>
                    <Badge variant={status.xrayRunning ? "default" : "destructive"} className="h-5 text-[10px]">
                      {status.xrayRunning ? t("configs.running") : t("configs.stopped")}
                    </Badge>
                  </div>
                  <Separator />
                  {status.uptime && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{t("configs.uptime")}</span>
                        <span className="text-sm">{status.uptime}</span>
                      </div>
                      <Separator />
                    </>
                  )}
                  {status.domain && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t("configs.domain")}</span>
                        <span className="text-sm font-mono">{status.domain}</span>
                      </div>
                      <Separator />
                    </>
                  )}
                  {status.sslExpiry && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3" />{t("configs.sslExpiry")}</span>
                      <span className="text-sm">{status.sslExpiry}</span>
                    </div>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full mt-2" disabled={restarting}>
                        {restarting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("configs.restarting")}</> : <><RefreshCw className="h-3.5 w-3.5" /> {t("configs.restartXray")}</>}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("configs.restartTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("configs.restartDescription")}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRestart}>{t("common.confirm")}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              ) : (
                <div className="space-y-2">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("configs.xrayConfig")}</CardTitle>
            </CardHeader>
            <CardContent>
              {config ? (
                <ScrollArea className="h-80 rounded-lg bg-muted">
                  <pre className="p-4 text-xs" dir="ltr">{JSON.stringify(config, null, 2)}</pre>
                </ScrollArea>
              ) : (
                <p className="text-sm text-muted-foreground">{t("configs.noConfig")}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

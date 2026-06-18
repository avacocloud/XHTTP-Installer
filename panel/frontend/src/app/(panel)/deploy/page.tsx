"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import api from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { deployStep2Schema, type DeployStep2Values } from "@/lib/validations";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Plus, Trash2, RefreshCw, Heart, Loader2, ExternalLink,
  ArrowLeft, ArrowRight, Check, X, Copy, ChevronDown, ChevronUp, Zap, Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Token  { id: number; platform: string; label: string; }
interface Deploy {
  id: number; platform: string; project_name: string; deploy_url: string;
  target_domain: string; status: string; created_at: string;
}
interface ProgressEvent {
  step: number; total: number; label: string; detail?: string;
  status: "active" | "done" | "error"; url?: string; config?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PLATFORM_CDN: Record<string, string> = {
  vercel:  "https://cdn.simpleicons.org/vercel/ffffff",
  netlify: "https://cdn.simpleicons.org/netlify/00C7B7",
  azure:   "https://cdn.simpleicons.org/microsoftazure/ffffff",
  railway: "https://cdn.simpleicons.org/railway/7C3AED",
  fastly:  "https://cdn.simpleicons.org/fastly/FF282D",
};

const AZURE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path fill="#fff" d="M33.34 6.54h26.04L33.78 89.39a4.1 4.1 0 01-3.89 2.85H8.14a4.1 4.1 0 01-3.87-5.46L27.45 9.39a4.1 4.1 0 013.89-2.85zm29.4 53.72H29.88a1.89 1.89 0 00-1.29 3.27l26.52 24.76a4.13 4.13 0 002.82 1.1h23.37z"/></svg>`;
const AZURE_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(AZURE_SVG)}`;

function PlatformIcon({ id, className }: { id: string; className?: string }) {
  if (id === "azure") return <img src={AZURE_DATA_URI} alt="azure" className={className} />;
  const src = PLATFORM_CDN[id];
  if (!src) return null;
  return <img src={src} alt={id} className={className} />;
}

const PLATFORMS = [
  {
    id: "vercel", label: "Vercel",
    color: "text-foreground",
    glow: "shadow-[0_0_0_2px_rgba(0,0,0,0.9),0_0_20px_4px_rgba(0,0,0,0.35)] dark:shadow-[0_0_0_2px_rgba(255,255,255,0.9),0_0_20px_4px_rgba(255,255,255,0.25)]",
    bg: "bg-neutral-950/5 dark:bg-white/5",
  },
  {
    id: "netlify", label: "Netlify",
    color: "text-teal-500",
    glow: "shadow-[0_0_0_2px_rgb(20,184,166),0_0_20px_4px_rgba(20,184,166,0.35)]",
    bg: "bg-teal-500/5",
  },
  {
    id: "azure", label: "Azure",
    color: "text-blue-500",
    glow: "shadow-[0_0_0_2px_rgb(59,130,246),0_0_20px_4px_rgba(59,130,246,0.35)]",
    bg: "bg-blue-500/5",
  },
  {
    id: "railway", label: "Railway",
    color: "text-violet-400",
    glow: "shadow-[0_0_0_2px_rgb(124,58,237),0_0_20px_4px_rgba(124,58,237,0.35)]",
    bg: "bg-violet-500/5",
  },
  {
    id: "fastly", label: "Fastly",
    color: "text-red-400",
    glow: "shadow-[0_0_0_2px_rgb(220,38,38),0_0_20px_4px_rgba(220,38,38,0.35)]",
    bg: "bg-red-500/5",
  },
];

const RAILWAY_REGIONS = [
  { value: "us-west2",                label: "US West",         flag: "🇺🇸" },
  { value: "us-east4-eqdc4a",         label: "US East",         flag: "🇺🇸" },
  { value: "europe-west4-drams3a",    label: "EU West",         flag: "🇳🇱" },
  { value: "asia-southeast1-eqsg3a",  label: "Southeast Asia",  flag: "🇸🇬" },
] as const;

const AZURE_REGIONS = [
  { value: "westeurope",    label: "West Europe",    flag: "🇳🇱" },
  { value: "northeurope",   label: "North Europe",   flag: "🇮🇪" },
  { value: "uksouth",       label: "UK South",       flag: "🇬🇧" },
  { value: "eastus",        label: "East US",        flag: "🇺🇸" },
  { value: "eastus2",       label: "East US 2",      flag: "🇺🇸" },
  { value: "centralus",     label: "Central US",     flag: "🇺🇸" },
  { value: "westus2",       label: "West US 2",      flag: "🇺🇸" },
  { value: "southeastasia", label: "Southeast Asia", flag: "🇸🇬" },
  { value: "eastasia",      label: "East Asia",      flag: "🇭🇰" },
  { value: "japaneast",     label: "Japan East",     flag: "🇯🇵" },
] as const;

const AZURE_PROFILES: {
  id: string; label: string; sku: string; maxInflight: number;
  desc: string; note: string; recommended?: boolean;
}[] = [
  { id: "free",        label: "Free",        sku: "F1", maxInflight: 32,  desc: "32 conn",  note: "No cost" },
  { id: "economy",     label: "Economy",     sku: "B1", maxInflight: 128, desc: "128 conn", note: "~$13/mo" },
  { id: "balanced",    label: "Balanced",    sku: "B2", maxInflight: 256, desc: "256 conn", note: "~$25/mo", recommended: true },
  { id: "performance", label: "Performance", sku: "B3", maxInflight: 512, desc: "512 conn", note: "~$50/mo" },
];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  active: "default", deploying: "secondary", failed: "destructive",
  pending: "secondary", stopped: "destructive",
};

const STEPS = ["deploy.stepPlatform", "deploy.stepDetails", "deploy.stepConfirm"] as const;

const DEFAULT_VALUES = {
  tokenId: undefined as any,
  projectName: "", targetDomain: "", relayPath: "/api", publicPath: "/api",
  resourceGroup: "", sku: "B2", location: "westeurope",
  targetPort: 443, maxInflight: 256, maxUpBps: 0, maxDownBps: 0,
  region: "europe-west4-drams3a", upstreamTimeoutMs: 0,
  customDomain: "",
};

// ── Step Indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current, steps, t }: { current: number; steps: readonly string[]; t: (k: string) => string }) {
  return (
    <div className="flex items-center mb-6">
      {steps.map((labelKey, i) => {
        const stepNum = i + 1;
        const done   = current > stepNum;
        const active = current === stepNum;
        return (
          <div key={labelKey} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all",
                done   && "bg-primary text-primary-foreground shadow-sm",
                active && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                !done && !active && "bg-muted text-muted-foreground",
              )}>
                {done ? <Check className="h-3.5 w-3.5" /> : stepNum}
              </div>
              <span className={cn(
                "text-[10px] font-medium whitespace-nowrap",
                active ? "text-foreground" : "text-muted-foreground",
              )}>
                {t(labelKey)}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn("h-px flex-1 mx-2 mb-4 transition-colors", done ? "bg-primary" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Summary Row ───────────────────────────────────────────────────────────────

function SummaryRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-xs font-medium", mono && "font-mono")}>{value}</span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DeployPage() {
  const [deploys, setDeploys]           = useState<Deploy[]>([]);
  const [tokens, setTokens]             = useState<Token[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showWizard, setShowWizard]     = useState(false);
  const [step, setStep]                 = useState(1);
  const [platform, setPlatform]         = useState("");
  const [deploying, setDeploying]       = useState(false);
  const [progressMap, setProgressMap]   = useState<Map<number, ProgressEvent>>(new Map());
  const [progressTotal, setProgressTotal] = useState(8);
  const [progressDone, setProgressDone] = useState(false);
  const [progressUrl, setProgressUrl]   = useState<string | null>(null);
  const [progressConfig, setProgressConfig] = useState<string | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [serverDomain, setServerDomain] = useState("");
  const { t, dir } = useI18n();

  const form = useForm<DeployStep2Values>({
    resolver: zodResolver(deployStep2Schema),
    defaultValues: DEFAULT_VALUES,
  });

  const load = () => {
    setLoading(true);
    Promise.all([api.get("/deploy"), api.get("/tokens")])
      .then(([d, tk]) => { setDeploys(d.data); setTokens(tk.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get("/configs/server-status").then((r) => {
      if (r.data.domain) setServerDomain(r.data.domain);
    }).catch(() => {});
  }, []);

  const filteredTokens = tokens.filter((tk) => tk.platform === platform);
  const ArrowNext = dir === "rtl" ? ArrowLeft : ArrowRight;
  const ArrowPrev = dir === "rtl" ? ArrowRight : ArrowLeft;

  const openWizard = () => {
    setStep(1); setPlatform(""); form.reset(DEFAULT_VALUES);
    setShowAdvanced(false); setShowWizard(true);
  };
  const closeWizard = () => { setShowWizard(false); setStep(1); setPlatform(""); };

  const goToStep2 = () => {
    if (!platform) return;
    form.reset({ ...DEFAULT_VALUES, targetDomain: serverDomain });
    setShowAdvanced(false);
    setStep(2);
  };

  const goToStep3 = async () => {
    const valid = await form.trigger();
    if (valid) setStep(3);
  };

  const handleDeploy = async () => {
    setDeploying(true);
    try {
      const values = form.getValues();
      const body: Record<string, any> = {
        tokenId: values.tokenId, projectName: values.projectName,
        targetDomain: values.targetDomain, relayPath: values.relayPath, publicPath: values.publicPath,
      };
      if (platform === "azure") {
        body.resourceGroup   = values.resourceGroup;
        body.sku             = values.sku;
        body.location        = values.location;
        body.targetPort      = values.targetPort;
        body.maxInflight     = values.maxInflight;
        body.maxUpBps        = values.maxUpBps;
        body.maxDownBps      = values.maxDownBps;
      }
      if (platform === "railway") {
        body.region            = values.region;
        body.targetPort        = values.targetPort;
        body.maxInflight       = values.maxInflight;
        body.upstreamTimeoutMs = values.upstreamTimeoutMs;
      }
      if (platform === "fastly" && values.customDomain) {
        body.customDomain = values.customDomain;
      }

      // All platforms use SSE streaming now
      const { data } = await api.post(`/deploy/${platform}`, body);
      setProgressMap(new Map()); setProgressTotal(0);
      setProgressDone(false); setProgressUrl(null); setProgressConfig(null);
      setShowProgress(true);
      closeWizard(); form.reset();

      const token = localStorage.getItem("accessToken");
      const es = new EventSource(`/api/v1/deploy/${data.id}/stream?token=${token}`);
      es.onmessage = (e) => {
        const event: ProgressEvent = JSON.parse(e.data);
        if (event.total > 0) setProgressTotal(event.total);
        setProgressMap((prev) => {
          const next = new Map(prev);
          // Mark all earlier steps as done when a later step arrives
          next.forEach((ev, s) => {
            if (s < event.step && ev.status === "active") {
              next.set(s, { ...ev, status: "done" });
            }
          });
          next.set(event.step, event);
          return next;
        });
        if (event.status === "done" && event.step === event.total) {
          setProgressDone(true);
          if (event.url)    setProgressUrl(event.url);
          if (event.config) setProgressConfig(event.config);
          es.close(); load();
        }
        if (event.status === "error") { setProgressDone(true); es.close(); load(); }
      };
      es.onerror = () => { setProgressDone(true); es.close(); };
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  const handleRedeploy = async (id: number) => {
    setActionLoading(id);
    try { await api.post(`/deploy/${id}/redeploy`); toast.success(t("deploy.redeploySuccess")); load(); }
    catch (err: any) { toast.error(err.response?.data?.error || t("deploy.redeployFailed")); }
    finally { setActionLoading(null); }
  };

  const handleDelete = async (id: number) => {
    setActionLoading(id);
    try { await api.delete(`/deploy/${id}`); toast.success(t("deploy.deletedSuccess")); load(); }
    catch (err: any) { toast.error(err.response?.data?.error || t("deploy.deleteFailed")); }
    finally { setActionLoading(null); }
  };

  const handleHealth = async (id: number) => {
    setActionLoading(id);
    try {
      const { data } = await api.get(`/deploy/${id}/health`);
      toast.success(t("deploy.healthResult", { status: String(data.statusCode), time: String(data.responseTimeMs) }));
    } catch { toast.error("Health check failed"); }
    finally { setActionLoading(null); }
  };

  // ── Progress Dialog ─────────────────────────────────────────────────────────
  const hasError = Array.from(progressMap.values()).some((e) => e.status === "error");
  const errEv    = Array.from(progressMap.values()).find((e)  => e.status === "error");

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("deploy.title")}</h1>
          {!loading && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {deploys.length} {t("deploy.deployments").toLowerCase()}
            </p>
          )}
        </div>
        <Button size="sm" onClick={openWizard}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          {t("deploy.newDeploy")}
        </Button>
      </div>

      {/* ── Progress Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={showProgress} onOpenChange={(open) => { if (!open && progressDone) setShowProgress(false); }}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => !progressDone && e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-sm">
              {progressDone
                ? hasError ? t("deploy.deployFailed") : t("deploy.deploySuccess")
                : t("deploy.deploying")}
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[40vh] overflow-y-auto space-y-1.5 py-1 pr-1">
            {progressTotal === 0 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("deploy.deploying")}…
              </div>
            ) : (
              Array.from({ length: progressTotal }, (_, i) => {
                const stepNum = i + 1;
                const ev = progressMap.get(stepNum);
                const isPending = !ev;
                const isActive  = ev?.status === "active";
                const isDone    = ev?.status === "done";
                const isError   = ev?.status === "error";
                return (
                  <div key={stepNum} className="flex items-start gap-2.5">
                    <div className="mt-0.5 shrink-0 w-4">
                      {isPending && <div className="h-4 w-4 rounded-full border-2 border-muted" />}
                      {isActive  && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                      {isDone    && <Check   className="h-4 w-4 text-green-500" />}
                      {isError   && <X       className="h-4 w-4 text-destructive" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-xs",
                        isPending && "text-muted-foreground/50",
                        isActive  && "font-medium text-foreground",
                        isDone    && "text-muted-foreground",
                        isError   && "font-medium text-destructive",
                      )}>
                        {ev?.label ?? `Step ${stepNum}`}
                      </p>
                      {ev?.detail && (
                        <div className="mt-1 rounded bg-muted p-2 text-[10px] font-mono break-all text-muted-foreground max-h-20 overflow-y-auto">
                          {ev.detail}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {progressDone && !hasError && progressUrl && (
            <div className="mt-2 rounded-lg bg-muted p-3 space-y-2.5 text-xs border">
              <div className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                <a href={progressUrl} target="_blank" rel="noopener noreferrer"
                  className="text-primary hover:underline break-all font-mono text-[10px]">{progressUrl}</a>
              </div>
              {progressConfig && (
                <>
                  <div className="h-px bg-border" />
                  <div className="space-y-1.5">
                    <p className="text-muted-foreground font-medium text-[10px]">Config link:</p>
                    <div className="rounded bg-background border p-1.5 font-mono text-[10px] break-all select-all">{progressConfig}</div>
                    <button
                      className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                      onClick={() => { navigator.clipboard.writeText(progressConfig!); toast.success(t("configs.copied")); }}
                    >
                      <Copy className="h-3 w-3" /> Copy config link
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {progressDone && hasError && errEv && (
            <button
              className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => { navigator.clipboard.writeText(`${errEv.label}\n${errEv.detail || ""}`); toast.success("Copied"); }}
            >
              <Copy className="h-3 w-3" /> Copy error
            </button>
          )}

          {progressDone && (
            <div className="flex justify-end pt-2">
              <button className="text-xs text-muted-foreground hover:text-foreground underline"
                onClick={() => setShowProgress(false)}>{t("common.close")}</button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Deploy Wizard Dialog ────────────────────────────────────────────── */}
      <Dialog open={showWizard} onOpenChange={(open) => { if (!open) closeWizard(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="text-base font-semibold">{t("deploy.wizard")}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <StepIndicator current={step} steps={STEPS} t={t} />

            {/* ── Step 1: Platform ── */}
            {step === 1 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">{t("deploy.choosePlatform")}</p>
                <div className="grid grid-cols-3 gap-2.5">
                  {PLATFORMS.map((p) => {
                    const selected = platform === p.id;
                    return (
                      <button key={p.id} type="button" onClick={() => setPlatform(p.id)}
                        className={cn(
                          "relative rounded-xl border-2 flex items-center gap-3 px-4 py-3.5 transition-all duration-150 group text-left",
                          selected
                            ? cn("border-transparent", p.bg, p.glow)
                            : "border-border bg-muted/20 hover:bg-muted/40 hover:border-muted-foreground/25",
                        )}>
                        {selected && (
                          <div className="absolute top-2 right-2 h-4 w-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                            <Check className="h-2.5 w-2.5 text-primary-foreground" />
                          </div>
                        )}
                        <div className={cn(
                          "shrink-0 transition-all duration-150",
                          p.color,
                          selected ? "opacity-100" : "opacity-50 group-hover:opacity-80",
                        )}>
                          <PlatformIcon id={p.id} className="h-8 w-8" />
                        </div>
                        <span className={cn(
                          "text-sm font-semibold leading-none",
                          selected ? p.color : "text-muted-foreground group-hover:text-foreground",
                        )}>
                          {p.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Step 2: Details ── */}
            {step === 2 && (
              <Form {...form}>
                <div className="space-y-4">
                  {/* Token */}
                  <FormField control={form.control} name="tokenId" render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-xs font-medium">{t("deploy.selectToken")}</FormLabel>
                      {filteredTokens.length === 0 ? (
                        <p className="text-xs text-destructive py-2">{t("deploy.noTokens", { platform })}</p>
                      ) : (
                        <Select value={field.value ? String(field.value) : ""} onValueChange={(v) => field.onChange(Number(v))}>
                          <FormControl>
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue placeholder={t("deploy.selectTokenPlaceholder")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {filteredTokens.map((tk) => (
                              <SelectItem key={tk.id} value={String(tk.id)}>{tk.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <FormMessage>{form.formState.errors.tokenId && t(form.formState.errors.tokenId.message!)}</FormMessage>
                    </FormItem>
                  )} />

                  {/* Project + Domain */}
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="projectName" render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-xs font-medium">{t("deploy.projectName")}</FormLabel>
                        <FormControl><Input className="h-9 text-sm" placeholder="my-relay" {...field} /></FormControl>
                        <FormMessage className="text-[10px]">{form.formState.errors.projectName && t(form.formState.errors.projectName.message!)}</FormMessage>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="targetDomain" render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-xs font-medium">{t("deploy.targetDomain")}</FormLabel>
                        <FormControl><Input className="h-9 text-sm" placeholder="example.com" {...field} /></FormControl>
                        <FormMessage className="text-[10px]">{form.formState.errors.targetDomain && t(form.formState.errors.targetDomain.message!)}</FormMessage>
                      </FormItem>
                    )} />
                  </div>

                  {/* Relay + Public Path */}
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="relayPath" render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-xs font-medium">{t("deploy.relayPath")}</FormLabel>
                        <FormControl><Input className="h-9 text-sm font-mono" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="publicPath" render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-xs font-medium">{t("deploy.publicPath")}</FormLabel>
                        <FormControl><Input className="h-9 text-sm font-mono" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* Fastly custom domain */}
                  {platform === "fastly" && (
                    <FormField control={form.control} name="customDomain" render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-xs font-medium">Custom Domain (optional)</FormLabel>
                        <div className="flex items-center gap-0">
                          <FormControl>
                            <Input className="h-9 text-sm font-mono rounded-e-none border-e-0" placeholder="my-relay" {...field} value={field.value ?? ""} />
                          </FormControl>
                          <span className="h-9 flex items-center px-2.5 text-xs text-muted-foreground bg-muted border rounded-e-md">.edgecompute.app</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Leave empty for a random domain</p>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}

                  {/* Railway-specific settings */}
                  {platform === "railway" && (
                    <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Railway Settings
                      </p>

                      {/* Region */}
                      <FormField control={form.control} name="region" render={({ field }) => (
                        <FormItem className="space-y-1.5">
                          <FormLabel className="text-xs font-medium">{t("deploy.railwayRegion")}</FormLabel>
                          <Select value={field.value ?? "europe-west4-drams3a"} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue>
                                  {(() => {
                                    const r = RAILWAY_REGIONS.find((x) => x.value === field.value);
                                    return r ? `${r.flag}  ${r.label}` : field.value;
                                  })()}
                                </SelectValue>
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {RAILWAY_REGIONS.map((r) => (
                                <SelectItem key={r.value} value={r.value} className="text-sm">
                                  <span className="mr-2">{r.flag}</span>{r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />

                      {/* Target Port */}
                      <FormField control={form.control} name="targetPort" render={({ field }) => (
                        <FormItem className="space-y-1.5">
                          <FormLabel className="text-xs font-medium">{t("deploy.targetPort")}</FormLabel>
                          <FormControl>
                            <Input className="h-9 text-sm font-mono" type="number" min={1} max={65535} placeholder="443"
                              {...field} value={field.value ?? 443}
                              onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : 443)} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      {/* Advanced */}
                      <div className="rounded-lg border border-dashed bg-background">
                        <button type="button" onClick={() => setShowAdvanced((v) => !v)}
                          className="flex w-full items-center justify-between px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          <span className="flex items-center gap-2">
                            <Zap className="h-3.5 w-3.5" />
                            {t("deploy.advancedSettings")}
                          </span>
                          {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                        {showAdvanced && (
                          <div className="px-3 pb-3 pt-1 space-y-3 border-t border-dashed">
                            <div className="grid grid-cols-2 gap-3">
                              <FormField control={form.control} name="maxInflight" render={({ field }) => (
                                <FormItem className="space-y-1.5">
                                  <FormLabel className="text-xs font-medium">Max Inflight</FormLabel>
                                  <FormControl>
                                    <Input className="h-9 text-sm font-mono" type="number" min={1} placeholder="512"
                                      {...field} value={field.value ?? 512}
                                      onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : 512)} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )} />
                              <FormField control={form.control} name="upstreamTimeoutMs" render={({ field }) => (
                                <FormItem className="space-y-1.5">
                                  <FormLabel className="text-xs font-medium">{t("deploy.upstreamTimeoutMs")}</FormLabel>
                                  <FormControl>
                                    <Input className="h-9 text-sm font-mono" type="number" min={0} placeholder="0"
                                      {...field} value={field.value ?? 0}
                                      onChange={(e) => field.onChange(e.target.value !== "" ? Number(e.target.value) : 0)} />
                                  </FormControl>
                                  <p className="text-[10px] text-muted-foreground">{t("deploy.upstreamTimeoutHint")}</p>
                                  <FormMessage />
                                </FormItem>
                              )} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Azure-specific settings */}
                  {platform === "azure" && (
                    <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Azure Settings
                      </p>

                      {/* Region */}
                      <FormField control={form.control} name="location" render={({ field }) => (
                        <FormItem className="space-y-1.5">
                          <FormLabel className="text-xs font-medium">{t("deploy.region")}</FormLabel>
                          <Select value={field.value ?? "westeurope"} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue>
                                  {(() => {
                                    const r = AZURE_REGIONS.find((x) => x.value === field.value);
                                    return r ? `${r.flag}  ${r.label}` : field.value;
                                  })()}
                                </SelectValue>
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {AZURE_REGIONS.map((r) => (
                                <SelectItem key={r.value} value={r.value} className="text-sm">
                                  <span className="mr-2">{r.flag}</span>{r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />

                      {/* Profile */}
                      <div className="space-y-2">
                        <p className="text-xs font-medium">{t("deploy.profile")}</p>
                        <div className="grid grid-cols-4 gap-2">
                          {AZURE_PROFILES.map((p) => {
                            const selected = form.watch("sku") === p.sku;
                            return (
                              <button key={p.id} type="button"
                                onClick={() => { form.setValue("sku", p.sku); form.setValue("maxInflight", p.maxInflight); }}
                                className={cn(
                                  "relative rounded-lg border-2 px-2 py-2.5 text-center transition-all flex flex-col items-center gap-0.5",
                                  selected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 bg-background",
                                )}>
                                {p.recommended && (
                                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-primary px-1.5 text-[8px] font-bold text-primary-foreground leading-4">
                                    ⭐
                                  </span>
                                )}
                                <span className={cn("text-xs font-semibold", selected && "text-primary")}>{p.label}</span>
                                <span className="text-[9px] font-mono text-muted-foreground">{p.sku}</span>
                                <span className="text-[9px] text-muted-foreground">{p.desc}</span>
                                <span className="text-[8px] text-muted-foreground/60 mt-0.5">{p.note}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Resource Group + Port */}
                      <div className="grid grid-cols-2 gap-3">
                        <FormField control={form.control} name="resourceGroup" render={({ field }) => (
                          <FormItem className="space-y-1.5">
                            <FormLabel className="text-xs font-medium">{t("deploy.resourceGroup")}</FormLabel>
                            <FormControl><Input className="h-9 text-sm" placeholder="my-rg" {...field} /></FormControl>
                            <FormMessage className="text-[10px]">{form.formState.errors.resourceGroup && t(form.formState.errors.resourceGroup.message!)}</FormMessage>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="targetPort" render={({ field }) => (
                          <FormItem className="space-y-1.5">
                            <FormLabel className="text-xs font-medium">{t("deploy.targetPort")}</FormLabel>
                            <FormControl>
                              <Input className="h-9 text-sm" type="number" min={1} max={65535} placeholder="443"
                                {...field} value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      {/* Advanced */}
                      <div className="rounded-lg border border-dashed bg-background">
                        <button type="button" onClick={() => setShowAdvanced((v) => !v)}
                          className="flex w-full items-center justify-between px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          <span className="flex items-center gap-2">
                            <Zap className="h-3.5 w-3.5" />
                            {t("deploy.advancedSettings")}
                          </span>
                          {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                        {showAdvanced && (
                          <div className="px-3 pb-3 pt-1 space-y-3 border-t border-dashed">
                            <div className="grid grid-cols-2 gap-3">
                              <FormField control={form.control} name="maxUpBps" render={({ field }) => (
                                <FormItem className="space-y-1.5">
                                  <FormLabel className="text-xs font-medium">{t("deploy.maxUpBps")}</FormLabel>
                                  <FormControl>
                                    <Input className="h-9 text-sm font-mono" type="number" min={0} placeholder="0"
                                      {...field} value={field.value ?? 0}
                                      onChange={(e) => field.onChange(e.target.value !== "" ? Number(e.target.value) : 0)} />
                                  </FormControl>
                                  <p className="text-[10px] text-muted-foreground">{t("deploy.bpsHint")}</p>
                                  <FormMessage />
                                </FormItem>
                              )} />
                              <FormField control={form.control} name="maxDownBps" render={({ field }) => (
                                <FormItem className="space-y-1.5">
                                  <FormLabel className="text-xs font-medium">{t("deploy.maxDownBps")}</FormLabel>
                                  <FormControl>
                                    <Input className="h-9 text-sm font-mono" type="number" min={0} placeholder="0"
                                      {...field} value={field.value ?? 0}
                                      onChange={(e) => field.onChange(e.target.value !== "" ? Number(e.target.value) : 0)} />
                                  </FormControl>
                                  <p className="text-[10px] text-muted-foreground">{t("deploy.bpsHint")}</p>
                                  <FormMessage />
                                </FormItem>
                              )} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Form>
            )}

            {/* ── Step 3: Confirm ── */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-xl border overflow-hidden">
                  <div className="px-4 py-2.5 bg-muted/40 border-b">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Summary</p>
                  </div>
                  <div className="px-4 py-1">
                    <SummaryRow label={t("deploy.choosePlatform")} value={<span className="capitalize">{platform}</span>} />
                    <SummaryRow label={t("deploy.projectName")} value={form.getValues("projectName")} mono />
                    <SummaryRow label={t("deploy.targetDomain")} value={form.getValues("targetDomain")} mono />
                    <SummaryRow label={t("deploy.relayPath")} value={form.getValues("relayPath")} mono />
                    <SummaryRow label={t("deploy.publicPath")} value={form.getValues("publicPath")} mono />
                    {platform === "railway" && (() => {
                      const reg = RAILWAY_REGIONS.find((r) => r.value === form.getValues("region"));
                      const timeout = form.getValues("upstreamTimeoutMs") ?? 0;
                      const inflight = form.getValues("maxInflight") ?? 512;
                      return (
                        <>
                          <SummaryRow label={t("deploy.railwayRegion")} value={reg ? `${reg.flag} ${reg.label}` : (form.getValues("region") || "—")} />
                          <SummaryRow label="Max Inflight" value={String(inflight)} mono />
                          <SummaryRow label={t("deploy.upstreamTimeoutMs")} value={timeout === 0 ? "∞" : `${timeout}ms`} mono />
                        </>
                      );
                    })()}
                    {platform === "azure" && (() => {
                      const loc     = form.getValues("location") ?? "westeurope";
                      const region  = AZURE_REGIONS.find((r) => r.value === loc);
                      const profile = AZURE_PROFILES.find((p) => p.sku === form.getValues("sku"));
                      const upBps   = form.getValues("maxUpBps") ?? 0;
                      const downBps = form.getValues("maxDownBps") ?? 0;
                      return (
                        <>
                          <SummaryRow label={t("deploy.region")} value={region ? `${region.flag} ${region.label}` : loc} />
                          <SummaryRow label={t("deploy.profile")} value={profile ? `${profile.label} · ${profile.sku} · ${profile.desc}` : form.getValues("sku")} />
                          <SummaryRow label={t("deploy.resourceGroup")} value={form.getValues("resourceGroup") || "—"} mono />
                          <SummaryRow label={t("deploy.targetPort")} value={String(form.getValues("targetPort") ?? 443)} mono />
                          {(upBps > 0 || downBps > 0) && (
                            <SummaryRow label="Bandwidth" value={`↑${upBps || "∞"} / ↓${downBps || "∞"} BPS`} mono />
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t shrink-0 flex justify-between items-center bg-background">
            {step === 1 && (
              <>
                <Button variant="outline" size="sm" onClick={closeWizard}>{t("common.cancel")}</Button>
                <Button size="sm" onClick={goToStep2} disabled={!platform}>
                  {t("deploy.next")} <ArrowNext className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              </>
            )}
            {step === 2 && (
              <>
                <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                  <ArrowPrev className="h-3.5 w-3.5 mr-1.5" /> {t("deploy.back")}
                </Button>
                <Button size="sm" onClick={goToStep3}>
                  {t("deploy.next")} <ArrowNext className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              </>
            )}
            {step === 3 && (
              <>
                <Button variant="outline" size="sm" onClick={() => setStep(2)}>
                  <ArrowPrev className="h-3.5 w-3.5 mr-1.5" /> {t("deploy.back")}
                </Button>
                <Button size="sm" onClick={handleDeploy} disabled={deploying} className="min-w-[100px]">
                  {deploying
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> {t("deploy.deploying")}</>
                    : <><Rocket className="h-3.5 w-3.5 mr-1.5" /> {t("deploy.deploy")}</>}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Deployments List ────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-[68px] rounded-xl" />)}
        </div>
      ) : deploys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Rocket className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">{t("deploy.noDeployments")}</p>
            <p className="text-xs text-muted-foreground mt-1">Click &quot;New Deploy&quot; to get started</p>
            <Button size="sm" className="mt-4" onClick={openWizard}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> {t("deploy.newDeploy")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y">
            {deploys.map((d) => {
              const displayUrl = d.deploy_url
                ? d.deploy_url.replace(/^https?:\/\//, "")
                : null;
              return (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">

                {/* Platform icon */}
                <div className="shrink-0 flex flex-col items-center gap-1 w-10">
                  <div className="h-7 w-7 flex items-center justify-center">
                    <PlatformIcon id={d.platform} className="h-5 w-5" />
                  </div>
                  <Badge variant={STATUS_VARIANT[d.status] || "secondary"} className="h-3.5 text-[9px] px-1 leading-none">
                    {d.status}
                  </Badge>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  {/* URL as main identifier */}
                  {displayUrl ? (
                    <a href={d.deploy_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 group mb-0.5">
                      <span className="font-mono font-medium text-[12px] text-foreground group-hover:text-primary truncate transition-colors">
                        {displayUrl}
                      </span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                    </a>
                  ) : (
                    <span className="font-medium text-sm truncate block mb-0.5">{d.project_name}</span>
                  )}
                  {/* Subtitle: project name → target domain */}
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="truncate max-w-[90px]">{d.project_name}</span>
                    <span>→</span>
                    <span className="font-mono truncate max-w-[100px]">{d.target_domain}</span>
                  </div>
                </div>

                {/* Date */}
                <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:block tabular-nums">
                  {new Date(d.created_at).toLocaleDateString()}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8"
                        onClick={() => handleHealth(d.id)} disabled={actionLoading === d.id}>
                        {actionLoading === d.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Heart className="h-3.5 w-3.5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Health Check</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8"
                        onClick={() => handleRedeploy(d.id)} disabled={actionLoading === d.id}>
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("deploy.redeploy")}</TooltipContent>
                  </Tooltip>

                  <AlertDialog>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            disabled={actionLoading === d.id}>
                            <Trash2 className="h-3.5 w-3.5" />
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
                        <AlertDialogAction
                          onClick={() => handleDelete(d.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          {t("common.delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import api from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { tokenSchema, type TokenValues } from "@/lib/validations";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, TestTube, CheckCircle, XCircle, Loader2, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

interface Token {
  id: number;
  platform: string;
  label: string;
  is_active: number;
  maskedData: Record<string, string>;
  created_at: string;
}

const platformFields: Record<string, { labelKey: string; key: string; type?: string }[]> = {
  vercel: [{ labelKey: "tokens.apiToken", key: "token" }],
  netlify: [{ labelKey: "tokens.personalAccessToken", key: "token" }],
  azure: [
    { labelKey: "APP_ID", key: "appId" },
    { labelKey: "PASSWORD", key: "password", type: "password" },
    { labelKey: "TENANT_ID", key: "tenantId" },
    { labelKey: "SUBSCRIPTION_ID", key: "subscriptionId" },
  ],
  railway: [
    { labelKey: "Account Token", key: "apiToken", type: "password" },
  ],
  fastly: [
    { labelKey: "API Token", key: "apiToken", type: "password" },
  ],
};

const PLATFORM_META: Record<string, {
  gradient: string;
  glow: string;
  badge: string;
  icon: React.ReactNode;
}> = {
  vercel: {
    gradient: "from-neutral-900 via-neutral-800 to-neutral-700 dark:from-white/10 dark:via-white/5 dark:to-transparent",
    glow: "shadow-[0_0_32px_0px_rgba(0,0,0,0.25)]",
    badge: "bg-black text-white dark:bg-white dark:text-black",
    icon: <img src="https://cdn.simpleicons.org/vercel/ffffff" alt="vercel" className="h-6 w-6" />,
  },
  netlify: {
    gradient: "from-teal-600 via-teal-500 to-emerald-500",
    glow: "shadow-[0_0_32px_0px_rgba(20,184,166,0.3)]",
    badge: "bg-teal-500 text-white",
    icon: <img src="https://cdn.simpleicons.org/netlify/ffffff" alt="netlify" className="h-6 w-6" />,
  },
  azure: {
    gradient: "from-blue-700 via-blue-600 to-sky-500",
    glow: "shadow-[0_0_32px_0px_rgba(59,130,246,0.3)]",
    badge: "bg-blue-600 text-white",
    icon: <img src={`data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path fill="#fff" d="M33.34 6.54h26.04L33.78 89.39a4.1 4.1 0 01-3.89 2.85H8.14a4.1 4.1 0 01-3.87-5.46L27.45 9.39a4.1 4.1 0 013.89-2.85zm29.4 53.72H29.88a1.89 1.89 0 00-1.29 3.27l26.52 24.76a4.13 4.13 0 002.82 1.1h23.37z"/></svg>')}`} alt="azure" className="h-6 w-6" />,
  },
  railway: {
    gradient: "from-violet-700 via-violet-600 to-purple-500",
    glow: "shadow-[0_0_32px_0px_rgba(124,58,237,0.35)]",
    badge: "bg-violet-600 text-white",
    icon: <img src="https://cdn.simpleicons.org/railway/ffffff" alt="railway" className="h-6 w-6" />,
  },
  fastly: {
    gradient: "from-red-700 via-red-600 to-rose-500",
    glow: "shadow-[0_0_32px_0px_rgba(220,38,38,0.35)]",
    badge: "bg-red-600 text-white",
    icon: <img src="https://cdn.simpleicons.org/fastly/ffffff" alt="fastly" className="h-6 w-6" />,
  },
};

const fallbackMeta = {
  gradient: "from-muted to-muted/50",
  glow: "",
  badge: "bg-muted text-foreground",
  icon: <KeyRound className="h-6 w-6" />,
};

export default function TokensPage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<Record<number, { valid: boolean; detail: string }>>({});
  const { t } = useI18n();

  const form = useForm<TokenValues>({
    resolver: zodResolver(tokenSchema),
    defaultValues: { platform: "vercel", label: "", fields: {} },
  });

  const currentPlatform = form.watch("platform");

  const loadTokens = () => {
    setLoading(true);
    api.get("/tokens").then((r) => setTokens(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { loadTokens(); }, []);

  const onSubmit = async (values: TokenValues) => {
    try {
      await api.post("/tokens", { platform: values.platform, label: values.label, tokenData: values.fields });
      toast.success(t("tokens.addedSuccess"));
      setDialogOpen(false);
      form.reset();
      loadTokens();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to add token");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/tokens/${id}`);
      toast.success(t("tokens.deletedSuccess"));
      loadTokens();
    } catch {
      toast.error("Failed to delete token");
    }
  };

  const handleTest = async (id: number) => {
    setTesting(id);
    try {
      const { data } = await api.post(`/tokens/${id}/test`);
      setTestResult((prev) => ({ ...prev, [id]: data }));
      if (data.valid) toast.success(t("tokens.testSuccess"));
      else toast.error(t("tokens.testFailed"));
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("tokens.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tokens.length > 0
              ? `${tokens.length} token${tokens.length !== 1 ? "s" : ""} saved`
              : "No tokens yet"}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          {t("tokens.addToken")}
        </Button>
      </div>

      {/* Add Token Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) form.reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tokens.addNew")}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="platform"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("tokens.platform")}</FormLabel>
                      <Select value={field.value} onValueChange={(v) => { field.onChange(v); form.setValue("fields", {}); }}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="vercel">Vercel</SelectItem>
                          <SelectItem value="netlify">Netlify</SelectItem>
                          <SelectItem value="azure">Azure</SelectItem>
                          <SelectItem value="railway">Railway</SelectItem>
                          <SelectItem value="fastly">Fastly</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("tokens.label")}</FormLabel>
                      <FormControl>
                        <Input placeholder="My Token" {...field} />
                      </FormControl>
                      <FormMessage>{form.formState.errors.label && t(form.formState.errors.label.message!)}</FormMessage>
                    </FormItem>
                  )}
                />
              </div>
              {platformFields[currentPlatform].map((f) => (
                <FormField
                  key={f.key}
                  control={form.control}
                  name={`fields.${f.key}`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{f.labelKey.startsWith("tokens.") ? t(f.labelKey) : f.labelKey}</FormLabel>
                      <FormControl>
                        <Input type={f.type || "text"} {...field} value={typeof field.value === "string" ? field.value : ""} />
                      </FormControl>
                      <FormMessage>{form.formState.errors.fields?.[f.key] && t(form.formState.errors.fields[f.key]!.message!)}</FormMessage>
                    </FormItem>
                  )}
                />
              ))}
              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={form.formState.isSubmitting} className="gap-2 flex-1">
                  {form.formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {form.formState.isSubmitting ? t("tokens.saving") : t("tokens.save")}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); form.reset(); }}>
                  {t("tokens.cancel")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Token grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="h-24 bg-muted animate-pulse" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : tokens.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border flex flex-col items-center justify-center py-20 text-center gap-3">
          <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
            <KeyRound className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <div>
            <p className="text-sm font-medium">{t("tokens.noTokens")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Add a platform token to start deploying</p>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-2 mt-1">
            <Plus className="h-3.5 w-3.5" /> {t("tokens.addToken")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tokens.map((tk) => {
            const meta = PLATFORM_META[tk.platform] ?? fallbackMeta;
            const result = testResult[tk.id];
            return (
              <div
                key={tk.id}
                className={cn(
                  "rounded-2xl border border-border bg-card overflow-hidden flex flex-col transition-shadow duration-300",
                  meta.glow,
                )}
              >
                {/* Gradient banner */}
                <div className={cn("bg-gradient-to-br px-4 pt-4 pb-5", meta.gradient)}>
                  <div className="flex items-start justify-between">
                    <div className={cn("p-2 rounded-xl bg-white/10 backdrop-blur-sm text-white")}>
                      {meta.icon}
                    </div>
                    {result && (
                      <div className={cn(
                        "flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full",
                        result.valid
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-red-500/20 text-red-300 border border-red-500/30",
                      )}>
                        {result.valid
                          ? <><CheckCircle className="h-3 w-3" /> Valid</>
                          : <><XCircle className="h-3 w-3" /> Invalid</>}
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <p className="text-white font-bold text-base leading-tight">{tk.label}</p>
                    <p className="text-white/50 text-xs capitalize mt-0.5">{tk.platform}</p>
                  </div>
                </div>

                {/* Fields */}
                <div className="px-4 py-3 flex-1 space-y-1.5">
                  {Object.entries(tk.maskedData).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground font-medium shrink-0">{k}</span>
                      <span className="text-xs font-mono text-foreground/60 truncate">{v}</span>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="px-4 py-3 border-t border-border grid grid-cols-2 gap-2">
                  <Button
                    variant="outline" size="sm" className="gap-1.5 text-xs"
                    onClick={() => handleTest(tk.id)}
                    disabled={testing === tk.id}
                  >
                    {testing === tk.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <TestTube className="h-3.5 w-3.5" />}
                    {t("tokens.test")}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline" size="sm"
                        className="gap-1.5 text-xs text-destructive hover:text-destructive border-destructive/20 hover:border-destructive/50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("tokens.delete")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("tokens.deleteTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("tokens.deleteDescription")}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(tk.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
      )}
    </div>
  );
}

"use client";

import { useI18n } from "@/lib/i18n";
import { Shield, Zap, Users, Globe, Server, BarChart2, ExternalLink, Send, Code2 } from "lucide-react";

const FEATURES = [
  {
    icon: Users,
    color: "#6366f1",
    bg: "from-indigo-500/20 to-indigo-500/5",
    border: "border-indigo-500/20",
    titleFa: "مدیریت کلاینت",
    titleEn: "Client Management",
    descFa: "افزودن، ویرایش و حذف کاربران با UUID اختصاصی، محدودیت ترافیک، تاریخ انقضا و حداکثر IP همزمان",
    descEn: "Add, edit, and delete users with unique UUIDs, traffic limits, expiry dates, and max concurrent IPs",
  },
  {
    icon: BarChart2,
    color: "#10b981",
    bg: "from-emerald-500/20 to-emerald-500/5",
    border: "border-emerald-500/20",
    titleFa: "ترافیک Real-time",
    titleEn: "Real-time Traffic",
    descFa: "رصد لحظه‌ای مصرف ترافیک هر کاربر از Xray Stats API با نمودار تاریخچه ۷ و ۳۰ روزه",
    descEn: "Live per-user traffic monitoring via Xray Stats API with 7/30-day history charts",
  },
  {
    icon: Server,
    color: "#f59e0b",
    bg: "from-amber-500/20 to-amber-500/5",
    border: "border-amber-500/20",
    titleFa: "مدیریت اینباند",
    titleEn: "Inbound Management",
    descFa: "پشتیبانی از VLESS، VMess، Trojan، Shadowsocks با TLS، Reality و xhttp",
    descEn: "VLESS, VMess, Trojan, Shadowsocks with TLS, Reality, and xhttp transport",
  },
  {
    icon: Globe,
    color: "#3b82f6",
    bg: "from-blue-500/20 to-blue-500/5",
    border: "border-blue-500/20",
    titleFa: "دیپلوی چندپلتفرمه",
    titleEn: "Multi-platform Deploy",
    descFa: "استقرار relay روی Railway و Fastly با یک کلیک و پیشرفت step-by-step",
    descEn: "One-click relay deployment to Railway and Fastly with live step-by-step progress",
  },
  {
    icon: Shield,
    color: "#8b5cf6",
    bg: "from-violet-500/20 to-violet-500/5",
    border: "border-violet-500/20",
    titleFa: "SSL خودکار",
    titleEn: "Auto SSL",
    descFa: "شناسایی خودکار مسیر گواهی‌های acme.sh و Let's Encrypt و پرکردن فرم بدون دخالت دستی",
    descEn: "Automatic detection of acme.sh and Let's Encrypt certificate paths, auto-filling forms",
  },
  {
    icon: Zap,
    color: "#ef4444",
    bg: "from-red-500/20 to-red-500/5",
    border: "border-red-500/20",
    titleFa: "لینک کانفیگ",
    titleEn: "Config Links",
    descFa: "تولید لینک vless:// اختصاصی برای هر کلاینت و هر دیپلوی با یک کلیک",
    descEn: "Generate a dedicated vless:// link per client per deployment with a single click",
  },
];

const STACK = [
  { label: "Backend",  value: "Node.js · TypeScript · Express · SQLite", color: "#10b981" },
  { label: "Frontend", value: "Next.js · Tailwind CSS · shadcn/ui",       color: "#3b82f6" },
  { label: "Xray",     value: "Xray-core (XTLS) · Stats API · xhttp",     color: "#f59e0b" },
  { label: "Process",  value: "PM2 · systemd · nginx",                     color: "#8b5cf6" },
];

export default function AboutPage() {
  const { locale } = useI18n();
  const fa = locale === "fa";

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border bg-card px-8 py-10 text-center space-y-4">
        {/* background glow */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-72 w-72 rounded-full bg-primary/5 blur-3xl" />
        </div>

        <div className="relative flex justify-center">
          <div className="h-16 w-16 rounded-2xl bg-foreground flex items-center justify-center shadow-xl ring-4 ring-foreground/10">
            <Zap className="h-8 w-8 text-background" />
          </div>
        </div>

        <div className="relative">
          <h1 className="text-3xl font-bold tracking-tight">
            {fa ? "پنل XHTTP" : "XHTTP Panel"}
          </h1>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            {fa ? "نسخه ۱.۰ — متن‌باز · GPL-3.0" : "Version 1.0 — Open source · GPL-3.0"}
          </p>
        </div>

        <p className="relative text-sm leading-relaxed text-muted-foreground max-w-xl mx-auto">
          {fa
            ? "پنل XHTTP یک رابط مدیریتی حرفه‌ای برای Xray-core است که به شما امکان می‌دهد اینباندها و کاربران را مدیریت کنید، ترافیک را به‌صورت لحظه‌ای رصد کنید و سرویس relay خود را روی پلتفرم‌های ابری مختلف مستقر کنید."
            : "XHTTP Panel is a professional management interface for Xray-core that lets you manage inbounds and users, monitor traffic in real time, and deploy your relay service to multiple cloud platforms."}
        </p>

        <div className="relative flex flex-wrap justify-center gap-2 pt-1">
          {["GPL-3.0", "Xray-core", "TypeScript", "Next.js", "SQLite"].map((tag) => (
            <span key={tag} className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground px-1">
          {fa ? "قابلیت‌ها" : "Features"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, color, bg, border, titleFa, titleEn, descFa, descEn }) => (
            <div
              key={titleEn}
              className={`relative overflow-hidden rounded-xl border ${border} bg-gradient-to-br ${bg} p-4 flex gap-3`}
            >
              <div
                className="mt-0.5 shrink-0 h-9 w-9 rounded-xl flex items-center justify-center"
                style={{ background: `${color}20` }}
              >
                <Icon className="h-4 w-4" style={{ color }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color }}>{fa ? titleFa : titleEn}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{fa ? descFa : descEn}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tech Stack ────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground px-1">
          {fa ? "تکنولوژی‌ها" : "Tech Stack"}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {STACK.map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
              <div className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
                <p className="text-xs font-mono truncate">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Avacocloud channel ────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/10 to-blue-600/5 px-6 py-7 space-y-4">
        <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-sky-400/10 blur-2xl" />

        <div className="flex items-center gap-3">
          <div
            className="h-11 w-11 rounded-xl flex items-center justify-center shadow-md"
            style={{ background: "linear-gradient(135deg,#2ca5e0 0%,#1a7ab8 100%)" }}
          >
            <Send className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold">{fa ? "کانال آواکو" : "Avacocloud Channel"}</p>
            <p className="text-xs text-muted-foreground">@avacocloud</p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground relative">
          {fa
            ? "برای دریافت آخرین آپدیت‌های پنل، آموزش‌های ویدیویی، ترفندهای Xray و پشتیبانی فنی، کانال تلگرام آواکو را دنبال کنید. تمام نسخه‌های جدید و تغییرات مهم ابتدا در این کانال اعلام می‌شوند."
            : "Follow the Avacocloud Telegram channel for the latest panel updates, video tutorials, Xray tips, and technical support. All new releases are announced there first."}
        </p>

        <a
          href="https://t.me/avacocloud"
          target="_blank"
          rel="noopener noreferrer"
          className="relative inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 shadow-md"
          style={{ background: "linear-gradient(135deg,#2ca5e0 0%,#1a7ab8 100%)" }}
        >
          <Send className="h-4 w-4" />
          {fa ? "عضویت در کانال آواکو" : "Join Avacocloud Channel"}
          <ExternalLink className="h-3.5 w-3.5 opacity-70" />
        </a>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
        <Code2 className="h-3.5 w-3.5" />
        <span>{fa ? "ساخته‌شده با ❤️ توسط تیم آواکو" : "Built with ❤️ by the Avacocloud team"}</span>
      </div>

    </div>
  );
}

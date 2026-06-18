"use client";

import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Cpu, MemoryStick, Wifi, HardDrive, ArrowDown, ArrowUp, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Stats {
  cpu: number;
  memUsed: number;
  memTotal: number;
  memPct: number;
  netRxBps: number;
  netTxBps: number;
  diskUsed: number;
  diskTotal: number;
  diskPct: number;
  uptime: number;
}

const MAX_POINTS = 60;

function fmtBytes(b: number): string {
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + " GB";
  if (b >= 1048576)    return (b / 1048576).toFixed(0) + " MB";
  if (b >= 1024)       return (b / 1024).toFixed(0) + " KB";
  return b + " B";
}

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// SVG sparkline from array of 0-100 values
function Sparkline({ data, color, className }: { data: number[]; color: string; className?: string }) {
  if (data.length < 2) return <div className={cn("h-12", className)} />;
  const w = 300, h = 48;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * h * 0.9 - h * 0.05;
    return `${x},${y}`;
  });
  const d = `M${pts.join("L")}`;
  const fill = `M0,${h} L${pts.join("L")} L${w},${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("w-full", className)}>
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#grad-${color})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

function barColor(pct: number, warn = 70, crit = 85): string {
  if (pct >= crit) return "#ef4444";
  if (pct >= warn) return "#f97316";
  return "#3b82f6";
}

interface ResourceCardProps {
  icon: React.ReactNode;
  title: string;
  value: string;
  sub?: string;
  pct?: number;
  history?: number[];
  sparkColor?: string;
  accent: string;
  extra?: React.ReactNode;
}

function ResourceCard({ icon, title, value, sub, pct, history, sparkColor = "#3b82f6", accent, extra }: ResourceCardProps) {
  return (
    <div className={cn("rounded-2xl border bg-card overflow-hidden flex flex-col", `border-[${accent}]/10`)}>
      <div className="px-4 pt-4 pb-2 space-y-3 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg" style={{ background: `${accent}15` }}>
              <div style={{ color: accent }}>{icon}</div>
            </div>
            <span className="text-xs font-medium text-muted-foreground">{title}</span>
          </div>
          {pct !== undefined && (
            <span className="text-xs font-mono font-bold" style={{ color: barColor(pct) }}>{pct}%</span>
          )}
        </div>

        <div>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>

        {pct !== undefined && <StatBar pct={pct} color={barColor(pct)} />}
        {extra}
      </div>
      {history && history.length > 1 && (
        <div className="h-12 mt-1">
          <Sparkline data={history} color={sparkColor} className="h-12" />
        </div>
      )}
    </div>
  );
}

export default function ResourcesPage() {
  const { t } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const cpuHist    = useRef<number[]>([]);
  const memHist    = useRef<number[]>([]);
  const rxHist     = useRef<number[]>([]);
  const txHist     = useRef<number[]>([]);
  const [, forceRender] = useState(0);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      try {
        const { data } = await api.get<Stats>("/settings/system-stats");
        setStats(data);
        const push = (arr: React.MutableRefObject<number[]>, v: number) => {
          arr.current.push(v);
          if (arr.current.length > MAX_POINTS) arr.current.shift();
        };
        push(cpuHist, data.cpu);
        push(memHist, data.memPct);
        // normalize network to KB/s for chart scale
        push(rxHist, data.netRxBps / 1024);
        push(txHist, data.netTxBps / 1024);
        forceRender((n) => n + 1);
      } catch {}
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const maxRx = Math.max(...rxHist.current, 1);
  const maxTx = Math.max(...txHist.current, 1);
  // Normalize rx/tx to 0-100 for sparkline
  const rxPct = rxHist.current.map((v) => (v / maxRx) * 100);
  void maxTx; // used for scale reference only

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("resources.title")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("resources.liveUpdate")}</p>
        </div>
        {stats && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {t("resources.uptime")}: <span className="font-mono font-medium text-foreground">{fmtUptime(stats.uptime)}</span>
          </div>
        )}
      </div>

      {!stats ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl border bg-card h-36 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* CPU */}
          <ResourceCard
            icon={<Cpu className="h-4 w-4" />}
            title={t("resources.cpu")}
            value={`${stats.cpu}%`}
            sub={`${cpuHist.current.length} samples`}
            pct={stats.cpu}
            history={cpuHist.current}
            sparkColor="#8b5cf6"
            accent="#8b5cf6"
          />

          {/* RAM */}
          <ResourceCard
            icon={<MemoryStick className="h-4 w-4" />}
            title={t("resources.memory")}
            value={fmtBytes(stats.memUsed)}
            sub={`${t("resources.total")}: ${fmtBytes(stats.memTotal)}`}
            pct={stats.memPct}
            history={memHist.current}
            sparkColor="#3b82f6"
            accent="#3b82f6"
          />

          {/* Network */}
          <ResourceCard
            icon={<Wifi className="h-4 w-4" />}
            title={t("resources.network")}
            value={fmtBytes(stats.netRxBps) + "/s"}
            sub={`↑ ${fmtBytes(stats.netTxBps)}/s`}
            sparkColor="#10b981"
            accent="#10b981"
            history={rxPct}
            extra={
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="rounded-lg bg-muted/50 px-2.5 py-1.5">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                    <ArrowDown className="h-3 w-3 text-emerald-500" /> {t("resources.download")}
                  </div>
                  <p className="text-xs font-mono font-semibold">{fmtBytes(stats.netRxBps)}/s</p>
                </div>
                <div className="rounded-lg bg-muted/50 px-2.5 py-1.5">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                    <ArrowUp className="h-3 w-3 text-blue-500" /> {t("resources.upload")}
                  </div>
                  <p className="text-xs font-mono font-semibold">{fmtBytes(stats.netTxBps)}/s</p>
                </div>
              </div>
            }
          />

          {/* Disk */}
          <ResourceCard
            icon={<HardDrive className="h-4 w-4" />}
            title={t("resources.disk")}
            value={fmtBytes(stats.diskUsed)}
            sub={`${t("resources.free")}: ${fmtBytes(stats.diskTotal - stats.diskUsed)} / ${fmtBytes(stats.diskTotal)}`}
            pct={stats.diskPct}
            accent="#f59e0b"
            sparkColor="#f59e0b"
          />
        </div>
      )}
    </div>
  );
}

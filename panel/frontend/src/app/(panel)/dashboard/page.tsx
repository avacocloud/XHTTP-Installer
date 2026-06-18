"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Rocket, CheckCircle, AlertTriangle } from "lucide-react";

interface Stats {
  totalDeployments: number;
  activeDeployments: number;
  failedHealthChecks: number;
}

interface Deploy {
  id: number;
  platform: string;
  project_name: string;
  deploy_url: string;
  status: string;
  created_at: string;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive"> = {
  active: "default",
  deploying: "secondary",
  failed: "destructive",
  pending: "secondary",
  stopped: "destructive",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [deploys, setDeploys] = useState<Deploy[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    Promise.all([
      api.get("/dashboard/stats"),
      api.get("/dashboard/recent-deploys"),
    ]).then(([s, d]) => {
      setStats(s.data);
      setDeploys(d.data);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t("dashboard.title")}</h1>

      <div className="grid gap-3 md:grid-cols-3">
        {loading ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">{t("dashboard.totalDeployments")}</CardTitle>
                <Tooltip>
                  <TooltipTrigger>
                    <Rocket className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>{t("dashboard.totalDeployments")}</TooltipContent>
                </Tooltip>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalDeployments ?? 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">{t("dashboard.active")}</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.activeDeployments ?? 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">{t("dashboard.failedHealthChecks")}</CardTitle>
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.failedHealthChecks ?? 0}</div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.recentDeployments")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : deploys.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t("dashboard.noDeployments")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dashboard.platform")}</TableHead>
                  <TableHead>{t("dashboard.project")}</TableHead>
                  <TableHead>{t("dashboard.url")}</TableHead>
                  <TableHead>{t("dashboard.status")}</TableHead>
                  <TableHead>{t("dashboard.created")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deploys.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="capitalize text-xs">{d.platform}</TableCell>
                    <TableCell className="text-xs font-medium">{d.project_name}</TableCell>
                    <TableCell className="text-xs">
                      {d.deploy_url ? (
                        <a href={d.deploy_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {d.deploy_url.replace("https://", "").slice(0, 30)}
                        </a>
                      ) : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[d.status] || "secondary"} className="h-5 text-[10px]">{d.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(d.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

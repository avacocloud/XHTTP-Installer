"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Key, Rocket, Settings, FileCode, LogOut, Zap, Wrench, Activity, Network, Users, Info } from "lucide-react";
import { useAuth } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const navItems = [
  { href: "/dashboard", labelKey: "sidebar.dashboard", icon: LayoutDashboard },
  { href: "/setup", labelKey: "sidebar.setup", icon: Wrench },
  { href: "/tokens", labelKey: "sidebar.tokens", icon: Key },
  { href: "/clients", labelKey: "sidebar.clients", icon: Users },
  { href: "/inbounds", labelKey: "sidebar.inbounds", icon: Network },
  { href: "/deploy", labelKey: "sidebar.deploy", icon: Rocket },
  { href: "/configs", labelKey: "sidebar.configs", icon: FileCode },
  { href: "/resources", labelKey: "sidebar.resources", icon: Activity },
  { href: "/settings", labelKey: "sidebar.settings", icon: Settings },
  { href: "/about",    labelKey: "sidebar.about",    icon: Info },
];

export function AppSidebar() {
  const pathname = usePathname();
  const logout = useAuth((s) => s.logout);
  const { t, dir } = useI18n();

  return (
    <Sidebar side={dir === "rtl" ? "right" : "left"}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground">
                  <Zap className="h-4 w-4 text-background" />
                </div>
                <span className="text-sm font-semibold tracking-tight">{t("app.title")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{t(item.labelKey)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout}>
              <LogOut />
              <span>{t("sidebar.logout")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

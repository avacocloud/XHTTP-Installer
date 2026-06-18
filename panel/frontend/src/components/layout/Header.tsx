"use client";

import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { User, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export function Header() {
  const user = useAuth((s) => s.user);
  const { locale, setLocale } = useI18n();

  return (
    <header className="flex h-12 items-center gap-2 border-b border-border bg-background px-4">
      <SidebarTrigger className="-ms-1" />
      <Separator orientation="vertical" className="h-4" />
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setLocale(locale === "en" ? "fa" : "en")}
        >
          <Globe className="h-3.5 w-3.5" />
          {locale === "en" ? "FA" : "EN"}
        </Button>
        <ThemeToggle />
        {user && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground border-s border-border ps-3 ms-1">
            <User className="h-3.5 w-3.5" />
            {user.username}
          </div>
        )}
      </div>
    </header>
  );
}

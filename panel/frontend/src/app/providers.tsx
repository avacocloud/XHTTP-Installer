"use client";

import { ThemeProvider } from "next-themes";
import { I18nProvider } from "@/lib/i18n";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <I18nProvider>
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster richColors position="top-center" />
        </TooltipProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

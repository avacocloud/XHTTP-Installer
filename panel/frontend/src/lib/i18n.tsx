"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import en from "@/locales/en.json";
import fa from "@/locales/fa.json";

type Messages = typeof en;
type Locale = "en" | "fa";

const messages: Record<Locale, Messages> = { en, fa };

interface I18nContextType {
  locale: Locale;
  dir: "ltr" | "rtl";
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: "en",
  dir: "ltr",
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const saved = localStorage.getItem("locale") as Locale;
    if (saved && messages[saved]) {
      setLocaleState(saved);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("locale", l);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string>) => {
      const parts = key.split(".");
      let value: any = messages[locale];
      for (const part of parts) {
        value = value?.[part];
      }
      if (typeof value !== "string") return key;
      if (params) {
        return value.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
      }
      return value;
    },
    [locale]
  );

  const dir = locale === "fa" ? "rtl" : "ltr";

  return (
    <I18nContext.Provider value={{ locale, dir, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

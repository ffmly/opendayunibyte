"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getDefaultLocale, locales, type Locale } from "@/lib/i18n/locales";
import type { MessageDict } from "@/locales/en";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: MessageDict;
  dir: "ltr" | "rtl";
  isRtl: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ar");

  useEffect(() => {
    const timer = window.setTimeout(() => setLocaleState(getDefaultLocale()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem("unibyte.locale", next);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const isRtl = locale === "ar";
    document.documentElement.lang = locale === "ar" ? "ar" : "en";
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const isRtl = locale === "ar";
    return {
      locale,
      setLocale,
      t: locales[locale],
      dir: isRtl ? "rtl" : "ltr",
      isRtl,
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

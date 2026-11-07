import { en } from "../../locales/en";
import { ar } from "../../locales/ar";
import { fr } from "../../locales/fr";
import type { MessageDict } from "../../locales/en";

export type Locale = "ar" | "en" | "fr";

export const locales: Record<Locale, MessageDict> = { en, ar, fr };

export const localeInfo: Record<
  Locale,
  { label: string; dir: "ltr" | "rtl"; lang: string }
> = {
  ar: { label: "العربية", dir: "rtl", lang: "ar" },
  en: { label: "English", dir: "ltr", lang: "en" },
  fr: { label: "Français", dir: "ltr", lang: "fr" },
};

export function getDefaultLocale(): Locale {
  if (typeof window === "undefined") return "ar";
  const saved = window.localStorage.getItem("unibyte.locale");
  if (saved === "ar" || saved === "en" || saved === "fr") return saved;
  const nav = window.navigator.language?.toLowerCase() ?? "";
  if (nav.startsWith("ar")) return "ar";
  if (nav.startsWith("fr")) return "fr";
  return "en";
}

export type { MessageDict };

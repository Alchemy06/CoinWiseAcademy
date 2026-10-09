// Keep locale defaults in one module so storage, Intl formatting, and provider bootstrapping stay consistent.
export const DEFAULT_LOCALE = "en-GB" as const;
export const SUPPORTED_LOCALES = ["en-GB", "zh-CN"] as const;
// Version the storage key so future locale migrations can invalidate stale browser preferences cleanly.
export const LOCALE_STORAGE_KEY = "crypto-or-no-crypto-locale-preference-v1";

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(value: unknown): value is Locale {
  // Narrow arbitrary persisted/runtime values before they flow into translation lookup.
  return typeof value === "string" && SUPPORTED_LOCALES.includes(value as Locale);
}

export function getStoredLocale(): Locale {
  // Read lazily from local storage so the first client render can honor the last explicit language choice.
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }

  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return isSupportedLocale(stored) ? stored : DEFAULT_LOCALE;
}

export function setStoredLocale(locale: Locale): void {
  // Ignore server contexts because only the browser owns the persistent locale preference.
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

export function getLocaleDisplayName(locale: Locale): string {
  // Surface a stable menu label instead of relying on browser-specific Intl display-name support.
  return locale === "zh-CN" ? "简体中文" : "English (UK)";
}

export function getIntlLocale(locale: Locale): string {
  // Map app locales onto Intl-compatible tags for date/time formatting and the document lang attribute.
  return locale === "zh-CN" ? "zh-CN" : "en-GB";
}

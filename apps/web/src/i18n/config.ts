export const LOCALES = ['en', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export function isLocale(v: unknown): v is Locale {
  return LOCALES.includes(v as Locale);
}

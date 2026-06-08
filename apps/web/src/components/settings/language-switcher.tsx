"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocaleCookie } from "../../i18n/set-locale-action";
import { updateUserLocale } from "../../lib/api";
import { LOCALES, type Locale } from "../../i18n/config";

// Token palette — matches profile-workspace.tsx tokens.
const L = {
  line: "#ececea",
  panel: "#f9f9f8",
  ink: "#0e0e0d",
  mut: "#76766f",
  mut2: "#a5a59e",
} as const;

const LOCALE_LABEL_KEYS: Record<Locale, "english" | "russian"> = {
  en: "english",
  ru: "russian",
};

export function LanguageSwitcher() {
  const t = useTranslations("Settings");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { getToken } = useAuth();

  const mutation = useMutation({
    mutationFn: async (next: Locale) => {
      // 1. Best-effort backend persist — failure must not block UI switch.
      try {
        const token = await getToken();
        if (token) {
          await updateUserLocale(token, next);
        }
      } catch {
        // intentionally swallowed — backend sync is non-blocking
      }

      // 2. Persist cookie and refresh server components.
      await setLocaleCookie(next);
      router.refresh();
    },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label
        htmlFor="language-select"
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: L.mut,
          letterSpacing: 0.2,
        }}
      >
        {t("languageLabel")}
      </label>
      <select
        id="language-select"
        value={locale}
        disabled={mutation.isPending}
        aria-label={t("languageLabel")}
        onChange={(e) => {
          const next = e.target.value as Locale;
          if (next !== locale && LOCALES.includes(next)) {
            mutation.mutate(next);
          }
        }}
        style={{
          padding: "8px 12px",
          paddingRight: 32,
          borderRadius: 10,
          border: `1px solid ${L.line}`,
          background: L.panel,
          fontSize: 14,
          fontWeight: 500,
          color: L.ink,
          cursor: mutation.isPending ? "wait" : "pointer",
          outline: "none",
          appearance: "none",
          WebkitAppearance: "none",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2376766f' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 10px center",
        }}
      >
        {LOCALES.map((loc) => (
          <option key={loc} value={loc}>
            {t(LOCALE_LABEL_KEYS[loc])}
          </option>
        ))}
      </select>
      {mutation.isPending ? (
        <span style={{ fontSize: 12, color: L.mut2 }}>{t("languageSaving")}</span>
      ) : null}
      {mutation.isError ? (
        <span role="alert" style={{ fontSize: 12, color: "#f0506a" }}>
          {t("languageError")}
        </span>
      ) : null}
    </div>
  );
}

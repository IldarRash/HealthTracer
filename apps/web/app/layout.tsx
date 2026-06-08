import { ClerkProvider } from "@clerk/nextjs";
import { enUS, ruRU } from "@clerk/localizations";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getLocale } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { QueryProvider } from "../src/providers/query-provider";
import "./styles.css";

// @clerk/localizations@4 and @clerk/nextjs@7 have a structural version mismatch
// on LocalizationResource (testUrl shape changed). Cast through the prop type so
// the object stays typed from the consumer's perspective without `as any`.
type ClerkLocalization = NonNullable<Parameters<typeof ClerkProvider>[0]["localization"]>;

export const metadata: Metadata = {
  title: "AI Health Coach",
  description: "Wellness coaching, workouts, goals, and nutrition in one focused experience.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const locale = await getLocale();
  const clerkLocalization = (locale === "ru" ? ruRU : enUS) as ClerkLocalization;

  return (
    <html lang={locale}>
      <body>
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/chat"
          signUpFallbackRedirectUrl="/onboarding"
          localization={clerkLocalization}
        >
          <NextIntlClientProvider>
            <QueryProvider>{children}</QueryProvider>
          </NextIntlClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}

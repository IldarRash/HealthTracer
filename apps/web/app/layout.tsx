import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { QueryProvider } from "../src/providers/query-provider";
import "./styles.css";

export const metadata: Metadata = {
  title: "AI Health Coach",
  description: "Wellness coaching, workouts, goals, and nutrition in one focused experience.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          <QueryProvider>{children}</QueryProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}

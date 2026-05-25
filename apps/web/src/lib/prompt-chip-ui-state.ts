import type { ComponentProps } from "react";
import type Link from "next/link";
import type { ReactNode } from "react";

type PromptChipHref = ComponentProps<typeof Link>["href"];

function resolvePromptChipHrefPath(href: PromptChipHref): string {
  if (typeof href === "string") {
    return href.split("?")[0] ?? href;
  }

  if (href && typeof href === "object" && "pathname" in href && href.pathname) {
    return href.pathname;
  }

  return "";
}

function chatHrefPrefillsPrompt(href: PromptChipHref): boolean {
  if (typeof href === "string") {
    return href.includes("?");
  }

  if (href && typeof href === "object") {
    return Boolean(href.search || href.query);
  }

  return false;
}

export function buildPromptChipLinkAriaLabel(input: {
  href: PromptChipHref;
  promptLabel?: string;
  children?: ReactNode;
}): string | undefined {
  const visibleLabel = typeof input.children === "string" ? input.children : undefined;
  const path = resolvePromptChipHrefPath(input.href);
  const isPlainChatRoute = path === "/chat" && !chatHrefPrefillsPrompt(input.href);

  if (isPlainChatRoute) {
    const topic = visibleLabel ?? input.promptLabel;
    return topic ? `Open Chat — ${topic}` : "Open Chat";
  }

  const resolvedLabel = input.promptLabel ?? visibleLabel;
  return resolvedLabel ? `Open Chat and discuss: ${resolvedLabel}` : undefined;
}

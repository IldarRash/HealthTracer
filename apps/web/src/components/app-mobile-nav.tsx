"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "./ui/icon";
import { Mark } from "./ui/icon";

// ── AppMobileBar ──────────────────────────────────────────────────────────────

type AppMobileBarProps = {
  navOpen: boolean;
  onOpen: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
};

export function AppMobileBar({ navOpen, onOpen, triggerRef }: AppMobileBarProps) {
  const t = useTranslations("Nav");

  return (
    <div className="app-shell__mobile-bar" role="banner">
      <button
        ref={triggerRef}
        type="button"
        className="app-shell__mobile-bar__hamburger"
        aria-expanded={navOpen}
        aria-controls="app-nav-drawer"
        aria-label={t("openNavigation")}
        onClick={onOpen}
      >
        <Icon name="menu" size={22} aria-hidden />
      </button>
      <div className="app-shell__mobile-bar__brand" aria-hidden>
        <Mark size={24} />
        <span className="app-shell__mobile-bar__brand-name">{t("brandName")}</span>
      </div>
    </div>
  );
}

// ── AppNavDrawer ──────────────────────────────────────────────────────────────

type AppNavDrawerProps = {
  children: ReactNode;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
};

export function AppNavDrawer({ children, onClose, triggerRef }: AppNavDrawerProps) {
  const t = useTranslations("Nav");
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the close button when the drawer opens
  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  // Close on Escape key; maintain basic focus trap between first/last focusable
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "Tab") {
      const focusable = e.currentTarget.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
    }
  }

  function handleClose() {
    onClose();
    // Return focus to the hamburger trigger
    triggerRef.current?.focus();
  }

  return (
    <div className="app-shell__drawer-root" onKeyDown={handleKeyDown}>
      {/* Scrim — click to close */}
      <div
        className="app-shell__scrim"
        role="presentation"
        onClick={handleClose}
        aria-hidden
      />
      {/* Drawer panel */}
      <div
        id="app-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={t("mainNavLabel")}
        className="app-shell__drawer"
      >
        <button
          ref={closeBtnRef}
          type="button"
          className="app-shell__mobile-bar__hamburger"
          aria-label={t("closeNavigation")}
          onClick={handleClose}
          style={{ position: "absolute", top: "0.75rem", right: "0.75rem", zIndex: 1 }}
        >
          <Icon name="x" size={22} aria-hidden />
        </button>
        {children}
      </div>
    </div>
  );
}

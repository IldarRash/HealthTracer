import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mobileNavSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "app-mobile-nav.tsx"),
  "utf8",
);

describe("AppMobileBar source contract", () => {
  it("renders a hamburger button with aria-expanded and aria-controls", () => {
    expect(mobileNavSource).toContain('aria-expanded={navOpen}');
    expect(mobileNavSource).toContain('aria-controls="app-nav-drawer"');
  });

  it("uses the Nav.openNavigation i18n key for the hamburger label", () => {
    expect(mobileNavSource).toContain('t("openNavigation")');
  });

  it("passes a triggerRef to the hamburger button for focus return", () => {
    expect(mobileNavSource).toContain("triggerRef");
    expect(mobileNavSource).toContain("ref={triggerRef}");
  });
});

describe("AppNavDrawer source contract", () => {
  it("renders the drawer with correct dialog role, aria-modal, and aria-label", () => {
    expect(mobileNavSource).toContain('id="app-nav-drawer"');
    expect(mobileNavSource).toContain('role="dialog"');
    expect(mobileNavSource).toContain('aria-modal="true"');
    expect(mobileNavSource).toContain('aria-label={t("mainNavLabel")}');
  });

  it("uses Nav.closeNavigation i18n key for the close button", () => {
    expect(mobileNavSource).toContain('t("closeNavigation")');
  });

  it("focuses the close button on open via useEffect", () => {
    expect(mobileNavSource).toContain("closeBtnRef");
    expect(mobileNavSource).toContain("closeBtnRef.current?.focus()");
    expect(mobileNavSource).toContain("useEffect");
  });

  it("handles Escape key to close the drawer", () => {
    expect(mobileNavSource).toContain('"Escape"');
    expect(mobileNavSource).toContain("onClose()");
  });

  it("returns focus to the trigger on close", () => {
    expect(mobileNavSource).toContain("triggerRef.current?.focus()");
  });

  it("implements a basic Tab focus trap", () => {
    expect(mobileNavSource).toContain('"Tab"');
    expect(mobileNavSource).toContain("focusable");
    expect(mobileNavSource).toContain("e.preventDefault()");
  });

  it("renders a scrim that closes on click", () => {
    expect(mobileNavSource).toContain('className="app-shell__scrim"');
    expect(mobileNavSource).toContain("onClick={handleClose}");
  });
});

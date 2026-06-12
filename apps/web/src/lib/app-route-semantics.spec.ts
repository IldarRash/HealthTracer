import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webAppDir = join(dirname(fileURLToPath(import.meta.url)), "../../app");

function readAppPage(route: string): string {
  return readFileSync(join(webAppDir, route, "page.tsx"), "utf8");
}

describe("app route semantics", () => {
  it("alias routes are deleted — /goals /documents /metrics /progress no longer exist as pages", () => {
    // These routes previously redirected to hash anchors; now they 404.
    // Deep links go directly to /profile#goals, /profile#documents, /profile#data-consent.
    expect(existsSync(join(webAppDir, "goals/page.tsx"))).toBe(false);
    expect(existsSync(join(webAppDir, "documents/page.tsx"))).toBe(false);
    expect(existsSync(join(webAppDir, "metrics/page.tsx"))).toBe(false);
    expect(existsSync(join(webAppDir, "progress/page.tsx"))).toBe(false);
    expect(existsSync(join(webAppDir, "proposals/page.tsx"))).toBe(false);
  });

  it("renders /recipes as a real surface (RecipesWorkspace) — not a redirect to /nutrition", () => {
    const recipesPage = readAppPage("recipes");
    expect(recipesPage).toContain("RecipesWorkspace");
    expect(recipesPage).not.toContain('redirect("/nutrition")');
  });

  it("profile page mounts ProfileWorkspace directly", () => {
    expect(readAppPage("profile")).toContain("<ProfileWorkspace />");
  });

  it("keeps the authenticated home entry on Chat", () => {
    expect(readAppPage("")).toContain('redirect("/chat")');
  });

  it("uses immersive chat layout only on the Chat page", () => {
    expect(readAppPage("chat")).toContain('<AppLayout variant="chat">');
    expect(readAppPage("training")).toContain("<AppLayout>");
    expect(readAppPage("training")).not.toContain('variant="chat"');
    expect(readAppPage("nutrition")).not.toContain('variant="chat"');
    expect(readAppPage("today")).not.toContain('variant="chat"');
    expect(readAppPage("profile")).not.toContain('variant="chat"');
  });

  it("keeps secondary Training and Nutrition pages on structured read-only headers", () => {
    expect(readAppPage("training")).toContain('title="Workouts"');
    expect(readAppPage("training")).toContain("Read-only view");
    expect(readAppPage("training")).toContain("<PageContent>");
    expect(readAppPage("nutrition")).toContain('title="Nutrition"');
    expect(readAppPage("nutrition")).toContain("Read-only view");
    expect(readAppPage("nutrition")).toContain("<PageContent>");
  });

  it("no page uses per-page auth boilerplate — middleware owns protection", () => {
    for (const route of ["chat", "profile", "today", "longevity", "training", "nutrition", "billing", "recipes", "onboarding"]) {
      const src = readAppPage(route);
      expect(src, `${route}/page.tsx should not have isAuthenticated`).not.toContain("isAuthenticated");
      expect(src, `${route}/page.tsx should not have redirectToAppSignIn`).not.toContain("redirectToAppSignIn");
    }
  });
});

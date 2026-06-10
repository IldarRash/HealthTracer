import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8",
);

describe("Recipes page shell and header", () => {
  it("mounts RecipesWorkspace inside AppLayout with PageHeader and PageContent", () => {
    expect(pageSource).toContain("<AppLayout>");
    expect(pageSource).not.toContain('variant="chat"');
    expect(pageSource).toContain("<PageHeader");
    expect(pageSource).toContain('title="Recipes"');
    expect(pageSource).toContain("<PageContent>");
    expect(pageSource).toContain("<RecipesWorkspace />");
  });

  it("guards the route with auth and redirects unauthenticated users", () => {
    expect(pageSource).toContain("isAuthenticated");
    expect(pageSource).toContain('redirectToAppSignIn("/recipes")');
  });
});

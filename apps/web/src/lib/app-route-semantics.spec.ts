import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webAppDir = join(dirname(fileURLToPath(import.meta.url)), "../../app");

function readAppPage(route: string): string {
  return readFileSync(join(webAppDir, route, "page.tsx"), "utf8");
}

describe("app route semantics", () => {
  it("keeps legacy alias redirects unchanged", () => {
    expect(readAppPage("goals")).toContain('redirect("/profile#goals")');
    expect(readAppPage("documents")).toContain('redirect("/profile#documents")');
    expect(readAppPage("metrics")).toContain('redirect("/profile#data-consent")');
    expect(readAppPage("recipes")).toContain('redirect("/nutrition")');
    expect(readAppPage("progress")).toContain('redirect("/training#progress")');
  });

  it("keeps profile hash anchors for goals, documents, and data consent routes", () => {
    expect(readAppPage("goals")).toContain("/profile#goals");
    expect(readAppPage("documents")).toContain("/profile#documents");
    expect(readAppPage("metrics")).toContain("/profile#data-consent");
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
});

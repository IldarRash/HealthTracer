import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getAppShellClassNames,
  getAppShellMainClassNames,
} from "../../lib/shell-ui-state.js";

const appShellSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "app-shell.tsx"),
  "utf8",
);

const stylesSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../app/styles.css"),
  "utf8",
);

describe("AppShell class rendering", () => {
  it("maps shell variants to dark chrome and immersive chat classes", () => {
    expect(appShellSource).toContain('variant === "chat" && "app-shell--chat"');
    expect(getAppShellClassNames("default")).toEqual(["app-shell"]);
    expect(getAppShellClassNames("chat")).toContain("app-shell--chat");
  });

  it("maps main variants to chat and structured canvas classes", () => {
    expect(appShellSource).toContain('variant === "chat" && "app-shell__main--chat"');
    expect(appShellSource).toContain('variant === "structured" && "app-shell__main--structured"');
    expect(appShellSource).not.toContain('variant === "dashboard"');
    expect(getAppShellMainClassNames("structured")).toContain("app-shell__main--structured");
    expect(getAppShellMainClassNames("chat")).toContain("app-shell__main--chat");
  });

  it("scopes state message contrast overrides to the structured canvas", () => {
    expect(stylesSource).toContain(".app-shell__main--structured .state-message__title");
    expect(stylesSource).toContain(".app-shell__main--structured .state-message__description");
    expect(stylesSource).toContain(".app-shell__main--structured .state-message--empty");
    expect(stylesSource).toContain(".app-shell__main--structured .state-message--loading");
    expect(stylesSource).not.toContain(".app-shell__main--dashboard");
  });

  it("scopes secondary plan view panel tokens to the structured light canvas", () => {
    expect(stylesSource).toMatch(
      /\.app-shell__main--structured \.training-workspace \.panel[\s\S]*--color-surface-content-elevated/,
    );
    expect(stylesSource).toMatch(
      /\.app-shell__main--structured \.training-workspace \.panel-prominent[\s\S]*--color-coach-300/,
    );
    expect(stylesSource).toMatch(
      /\.app-shell__main--structured \.training-workspace \.training-revision-card\.active[\s\S]*--color-coach-500/,
    );
    expect(stylesSource).toMatch(
      /\.app-shell__main--structured \.training-workspace \.training-execution-callout[\s\S]*--color-coach-300/,
    );
  });
});

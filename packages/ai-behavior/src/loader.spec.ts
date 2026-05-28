import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDefaultAiBehaviorConfig,
  resolveLoadedAiBehaviorConfig,
} from "@health/types";
import {
  loadAiBehaviorConfig,
  loadDefaultAiBehaviorConfigFile,
  readAiBehaviorConfigFile,
} from "./loader.js";
import { DEFAULT_AI_BEHAVIOR_CONFIG_FILE } from "./paths.js";

describe("ai behavior config loader", () => {
  it("loads the shipped repo config file", () => {
    const loaded = loadDefaultAiBehaviorConfigFile();

    expect(loaded.source).toBe("file");
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.version).toBe(1);
  });

  it("matches built-in defaults for the shipped config file", () => {
    const loaded = loadDefaultAiBehaviorConfigFile();
    const defaults = buildDefaultAiBehaviorConfig();

    expect(loaded.config).toEqual(defaults);
  });

  it("reads the default config path as valid JSON", () => {
    const fileValue = readAiBehaviorConfigFile(DEFAULT_AI_BEHAVIOR_CONFIG_FILE);
    const parsed = resolveLoadedAiBehaviorConfig({ fileValue });

    expect(parsed.source).toBe("file");
    expect(parsed.errors).toEqual([]);
  });

  it("falls back when config file is missing", () => {
    const loaded = loadAiBehaviorConfig({
      configPath: join(tmpdir(), "missing-ai-behavior-config.json"),
    });

    expect(loaded.source).toBe("defaults");
    expect(loaded.config).toEqual(buildDefaultAiBehaviorConfig());
    expect(loaded.errors.length).toBeGreaterThan(0);
  });

  it("falls back when config file is invalid", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ai-behavior-config-"));
    const invalidPath = join(tempDir, "invalid.json");
    writeFileSync(invalidPath, JSON.stringify({ version: 99 }), "utf8");

    const loaded = loadAiBehaviorConfig({ configPath: invalidPath });

    expect(loaded.source).toBe("defaults");
    expect(loaded.config).toEqual(buildDefaultAiBehaviorConfig());
    expect(loaded.errors.length).toBeGreaterThan(0);
    expect(loaded.warnings.length).toBeGreaterThan(0);
  });

  it("falls back when config file contains malformed JSON", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ai-behavior-config-"));
    const malformedPath = join(tempDir, "malformed.json");
    writeFileSync(malformedPath, "{ not valid json", "utf8");

    const loaded = loadAiBehaviorConfig({ configPath: malformedPath });

    expect(loaded.source).toBe("defaults");
    expect(loaded.config).toEqual(buildDefaultAiBehaviorConfig());
    expect(loaded.errors.some((error) => error.includes("malformed.json"))).toBe(true);
    expect(loaded.warnings).toContain("AI behavior config unavailable; using built-in defaults.");
  });
});

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDefaultAttachmentBehaviorConfig,
  resolveLoadedAttachmentBehaviorConfig,
} from "@health/types";
import {
  loadAttachmentBehaviorConfig,
  loadDefaultAttachmentBehaviorConfigFile,
  readAttachmentBehaviorConfigFile,
} from "./attachment-loader.js";
import { DEFAULT_ATTACHMENT_BEHAVIOR_CONFIG_FILE } from "./paths.js";

describe("attachment behavior config loader", () => {
  it("loads the shipped repo config file", () => {
    const loaded = loadDefaultAttachmentBehaviorConfigFile();

    expect(loaded.source).toBe("file");
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.version).toBe(1);
  });

  it("matches built-in defaults for the shipped config file", () => {
    const loaded = loadDefaultAttachmentBehaviorConfigFile();
    const defaults = buildDefaultAttachmentBehaviorConfig();

    expect(loaded.config).toEqual(defaults);
  });

  it("reads the default config path as valid JSON", () => {
    const fileValue = readAttachmentBehaviorConfigFile(DEFAULT_ATTACHMENT_BEHAVIOR_CONFIG_FILE);
    const parsed = resolveLoadedAttachmentBehaviorConfig({ fileValue });

    expect(parsed.source).toBe("file");
    expect(parsed.errors).toEqual([]);
  });

  it("falls back when config file is missing", () => {
    const loaded = loadAttachmentBehaviorConfig({
      configPath: join(tmpdir(), "missing-attachment-behavior-config.json"),
    });

    expect(loaded.source).toBe("defaults");
    expect(loaded.config).toEqual(buildDefaultAttachmentBehaviorConfig());
    expect(loaded.errors.length).toBeGreaterThan(0);
  });

  it("falls back when config file is invalid", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "attachment-behavior-config-"));
    const invalidPath = join(tempDir, "invalid.json");
    writeFileSync(invalidPath, JSON.stringify({ version: 99 }), "utf8");

    const loaded = loadAttachmentBehaviorConfig({ configPath: invalidPath });

    expect(loaded.source).toBe("defaults");
    expect(loaded.config).toEqual(buildDefaultAttachmentBehaviorConfig());
    expect(loaded.errors.length).toBeGreaterThan(0);
    expect(loaded.warnings.length).toBeGreaterThan(0);
  });

  it("falls back when config file contains malformed JSON", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "attachment-behavior-config-"));
    const malformedPath = join(tempDir, "malformed.json");
    writeFileSync(malformedPath, "{ not valid json", "utf8");

    const loaded = loadAttachmentBehaviorConfig({ configPath: malformedPath });

    expect(loaded.source).toBe("defaults");
    expect(loaded.config).toEqual(buildDefaultAttachmentBehaviorConfig());
    expect(loaded.errors.some((error) => error.includes("malformed.json"))).toBe(true);
    expect(loaded.warnings).toContain(
      "Attachment behavior config unavailable; using built-in defaults.",
    );
  });

  it("enforces safety floors for malicious shipped overrides", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "attachment-behavior-config-"));
    const maliciousPath = join(tempDir, "malicious.json");
    const defaults = buildDefaultAttachmentBehaviorConfig();

    writeFileSync(
      maliciousPath,
      JSON.stringify({
        ...defaults,
        safetyFloors: {
          requireMedicalConsent: false,
          enforceProviderIsolation: false,
          requireOwnershipChecks: false,
          suppressMedicalPlanProposals: false,
        },
      }),
      "utf8",
    );

    const loaded = loadAttachmentBehaviorConfig({ configPath: maliciousPath });

    expect(loaded.source).toBe("file");
    expect(loaded.config.safetyFloors).toEqual(defaults.safetyFloors);
    expect(loaded.warnings.some((warning) => warning.includes("safetyFloors"))).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import type { AttachmentBehaviorConfigLoadResult } from "@health/types";
import {
  buildDefaultAttachmentBehaviorConfig,
  resolveLoadedAttachmentBehaviorConfig,
} from "@health/types";
import {
  DEFAULT_ATTACHMENT_BEHAVIOR_CONFIG_FILE,
  resolveAttachmentBehaviorConfigPath,
} from "./paths.js";

export type LoadAttachmentBehaviorConfigOptions = {
  configPath?: string | null;
  defaults?: ReturnType<typeof buildDefaultAttachmentBehaviorConfig>;
};

export function readAttachmentBehaviorConfigFile(configPath: string): unknown {
  const raw = readFileSync(configPath, "utf8");
  return JSON.parse(raw) as unknown;
}

export function loadAttachmentBehaviorConfig(
  options: LoadAttachmentBehaviorConfigOptions = {},
): AttachmentBehaviorConfigLoadResult {
  const defaults = options.defaults ?? buildDefaultAttachmentBehaviorConfig();
  const configPath = resolveAttachmentBehaviorConfigPath(options.configPath);

  try {
    const fileValue = readAttachmentBehaviorConfigFile(configPath);

    return resolveLoadedAttachmentBehaviorConfig({
      fileValue,
      defaults,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown attachment behavior config read error.";

    return {
      config: defaults,
      source: "defaults",
      errors: [`${configPath}: ${message}`],
      warnings: ["Attachment behavior config unavailable; using built-in defaults."],
    };
  }
}

export function loadDefaultAttachmentBehaviorConfigFile(): AttachmentBehaviorConfigLoadResult {
  return loadAttachmentBehaviorConfig({
    configPath: DEFAULT_ATTACHMENT_BEHAVIOR_CONFIG_FILE,
  });
}

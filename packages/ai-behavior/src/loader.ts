import { readFileSync } from "node:fs";
import type { AiBehaviorConfigLoadResult } from "@health/types";
import {
  buildDefaultAiBehaviorConfig,
  resolveLoadedAiBehaviorConfig,
} from "@health/types";
import { DEFAULT_AI_BEHAVIOR_CONFIG_FILE, resolveAiBehaviorConfigPath } from "./paths.js";

export type LoadAiBehaviorConfigOptions = {
  configPath?: string | null;
  defaults?: ReturnType<typeof buildDefaultAiBehaviorConfig>;
};

export function readAiBehaviorConfigFile(configPath: string): unknown {
  const raw = readFileSync(configPath, "utf8");
  return JSON.parse(raw) as unknown;
}

export function loadAiBehaviorConfig(
  options: LoadAiBehaviorConfigOptions = {},
): AiBehaviorConfigLoadResult {
  const defaults = options.defaults ?? buildDefaultAiBehaviorConfig();
  const configPath = resolveAiBehaviorConfigPath(options.configPath);

  try {
    const fileValue = readAiBehaviorConfigFile(configPath);

    return resolveLoadedAiBehaviorConfig({
      fileValue,
      defaults,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown AI behavior config read error.";

    return {
      config: defaults,
      source: "defaults",
      errors: [`${configPath}: ${message}`],
      warnings: ["AI behavior config unavailable; using built-in defaults."],
    };
  }
}

export function loadDefaultAiBehaviorConfigFile(): AiBehaviorConfigLoadResult {
  return loadAiBehaviorConfig({
    configPath: DEFAULT_AI_BEHAVIOR_CONFIG_FILE,
  });
}

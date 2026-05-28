import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));

export const AI_BEHAVIOR_PACKAGE_ROOT = join(packageRoot, "..");

export const DEFAULT_AI_BEHAVIOR_CONFIG_FILE = join(
  AI_BEHAVIOR_PACKAGE_ROOT,
  "config",
  "ai-behavior.json",
);

export function resolveAiBehaviorConfigPath(
  configuredPath?: string | null,
): string {
  const trimmed = configuredPath?.trim();

  if (trimmed) {
    return trimmed;
  }

  return DEFAULT_AI_BEHAVIOR_CONFIG_FILE;
}

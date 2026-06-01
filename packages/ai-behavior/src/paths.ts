import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DomainConfigDomain } from "@health/types";

const packageRoot = dirname(fileURLToPath(import.meta.url));

export const AI_BEHAVIOR_PACKAGE_ROOT = join(packageRoot, "..");

export const DEFAULT_AI_BEHAVIOR_CONFIG_FILE = join(
  AI_BEHAVIOR_PACKAGE_ROOT,
  "config",
  "ai-behavior.json",
);

export const DEFAULT_ATTACHMENT_BEHAVIOR_CONFIG_FILE = join(
  AI_BEHAVIOR_PACKAGE_ROOT,
  "config",
  "attachments.json",
);

export const DEFAULT_DOMAIN_CONFIG_DIR = join(
  AI_BEHAVIOR_PACKAGE_ROOT,
  "config",
  "domains",
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

export function resolveAttachmentBehaviorConfigPath(
  configuredPath?: string | null,
): string {
  const trimmed = configuredPath?.trim();

  if (trimmed) {
    return trimmed;
  }

  return DEFAULT_ATTACHMENT_BEHAVIOR_CONFIG_FILE;
}

/**
 * Resolve the directory that contains per-domain YAML config files.
 *
 * If `configuredDir` is provided (non-empty after trimming) it is used
 * directly. Otherwise the package's built-in `config/domains/` directory is
 * returned. Environment-variable resolution is intentionally left to the
 * consuming application (e.g. AiBehaviorConfigService in apps/api) so this
 * package does not read `process.env` directly.
 */
export function resolveDomainConfigDir(configuredDir?: string | null): string {
  const trimmed = configuredDir?.trim();

  if (trimmed) {
    return trimmed;
  }

  return DEFAULT_DOMAIN_CONFIG_DIR;
}

export function resolveDomainConfigFilePath(
  domain: DomainConfigDomain,
  dir?: string | null,
): string {
  return join(resolveDomainConfigDir(dir), `${domain}.yml`);
}

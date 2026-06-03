import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type {
  DomainConfig,
  DomainConfigBundle,
  DomainConfigDomain,
  DomainConfigLoadResult,
} from "@health/types";
import {
  DEFAULT_DOMAIN_CONFIGS,
  domainConfigDomainSchema,
  domainConfigSchema,
  intersectDomainConfigWithCatalog,
} from "@health/types";
import { resolveDomainConfigFilePath } from "./paths.js";

// All domains the loader processes on every call.
const ALL_DOMAINS: readonly DomainConfigDomain[] =
  domainConfigDomainSchema.options;

export type LoadDomainConfigOptions = {
  /** Override the directory that contains `{domain}.yml` files. */
  configDir?: string | null;
  /**
   * Override built-in defaults per domain. Used in tests to inject minimal
   * configs without reading the filesystem.
   */
  defaults?: Partial<DomainConfigBundle>;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readDomainYamlFile(filePath: string): unknown {
  const raw = readFileSync(filePath, "utf8");
  return parseYaml(raw) as unknown;
}

/**
 * Parse and validate a raw file value for one domain.
 *
 * Returns `{ success: true, config }` when the file value parses cleanly and
 * the `domain` field matches the expected domain.
 * Returns `{ success: false, errors }` otherwise — caller falls back to the
 * domain default.
 */
function parseDomainConfig(
  raw: unknown,
  expectedDomain: DomainConfigDomain,
): { success: true; config: DomainConfig } | { success: false; errors: string[] } {
  const result = domainConfigSchema.safeParse(raw);

  if (!result.success) {
    const errors = result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    return { success: false, errors };
  }

  if (result.data.domain !== expectedDomain) {
    return {
      success: false,
      errors: [
        `domain mismatch: file declares "${result.data.domain}" but expected "${expectedDomain}"`,
      ],
    };
  }

  return { success: true, config: result.data };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the per-domain YAML config bundle from `config/domains/*.yml`.
 *
 * Fail-closed per file: if a domain file is missing, unreadable, or fails
 * Zod validation, that domain falls back to its built-in default and a
 * warning is recorded. One broken domain never blocks the others.
 *
 * After parsing, each domain config is intersected with the capability
 * catalog: any tool or `mapsToCapabilityId` not in the catalog is dropped
 * and a warning is recorded. YAML can only narrow — never widen — the
 * catalog allowlists.
 */
export function loadDomainConfigs(
  options: LoadDomainConfigOptions = {},
): DomainConfigLoadResult {
  const defaultBundle: DomainConfigBundle = {
    ...DEFAULT_DOMAIN_CONFIGS,
    ...options.defaults,
  };

  const configs: Partial<Record<DomainConfigDomain, DomainConfig>> = {};
  const allErrors: string[] = [];
  const allWarnings: string[] = [];
  let anyFileLoaded = false;

  for (const domain of ALL_DOMAINS) {
    const filePath = resolveDomainConfigFilePath(domain, options.configDir);

    let rawValue: unknown;

    try {
      rawValue = readDomainYamlFile(filePath);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown read error.";
      allErrors.push(`${filePath}: ${message}`);
      allWarnings.push(
        `domain=${domain}: config file unavailable; using built-in defaults.`,
      );
      configs[domain] = defaultBundle[domain];
      continue;
    }

    const parseResult = parseDomainConfig(rawValue, domain);

    if (!parseResult.success) {
      for (const err of parseResult.errors) {
        allErrors.push(`${filePath}: ${err}`);
      }
      allWarnings.push(
        `domain=${domain}: invalid config; using built-in defaults.`,
      );
      configs[domain] = defaultBundle[domain];
      continue;
    }

    // Catalog intersection — drop anything outside the real catalog.
    const catalogWarnings: string[] = [];
    const narrowed = intersectDomainConfigWithCatalog(
      parseResult.config,
      catalogWarnings,
    );
    allWarnings.push(...catalogWarnings);

    configs[domain] = narrowed;
    anyFileLoaded = true;
  }

  const bundle = configs as DomainConfigBundle;

  return {
    configs: bundle,
    source: anyFileLoaded ? "file" : "defaults",
    errors: allErrors,
    warnings: allWarnings,
  };
}

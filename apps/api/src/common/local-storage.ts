import { sep, resolve } from "node:path";

/**
 * Thrown when a storage reference resolves to a path outside the configured root directory.
 * Prevents path-traversal attacks on local filesystem storage adapters.
 */
export class StorageTraversalError extends Error {
  constructor(reference: string) {
    super(
      `Storage reference "${reference}" resolves outside the configured root directory. ` +
        "Refusing to access the path.",
    );
    this.name = "StorageTraversalError";
  }
}

/**
 * Thrown when a local-filesystem storage adapter is instantiated in production without an
 * explicit opt-in via STORAGE_ALLOW_LOCAL_IN_PRODUCTION=true.
 */
export class LocalStorageInProductionError extends Error {
  constructor(adapterName: string) {
    super(
      `${adapterName} cannot run in production without STORAGE_ALLOW_LOCAL_IN_PRODUCTION=true. ` +
        "Local filesystem storage is not suitable for production deployments. " +
        "Configure an access-controlled, encrypted storage adapter or set " +
        "STORAGE_ALLOW_LOCAL_IN_PRODUCTION=true to opt in explicitly.",
    );
    this.name = "LocalStorageInProductionError";
  }
}

/**
 * Guards local storage adapter construction in production.
 * Throws `LocalStorageInProductionError` when `nodeEnv` is "production" and
 * `allowInProduction` is not true.
 */
export function assertNotProductionWithoutOptIn(
  adapterName: string,
  options: { allowInProduction?: boolean; nodeEnv?: string } = {},
): void {
  const isProduction = (options.nodeEnv ?? process.env.NODE_ENV ?? "development") === "production";

  if (isProduction && !options.allowInProduction) {
    throw new LocalStorageInProductionError(adapterName);
  }
}

/**
 * Resolves `storageReference` relative to `resolvedRoot` and asserts the result
 * stays within the root directory. Throws `StorageTraversalError` if it escapes.
 */
export function resolveSafePath(resolvedRoot: string, storageReference: string): string {
  const candidate = resolve(resolvedRoot, storageReference);
  const rootWithSep = resolvedRoot + sep;

  if (!candidate.startsWith(rootWithSep) && candidate !== resolvedRoot) {
    throw new StorageTraversalError(storageReference);
  }

  return candidate;
}

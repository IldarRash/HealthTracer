import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const stripJsImportExtensionsLoader = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "turbopack/strip-js-import-extensions.cjs",
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@health/types", "@health/ui"],
  turbopack: {
    root: workspaceRoot,
    // Turbopack has no extensionAlias; rewrite relative ".js" specifiers in TS
    // sources so NodeNext-style workspace packages resolve during bundling.
    rules: {
      "*.ts": {
        loaders: [stripJsImportExtensionsLoader],
        as: "*.ts",
      },
    },
  },
};

export default nextConfig;

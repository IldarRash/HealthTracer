import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const stripJsImportExtensionsLoader = path.join(
  projectRoot,
  "turbopack/strip-js-import-extensions.cjs",
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@health/types", "@health/ui"],
  turbopack: {
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

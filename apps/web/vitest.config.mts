import { defineConfig } from "vitest/config";

// Next.js sets tsconfig "jsx": "preserve", which leaves JSX untransformed when
// vitest imports a .tsx component (rolldown parse error). Force the automatic
// runtime so specs can unit-test component routing by calling components
// directly. Vite 8 runs on rolldown/oxc, so the transform override is `oxc`
// (the legacy `esbuild` option is ignored).
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
});

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Okunabilirlik: iç içe ternary yok; boş blok/catch yok (bilerek yutulan hata loglanır, nedeni yazılır);
  // return ile biten daldan sonra else yok
  {
    rules: {
      "no-nested-ternary": "error",
      "no-empty": "error",
      "no-else-return": ["error", { allowElseIf: false }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright: Testserver-Build (NEXT_DIST_DIR) und Berichte
    ".next-e2e/**",
    ".next-live/**",
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
  ]),
]);

export default eslintConfig;

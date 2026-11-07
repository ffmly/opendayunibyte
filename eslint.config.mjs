import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    // Separate legacy/asset-generation projects are not part of this app.
    "psychic-lamp/**",
    "scripts/*.cjs",
    // Legacy Cloud Functions are compiled and checked by their own tsconfig.
    "functions/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

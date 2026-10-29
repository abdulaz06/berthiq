import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
export default defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "lib/types/api.ts",
    "public/vendor/**",
    "test-results/**",
  ]),
  // Effects reset asynchronous resource state when datasets change; that reset
  // intentionally prevents a previous dataset's evidence from remaining visible.
  { rules: { "react-hooks/set-state-in-effect": "off" } },
]);

// Prepend a "generated, do not edit" banner to a file (openapi-typescript emits
// none). Idempotent: skips if the banner is already present. Used by `just types`.
//
//   node scripts/prepend-generated-banner.mjs <file>

import { readFileSync, writeFileSync } from "node:fs";

const MARKER = "GENERATED FILE — DO NOT EDIT BY HAND";
const BANNER = `/**
 * ${MARKER}.
 *
 * Regenerate with \`just types\` (backend OpenAPI -> openapi-typescript).
 * Source of truth: backend/app/schemas/ (docs/DATA_CONTRACTS.md).
 */

`;

const file = process.argv[2];
if (!file) {
  console.error("usage: prepend-generated-banner.mjs <file>");
  process.exit(1);
}

const current = readFileSync(file, "utf8");
if (current.includes(MARKER)) {
  process.exit(0); // already banded
}
writeFileSync(file, BANNER + current);
console.log(`Prepended generated banner to ${file}`);

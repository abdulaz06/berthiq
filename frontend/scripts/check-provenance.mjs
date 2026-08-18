// Provenance lint (CLAUDE.md rule #3): every KPI on screen must render through
// <ProvenanceBadge>. A raw untagged number is a bug.
//
// Rule (v1, intentionally conservative): any *.tsx file under the scanned UI
// roots that references the `KpiValue` contract type is assumed to render a KPI,
// and MUST also reference `ProvenanceBadge`. This keys off the type because a
// component that receives KpiValue data is the thing responsible for showing the
// provenance. As real KPI components land (M1-08/10/12) the rule can tighten to
// track actual JSX, but this already blocks the mistake we care about: piping a
// KpiValue to the screen without its lineage.
//
// Usage:
//   node scripts/check-provenance.mjs            scan the real app (app/, components/)
//   import { findViolations } from ...           unit-tested in check-provenance.test.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const FRONTEND_ROOT = join(HERE, "..");

/** Default UI roots scanned in CI, relative to the frontend package root. */
export const DEFAULT_ROOTS = ["app", "components"];

export const RULE_DESCRIPTION =
  "a *.tsx that references KpiValue must also render <ProvenanceBadge>";

/** Recursively collect *.tsx files under `dir` (missing dirs yield nothing). */
function collectTsx(dir) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // directory doesn't exist yet — fine
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out = out.concat(collectTsx(full));
    } else if (entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip block and line comments so that mentioning a symbol in a comment doesn't
 * count as using it in code. The line-comment guard avoids eating `://` in URLs.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** A file "renders a KPI" if its code names the KpiValue contract type. */
function rendersKpi(code) {
  return /\bKpiValue\b/.test(code);
}

function hasProvenanceBadge(code) {
  return /\bProvenanceBadge\b/.test(code);
}

/**
 * Scan the given root directories and return a list of violations.
 * @param {string[]} roots  directories (absolute, or relative to FRONTEND_ROOT)
 * @returns {{ file: string, reason: string }[]}
 */
export function findViolations(roots) {
  const violations = [];
  for (const root of roots) {
    const abs = root.startsWith("/") || /^[A-Za-z]:/.test(root) ? root : join(FRONTEND_ROOT, root);
    for (const file of collectTsx(abs)) {
      const code = stripComments(readFileSync(file, "utf8"));
      if (rendersKpi(code) && !hasProvenanceBadge(code)) {
        violations.push({
          file,
          reason: "references KpiValue but never renders <ProvenanceBadge>",
        });
      }
    }
  }
  return violations;
}

// --- CLI ------------------------------------------------------------------
// Run directly (not when imported by the test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const violations = findViolations(DEFAULT_ROOTS);
  if (violations.length > 0) {
    console.error(`✗ Provenance check failed (${RULE_DESCRIPTION}):`);
    for (const v of violations) {
      console.error(`  - ${v.file}: ${v.reason}`);
    }
    console.error(
      "\nEvery KPI must render through <ProvenanceBadge> (CLAUDE.md rule #3).",
    );
    process.exit(1);
  }
  console.log("✓ Provenance check passed: no untagged KPI renders found.");
}

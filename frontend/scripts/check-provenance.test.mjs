// Proof that the provenance lint actually fires (M0-8 acceptance: "include one
// intentionally-checked example proving the provenance lint fires").
//
// Runs the checker against two committed fixtures: a BAD component that renders a
// KpiValue without <ProvenanceBadge> (must be flagged) and a GOOD one that
// includes the badge (must pass). Uses vitest globals (see vitest.config.ts).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { findViolations, RULE_DESCRIPTION } from "./check-provenance.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BAD = join(HERE, "__fixtures__", "bad");
const GOOD = join(HERE, "__fixtures__", "good");

describe("provenance lint", () => {
  it("flags a KPI rendered without <ProvenanceBadge>", () => {
    const violations = findViolations([BAD]);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].file).toMatch(/BadKpiCard\.tsx$/);
  });

  it("passes a KPI rendered with <ProvenanceBadge>", () => {
    expect(findViolations([GOOD])).toEqual([]);
  });

  it("exposes a human-readable rule description", () => {
    expect(RULE_DESCRIPTION).toContain("ProvenanceBadge");
  });
});

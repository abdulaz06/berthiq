/**
 * <ProvenanceBadge> — the tag every KPI on screen must carry (CLAUDE.md rule #3).
 *
 * Renders the KPI's provenance as a small, distinctly-coloured pill. Pair it with
 * any rendered `KpiValue` so a number never reaches the DOM without its lineage;
 * the M0-8 provenance lint enforces exactly that.
 */

import { PROVENANCE_STYLES, type Provenance } from "@/lib/provenance";

export interface ProvenanceBadgeProps {
  provenance: Provenance;
  /** Extra classes appended to the badge (e.g. spacing in a KPI row). */
  className?: string;
}

export function ProvenanceBadge({ provenance, className }: ProvenanceBadgeProps) {
  const style = PROVENANCE_STYLES[provenance];
  const classes = [
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
    style.className,
    className ?? "",
  ]
    .join(" ")
    .trim();

  return (
    <span data-provenance={provenance} title={style.description} className={classes}>
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: style.dot }}
      />
      {style.label}
    </span>
  );
}

export default ProvenanceBadge;

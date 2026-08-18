// INTENTIONALLY BAD — the provenance check must flag this file.
// It renders a KPI value on screen but never renders the provenance badge, so the
// number reaches the DOM without its lineage. This file lives under
// scripts/__fixtures__/ so it is excluded from tsconfig/eslint and is only ever
// read as text by check-provenance.test.mjs.
import type { KpiValue } from "@/lib/types/api";

export function BadKpiCard({ waiting }: { waiting: KpiValue }) {
  return (
    <div className="kpi">
      <span className="value">{waiting.value}</span>
      <span className="unit">{waiting.unit}</span>
    </div>
  );
}

// INTENTIONALLY GOOD — the provenance check must pass this file.
// It renders the KPI value *and* its provenance via <ProvenanceBadge>. Lives
// under scripts/__fixtures__/ so it is excluded from tsconfig/eslint and is only
// ever read as text by check-provenance.test.mjs.
import { ProvenanceBadge } from "@/components/provenance/ProvenanceBadge";
import type { KpiValue } from "@/lib/types/api";

export function GoodKpiCard({ waiting }: { waiting: KpiValue }) {
  return (
    <div className="kpi">
      <span className="value">{waiting.value}</span>
      <span className="unit">{waiting.unit}</span>
      <ProvenanceBadge provenance={waiting.provenance} />
    </div>
  );
}

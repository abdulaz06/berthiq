# provenance/

`<ProvenanceBadge>` — renders the observed / predicted / simulated / optimized
tag every KPI must carry (CLAUDE.md rule #3). Built in M0-7.

- `ProvenanceBadge.tsx` — the pill component; takes a `provenance` prop.
- `../../lib/provenance.ts` — the `Provenance` union type + `PROVENANCE_STYLES`
  colour/label map (mirrors `backend/app/core/provenance.py`).

Render it next to any `KpiValue` on screen; the M0-8 provenance lint fails a
`*.tsx` that shows a KPI without it.

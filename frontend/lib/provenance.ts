/**
 * Provenance — the frontend half of the honesty guarantee (CLAUDE.md rule #3).
 *
 * These four values mirror the backend `Provenance` enum
 * (backend/app/core/provenance.py) and the `KpiValue.provenance` contract
 * (docs/DATA_CONTRACTS.md §3). Keep them in lockstep: when M0-4 generates
 * `lib/types/api.ts`, the KpiValue provenance type comes from there; this module
 * owns the *presentation* (labels + colours) that `<ProvenanceBadge>` renders.
 */

export const PROVENANCE_VALUES = ["observed", "predicted", "simulated", "optimized"] as const;

export type Provenance = (typeof PROVENANCE_VALUES)[number];

export interface ProvenanceStyle {
  /** Short human label shown in the badge. */
  label: string;
  /** One-line meaning, used as the badge tooltip. */
  description: string;
  /** Tailwind classes giving each state a distinct, accessible colour. */
  className: string;
  /** Stable dot colour (hex) for legends/charts where classes don't reach. */
  dot: string;
}

/**
 * One distinct visual treatment per provenance. The four hues (slate / amber /
 * sky / emerald) are deliberately far apart so the states are separable at a
 * glance and for colour-vision-deficient viewers the text label still carries it.
 */
export const PROVENANCE_STYLES: Record<Provenance, ProvenanceStyle> = {
  observed: {
    label: "Observed",
    description: "Measured directly from the event log",
    className: "bg-slate-100 text-slate-700 border-slate-300",
    dot: "#64748b",
  },
  predicted: {
    label: "Predicted",
    description: "Estimated by the risk model",
    className: "bg-amber-100 text-amber-800 border-amber-300",
    dot: "#d97706",
  },
  simulated: {
    label: "Simulated",
    description: "Produced by a simulation run",
    className: "bg-sky-100 text-sky-800 border-sky-300",
    dot: "#0284c7",
  },
  optimized: {
    label: "Optimized",
    description: "Chosen by the optimizer (solver)",
    className: "bg-emerald-100 text-emerald-800 border-emerald-300",
    dot: "#059669",
  },
};

/** Runtime type guard — useful when a value arrives as a raw string. */
export function isProvenance(value: string): value is Provenance {
  return (PROVENANCE_VALUES as readonly string[]).includes(value);
}

// The scenario verdict: a template that phrases the simulator's and solver's
// numbers. It never computes an outcome of its own beyond differences and
// ratios of values it is given, and it always states the cost with the gain.
import type { OptimizationResult, SimulationResult } from "./api/contracts";

export type Verdict = {
  tone: "better" | "worse" | "neutral";
  headline: string;
  waiting: { before: number; after: number; change: number } | null;
  lines: string[];
};

const round = (v: number, digits = 1) => Number(v.toFixed(digits));
const pct = (before: number, after: number) => (before ? ((after - before) / before) * 100 : 0);

export function verdict(sim: SimulationResult, opt: OptimizationResult | null): Verdict {
  const lines: string[] = [];
  const pair = (key: string) =>
    (sim.headline as Record<string, [{ value: number }, { value: number }]>)[key] ??
    (sim.tradeoffs as Record<string, [{ value: number }, { value: number }]>)[key];

  const wait = pair("avg_waiting_time");
  const waiting = wait
    ? { before: wait[0].value, after: wait[1].value, change: pct(wait[0].value, wait[1].value) }
    : null;
  if (waiting)
    lines.push(
      `Average wait per open call: ${round(waiting.before)} h → ${round(waiting.after)} h (${
        waiting.change > 0 ? "+" : ""
      }${round(waiting.change, 0)}%).`,
    );

  const staffed = pair("reviewer_staffed_hours");
  if (staffed && staffed[1].value !== staffed[0].value)
    lines.push(
      `Reviewer time staffed: ${round(staffed[0].value, 0)} h → ${round(staffed[1].value, 0)} h (${
        staffed[1].value > staffed[0].value ? "+" : ""
      }${round(staffed[1].value - staffed[0].value, 0)} h). That is the price of the change.`,
    );

  const overtime = pair("reviewer_overtime");
  if (overtime && overtime[1].value > overtime[0].value)
    lines.push(`Reviewer overtime rises from ${round(overtime[0].value)} h to ${round(overtime[1].value)} h.`);

  const onTime = pair("window_compliance");
  if (onTime)
    lines.push(
      onTime[0].value === 0 && onTime[1].value === 0
        ? "Neither plan starts any open call inside its service window (0% → 0%): the gain is shorter waits, not on-time starts."
        : `Calls starting inside their window: ${round(onTime[0].value, 0)}% → ${round(onTime[1].value, 0)}%.`,
    );

  const conflicts = pair("berth_conflicts");
  if (conflicts)
    lines.push(
      conflicts[0].value === 0 && conflicts[1].value === 0
        ? "No berth conflicts in either plan: both respect berth capacity."
        : `Berth conflicts: ${round(conflicts[0].value, 0)} → ${round(conflicts[1].value, 0)}.`,
    );

  const fifo = opt?.baseline_objectives?.fifo;
  if (opt && opt.objective_value !== null && fifo !== null && fifo !== undefined) {
    const gap = pct(fifo, opt.objective_value);
    lines.push(
      Math.abs(gap) < 0.05
        ? "With the same staffing, the solver’s schedule scores the same as first-come-first-served: the gain comes from capacity, not from re-sequencing."
        : `With the same staffing, the solver’s schedule scores ${round(Math.abs(gap), 1)}% ${
            gap < 0 ? "lower (better)" : "higher (worse)"
          } than first-come-first-served.`,
    );
  }

  const tone = !waiting || Math.abs(waiting.change) < 1 ? "neutral" : waiting.change < 0 ? "better" : "worse";
  const headline =
    tone === "better"
      ? staffed && staffed[1].value > staffed[0].value
        ? "Shorter waits — paid for in reviewer hours."
        : "Shorter waits for the same resources."
      : tone === "worse"
        ? "This plan makes ships wait longer."
        : "No meaningful change in waiting.";
  return { tone, headline, waiting, lines };
}

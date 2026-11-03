// Beats for the guided investigation, found in the data rather than written
// in: the busiest moment at anchor, and the ship whose wait best shows why.
import type { Operations } from "./operations";
import { vesselState } from "./operations";
import { journey, occupancy } from "./journey";

const HOUR = 3_600_000;

export type WaitingMoment = { time: number; anchored: string[]; idle: number; berths: number };

/** The replay hour with the most ships at anchor (ties: more idle berths, then earlier). */
export function waitingMoment(data: Operations): WaitingMoment | null {
  const start = Date.parse(data.clock_start);
  const end = Date.parse(data.clock_end);
  const busy = occupancy(data);
  let best: WaitingMoment | null = null;
  for (let t = start; t <= end; t += HOUR) {
    const anchored = data.vessels
      .filter((v) => vesselState(v, t, data.occupancy_assumption_minutes).phase === "At anchor")
      .map((v) => v.case_id);
    const used = data.berths.filter((b) => (busy.get(b.id) ?? []).some(([s, e]) => s <= t && t < e)).length;
    const moment = { time: t, anchored, idle: data.berths.length - used, berths: data.berths.length };
    if (
      !best ||
      anchored.length > best.anchored.length ||
      (anchored.length === best.anchored.length && moment.idle > best.idle)
    )
      best = moment;
  }
  return best && best.anchored.length ? best : null;
}

/**
 * The call that best explains the pattern: documents returned at least once,
 * and the longest anchorage wait while a compatible berth stood idle.
 */
export function protagonist(data: Operations) {
  const end = Date.parse(data.clock_end);
  let best: { id: string; score: number; at: number } | null = null;
  for (const v of data.vessels) {
    const j = journey(v, data, end);
    if (!j.berthed || !j.rejections || j.anchorHours === null) continue;
    const score = j.anchorHours * (j.idleBerthShare ?? 0);
    if (!best || score > best.score) best = { id: v.case_id, score, at: j.to };
  }
  return best;
}

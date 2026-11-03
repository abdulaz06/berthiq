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

type Discovery = {
  nodes: { activity: string; frequency: number }[];
  bottlenecks: {
    activity: string;
    metric: string;
    value: { value: number; unit: string };
    evidence: { notes: string[] };
  }[];
};
type RiskBoard = { cases: { case_id: string; miss_probability: number }[]; model_version: string };

/**
 * Everything the public landing page quotes, computed from the reference
 * dataset's operations, risk board and discovery output. Committed as
 * lib/fixtures/landing_story.json so the landing page never needs the API.
 */
export function landingSnapshot(data: Operations, risk: RiskBoard, discovery: Discovery) {
  const hero = protagonist(data);
  const vessel = data.vessels.find((v) => v.case_id === hero?.id);
  const j = vessel && hero ? journey(vessel, data, hero.at) : null;
  const moment = waitingMoment(data);
  const top = discovery.bottlenecks[0];
  const rework = discovery.bottlenecks.find((b) => b.metric === "rework_rate");
  const sorted = [...risk.cases].sort((a, b) => b.miss_probability - a.miss_probability);
  return {
    source: {
      dataset_id: data.dataset_id,
      replay: [data.clock_start, data.clock_end],
      note: "Regenerate with BERTHIQ_SNAPSHOT_API=http://localhost:8000 npx vitest run scripts/story-snapshot.test.mjs",
    },
    hero:
      vessel && j
        ? {
            id: vessel.case_id,
            vessel_type: vessel.vessel_type,
            loa: vessel.loa,
            berth: j.ship.length ? callBerth(vessel, data) : null,
            from: j.from,
            to: j.to,
            desk: j.desk.map(({ kind, start, end }) => ({ kind, start, end })),
            ship: j.ship.map(({ kind, start, end }) => ({ kind, start, end })),
            anchor_hours: j.anchorHours,
            rejections: j.rejections,
            queue_hours: j.queueHours,
            idle_berth_share: j.idleBerthShare,
            headline: j.headline,
            detail: j.detail,
          }
        : null,
    moment: moment
      ? { time: moment.time, anchored: moment.anchored.length, idle: moment.idle, berths: moment.berths }
      : null,
    discovery: {
      steps: discovery.nodes.reduce((n, x) => n + x.frequency, 0),
      bottleneck: top?.activity ?? null,
      mean_wait_hours: top?.value.value ?? null,
      notes: top?.evidence.notes ?? [],
      rework_activity: rework?.activity ?? null,
      rework_percent: rework?.value.value ?? null,
    },
    risk: {
      model_version: risk.model_version,
      open: risk.cases.length,
      likely_late: risk.cases.filter((c) => c.miss_probability > 0.66).length,
      top: sorted[0] ? { id: sorted[0].case_id, probability: sorted[0].miss_probability } : null,
    },
  };
}

function callBerth(vessel: Operations["vessels"][number], data: Operations) {
  return [...vessel.events].reverse().find((e) => e.activity === "Berth assigned")?.resource ?? data.berths[0]?.id ?? null;
}

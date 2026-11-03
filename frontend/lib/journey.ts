// "Why is this ship waiting?" — a call's observed journey on two lanes: the
// paperwork at the desk and the ship on the water. Everything here is derived
// from recorded events at the replay clock (observed provenance); the sentence
// is a template over those facts, never generated prose.
import type { Berth, Operations, Vessel } from "./operations";
import { callTimes } from "./motion";

export type DeskKind = "documents" | "check" | "queue" | "review" | "rejected" | "planning" | "other";
export type ShipKind = "anchor" | "pilotage" | "alongside";
export type Segment<K> = { kind: K; start: number; end: number; label: string; resource?: string | null };

export type Journey = {
  id: string;
  /** Timeline bounds: the request to the berth, or to the replay clock. */
  from: number;
  to: number;
  desk: Segment<DeskKind>[];
  ship: Segment<ShipKind>[];
  reviews: number;
  rejections: number;
  /** Hours documents sat complete, waiting for a reviewer to pick them up. */
  queueHours: number;
  /** Hours at anchor up to the clock, if the ship has arrived. */
  anchorHours: number | null;
  stillAtAnchor: boolean;
  berthed: boolean;
  /** Share of the anchorage wait with at least one compatible berth idle. */
  idleBerthShare: number | null;
  /** Hours between the request and the clock (or berthing). */
  elapsedHours: number;
  headline: string;
  detail: string[];
};

const HOUR = 3_600_000;
const DESK: Record<string, DeskKind> = {
  "Documents submitted": "documents",
  "Completeness check": "check",
  "Authority review": "review",
  "Arrival plan confirmed": "planning",
  "Berth planning": "planning",
};
const SHIP_EVENTS = new Set([
  "Port call request submitted",
  "Berth assigned",
  "Vessel arrives / anchorage wait",
  "Berthed, cargo start",
]);

/** The solver's own rule (backend planning.compatible), mirrored for explanation. */
export function compatible(vessel: Pick<Vessel, "vessel_type" | "loa" | "draft">, berth: Berth) {
  const terminal: Record<string, string> = {
    container: "container",
    bulk: "bulk",
    tanker: "bulk",
    general: "general",
    roro: "general",
  };
  return (
    terminal[vessel.vessel_type] === berth.terminal_type &&
    (vessel.loa ?? 0) <= berth.length_m &&
    (vessel.draft ?? 0) <= berth.draft_m
  );
}

/** Berth occupancy intervals recorded in this replay (cargo start + assumption). */
export function occupancy(data: Operations) {
  const busy = new Map<string, [number, number][]>();
  for (const v of data.vessels) {
    const t = callTimes(v, data.occupancy_assumption_minutes);
    if (t.berthed === null || t.depart === null || !t.berth) continue;
    busy.set(t.berth, [...(busy.get(t.berth) ?? []), [t.berthed, t.depart]]);
  }
  return busy;
}

/** Fraction of [a, b) during which at least one of `berths` was idle. */
export function idleShare(
  berths: Berth[],
  busy: Map<string, [number, number][]>,
  a: number,
  b: number,
  exclude?: string,
) {
  if (b <= a || !berths.length) return null;
  const step = Math.max((b - a) / 240, 60_000);
  let idle = 0;
  let n = 0;
  for (let t = a; t < b; t += step, n++) {
    const free = berths.some(
      (berth) =>
        !(busy.get(berth.id) ?? []).some(
          ([s, e], i) => !(exclude === `${berth.id}#${i}`) && s <= t && t < e,
        ),
    );
    if (free) idle++;
  }
  return n ? idle / n : null;
}

const hours = (ms: number) => Math.round(ms / HOUR);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function journey(vessel: Vessel, data: Operations, clock: number): Journey {
  const seen = vessel.events.filter((e) => Date.parse(e.end) <= clock);
  const t = callTimes(vessel, data.occupancy_assumption_minutes);
  const from = seen.length ? Date.parse(seen[0].start ?? seen[0].end) : clock;
  const berthed = t.berthed !== null && t.berthed <= clock;
  const to = berthed ? t.berthed! : clock;

  const desk: Segment<DeskKind>[] = seen
    .filter((e) => !SHIP_EVENTS.has(e.activity))
    .map((e) => {
      const kind = DESK[e.activity] ?? "other";
      return {
        kind: kind === "review" && e.status === "rejected" ? "rejected" : kind,
        start: Date.parse(e.start ?? e.end),
        end: Date.parse(e.end),
        label: e.activity,
        resource: e.resource,
      };
    });
  // Gaps before a review starts are time in the reviewers' queue.
  const queued: Segment<DeskKind>[] = [];
  for (let i = 1; i < desk.length; i++) {
    const gap = desk[i].start - desk[i - 1].end;
    if ((desk[i].kind === "review" || desk[i].kind === "rejected") && gap > 30 * 60_000)
      queued.push({ kind: "queue", start: desk[i - 1].end, end: desk[i].start, label: "Waiting for a reviewer" });
  }
  desk.push(...queued);
  desk.sort((a, b) => a.start - b.start);
  const queueMs = queued.reduce((sum, q) => sum + q.end - q.start, 0);
  const reviews = seen.filter((e) => e.activity === "Authority review");
  const rejections = reviews.filter((e) => e.status === "rejected").length;

  // The ship lane: the arrival event is visible from its start (the ship is there).
  const ship: Segment<ShipKind>[] = [];
  const arrived = t.arrive !== null && t.arrive <= clock;
  const released = t.release !== null && t.release <= clock && t.berthed !== null;
  if (arrived) {
    const anchorEnd = released ? t.release! : clock;
    ship.push({ kind: "anchor", start: t.arrive!, end: anchorEnd, label: "At anchor" });
    if (released)
      ship.push({ kind: "pilotage", start: t.release!, end: Math.min(t.berthed!, clock), label: "Pilot to berth" });
    if (berthed) ship.push({ kind: "alongside", start: t.berthed!, end: t.berthed!, label: "Berthed, cargo start" });
  }
  const anchorMs = arrived ? (released ? t.release! : clock) - t.arrive! : null;
  const stillAtAnchor = arrived && !released;

  const options = data.berths.filter((b) => compatible(vessel, b));
  const busy = occupancy(data);
  const idleBerthShare =
    arrived && anchorMs !== null && anchorMs > HOUR
      ? idleShare(options, busy, t.arrive!, t.arrive! + anchorMs)
      : null;

  const id = vessel.case_id;
  const stage = seen.at(-1)?.activity;
  let headline: string;
  if (!seen.length) headline = `${id} has not requested a port call yet at this point in the replay.`;
  else if (berthed)
    headline =
      anchorMs !== null && anchorMs >= 2 * HOUR
        ? `${id} waited ${plural(hours(anchorMs), "hour")} at anchor before berthing at ${t.berth}.`
        : `${id} berthed at ${t.berth} without a long anchorage wait.`;
  else if (stillAtAnchor)
    headline = `${id} has been at anchor for ${plural(hours(anchorMs!), "hour")}${
      rejections ? ", waiting on its paperwork." : "."
    }`;
  else if (released) headline = `${id} is under pilotage to ${t.berth}.`;
  else headline = `${id} has not arrived yet. Its paperwork is at “${stage}”.`;

  const detail: string[] = [];
  if (rejections)
    detail.push(
      `Authority review returned its documents ${rejections === 1 ? "once" : `${rejections} times`}${
        reviews.length > rejections ? " before approving them" : ""
      }.`,
    );
  else if (reviews.length) detail.push("Authority review approved its documents first time.");
  if (queueMs >= HOUR)
    detail.push(`Its complete documents sat ${plural(hours(queueMs), "hour")} in the reviewers’ queue.`);
  if (idleBerthShare !== null && options.length)
    detail.push(
      idleBerthShare >= 0.75
        ? `A compatible berth stood idle for ${Math.round(idleBerthShare * 100)}% of that wait — the berths were not the constraint.`
        : idleBerthShare >= 0.25
          ? `A compatible berth was idle for ${Math.round(idleBerthShare * 100)}% of that wait.`
          : `Compatible berths were busy for ${Math.round((1 - idleBerthShare) * 100)}% of that wait.`,
    );
  if (!options.length && seen.length)
    detail.push(`No configured berth fits a ${vessel.loa ?? "?"} m ${vessel.vessel_type} vessel.`);

  return {
    id,
    from,
    to: Math.max(to, from + HOUR),
    desk,
    ship,
    reviews: reviews.length,
    rejections,
    queueHours: queueMs / HOUR,
    anchorHours: anchorMs === null ? null : anchorMs / HOUR,
    stillAtAnchor,
    berthed,
    idleBerthShare,
    elapsedHours: (to - from) / HOUR,
    headline,
    detail,
  };
}

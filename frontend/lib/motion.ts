// Replay motion derived from the event log. Timing is data: a ship appears at
// the anchorage when its arrival event starts, is piloted in over the recorded
// interval between anchorage release and "Berthed, cargo start", and leaves
// after the disclosed occupancy assumption. Paths are illustrative (harbor.ts).
import type { components } from "./types/api";
import type { Berth, Vessel } from "./operations";
import {
  anchorageSlot,
  approachTo,
  berthSpot,
  harbor,
  quayHeading,
  route,
  type LngLat,
} from "./harbor";

type Assignment = components["schemas"]["Assignment"];

export type MotionPhase =
  | "Inbound"
  | "Approaching"
  | "At anchor"
  | "Pilotage"
  | "At berth"
  | "Departing"
  | "Departed";

export type Pose = {
  phase: MotionPhase;
  visible: boolean;
  lngLat: LngLat;
  heading: number;
  /** 0–1, for fading ships in over the horizon and out again. */
  opacity: number;
  berth: string | null;
};

/** Minutes of illustrative transit that bracket the recorded events. */
export const APPROACH_MIN = 75;
export const DEPART_MIN = 75;
const DEFAULT_PILOTAGE_MIN = 120;
const MIN = 60_000;

const ARRIVAL = "Vessel arrives / anchorage wait";
const BERTHED = "Berthed, cargo start";

export type CallTimes = {
  /** Anchorage arrival (recorded start of the arrival event). */
  arrive: number | null;
  /** Released from anchorage to proceed (recorded end of the arrival event). */
  release: number | null;
  berthed: number | null;
  /** End of the disclosed occupancy assumption after cargo start. */
  depart: number | null;
  berth: string | null;
};

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

export function callTimes(vessel: Vessel, occupancyMinutes: number): CallTimes {
  const arrival = vessel.events.find((e) => e.activity === ARRIVAL);
  const berthedEvent = vessel.events.find((e) => e.activity === BERTHED);
  const assigned = [...vessel.events]
    .reverse()
    .find((e) => e.activity === "Berth assigned");
  const berthed = berthedEvent ? ms(berthedEvent.end) : NaN;
  let arrive = arrival ? ms(arrival.start ?? arrival.end) : NaN;
  let release = arrival ? ms(arrival.end) : NaN;
  // Uploaded logs may omit the arrival event: assume a short default approach.
  // It never weighs anchor before the call's own earlier events.
  if (Number.isNaN(release) && !Number.isNaN(berthed)) {
    const before = vessel.events.map((e) => ms(e.end)).filter((v) => v < berthed);
    release = Math.max(berthed - DEFAULT_PILOTAGE_MIN * MIN, ...before);
  }
  if (Number.isNaN(arrive) && !Number.isNaN(release)) arrive = release;
  const num = (v: number) => (Number.isNaN(v) ? null : v);
  return {
    arrive: num(arrive),
    release: num(release),
    berthed: num(berthed),
    depart: Number.isNaN(berthed) ? null : berthed + occupancyMinutes * MIN,
    berth: assigned?.resource ?? vessel.berth ?? null,
  };
}

export type MotionContext = {
  berths: Berth[];
  /** Stable anchorage slot for each call. */
  slots: Map<string, LngLat>;
};

export function motionContext(vessels: { case_id: string }[], berths: Berth[]): MotionContext {
  const ids = [...vessels.map((v) => v.case_id)].sort();
  return {
    berths,
    slots: new Map(ids.map((id, i) => [id, anchorageSlot(i, ids.length)])),
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const progress = (clock: number, a: number, b: number) =>
  b > a ? smooth(Math.min(Math.max((clock - a) / (b - a), 0), 1)) : 1;

function anchorHeading(id: string) {
  // A few degrees of swing per ship so the anchorage doesn't look drilled.
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997;
  return harbor.anchorHeading + ((h % 15) - 7);
}

/** Pose from milestone times; shared by observed replay and plan replay. */
export function poseFromTimes(
  id: string,
  t: CallTimes,
  clock: number,
  ctx: MotionContext,
): Pose {
  const slot = ctx.slots.get(id) ?? harbor.anchorage.center;
  const berth = ctx.berths.find((b) => b.id === t.berth) ?? null;
  const hidden = (phase: MotionPhase): Pose => ({
    phase,
    visible: false,
    lngLat: slot,
    heading: harbor.anchorHeading,
    opacity: 0,
    berth: null,
  });
  if (t.arrive === null || clock < t.arrive - APPROACH_MIN * MIN) return hidden("Inbound");
  if (clock < t.arrive) {
    const f = progress(clock, t.arrive - APPROACH_MIN * MIN, t.arrive);
    const p = route([harbor.sea, slot], 0).at(f);
    return { phase: "Approaching", visible: true, ...p, opacity: Math.min(1, f * 3), berth: null };
  }
  const anchored: Pose = {
    phase: "At anchor",
    visible: true,
    lngLat: slot,
    heading: anchorHeading(id),
    opacity: 1,
    berth: null,
  };
  if (t.release === null || clock < t.release || !berth || t.berthed === null) return anchored;
  const approach = approachTo(berth, ctx.berths);
  const spot = berthSpot(berth, ctx.berths);
  if (clock < t.berthed) {
    const p = route([slot, ...approach]).at(progress(clock, t.release, t.berthed));
    return { phase: "Pilotage", visible: true, ...p, opacity: 1, berth: berth.id };
  }
  const depart = t.depart ?? Infinity;
  if (clock < depart)
    return {
      phase: "At berth",
      visible: true,
      lngLat: spot,
      heading: quayHeading(berth, ctx.berths),
      opacity: 1,
      berth: berth.id,
    };
  if (clock < depart + DEPART_MIN * MIN) {
    const f = progress(clock, depart, depart + DEPART_MIN * MIN);
    const p = route([...approach].reverse().concat([harbor.sea])).at(f);
    return { phase: "Departing", visible: true, ...p, opacity: Math.min(1, (1 - f) * 3), berth: berth.id };
  }
  return { ...hidden("Departed"), berth: berth.id };
}

export function observedPose(
  vessel: Vessel,
  clock: number,
  occupancyMinutes: number,
  ctx: MotionContext,
): Pose {
  return poseFromTimes(vessel.case_id, callTimes(vessel, occupancyMinutes), clock, ctx);
}

/**
 * Plan replay: the proposed reservation is the time alongside. The ship waits
 * at anchor until a default pilotage interval before it, then berths.
 */
export function plannedPose(
  assignment: Assignment,
  clock: number,
  start: number,
  ctx: MotionContext,
): Pose {
  const berthed = Date.parse(assignment.start);
  const end = Date.parse(assignment.end ?? assignment.start);
  return poseFromTimes(
    assignment.vessel,
    {
      arrive: start,
      release: berthed - DEFAULT_PILOTAGE_MIN * MIN,
      berthed,
      depart: end,
      berth: assignment.berth,
    },
    clock,
    ctx,
  );
}

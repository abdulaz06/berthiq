import type { components } from "./types/api";
import { APPROACH_MIN, callTimes } from "./motion";

export type Operations = components["schemas"]["PortOperations"];
export type Vessel = components["schemas"]["OperationalVessel"];
export type Berth = components["schemas"]["OperationalBerth"];
export type Risk = components["schemas"]["RiskBoard"];

export type CallPhase =
  | "Not requested"
  | "Awaiting clearance"
  | "Approaching"
  | "At anchor"
  | "Pilotage"
  | "At berth"
  | "Departed";

/** A call's state at the replay clock. Workflow facts come only from events ended by then. */
export function vesselState(vessel: Vessel, clock: number, occupancyMinutes: number) {
  const seen = vessel.events.filter(e => Date.parse(e.end) <= clock);
  const last = seen.at(-1);
  const assignment = [...seen].reverse().find(e => e.activity === "Berth assigned");
  const t = callTimes(vessel, occupancyMinutes);
  const phase: CallPhase = !last && (t.arrive === null || clock < t.arrive) ? "Not requested"
    : t.arrive === null || clock < t.arrive - APPROACH_MIN * 60_000 ? "Awaiting clearance"
    : clock < t.arrive ? "Approaching"
    : t.release === null || t.berthed === null || clock < t.release ? "At anchor"
    : clock < t.berthed ? "Pilotage"
    : t.depart === null || clock < t.depart ? "At berth"
    : "Departed";
  return { phase, stage: last?.activity ?? "Awaiting first event", berth: assignment?.resource ?? null, seen };
}

export function portTime(instant: string | number) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(new Date(instant));
}

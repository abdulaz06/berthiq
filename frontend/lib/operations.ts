import type { components } from "./types/api";

export type Operations = components["schemas"]["PortOperations"];
export type Vessel = components["schemas"]["OperationalVessel"];
export type Berth = components["schemas"]["OperationalBerth"];
export type Risk = components["schemas"]["RiskBoard"];

export function vesselState(vessel: Vessel, clock: number, occupancyMinutes: number) {
  const seen = vessel.events.filter(e => Date.parse(e.end) <= clock);
  const last = seen.at(-1);
  const berthed = seen.find(e => e.activity === "Berthed, cargo start");
  const assignment = seen.find(e => e.activity === "Berth assigned");
  const phase = !last ? "Expected" : berthed
    ? clock > Date.parse(berthed.end) + occupancyMinutes * 60_000 ? "Released" : "At berth"
    : seen.some(e => e.activity === "Vessel arrives / anchorage wait") ? "Anchorage"
    : "In process";
  return { phase, stage: last?.activity ?? "Awaiting first event", berth: assignment?.resource ?? null, seen };
}

export function position(vessel: Vessel, index: number, data: Operations, clock: number): [number, number] {
  const state = vesselState(vessel, clock, data.occupancy_assumption_minutes);
  const berth = data.berths.find(b => b.id === state.berth);
  const anchorage: [number, number] = [54.617 + (index % 7) * .0032, 24.819 - Math.floor(index / 7) * .0033];
  if (!berth || !["At berth", "Released"].includes(state.phase)) return anchorage;
  return [berth.longitude - .0007, berth.latitude + .0005];
}

export function portTime(instant: string | number) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(new Date(instant));
}

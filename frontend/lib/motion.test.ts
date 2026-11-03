import { describe, expect, it } from "vitest";
import { callTimes, motionContext, observedPose, plannedPose, APPROACH_MIN } from "./motion";
import { berthSpot, route, toMeters } from "./harbor";
import type { Berth, Vessel } from "./operations";

const berths: Berth[] = [
  { id: "KCT-1", name: "C1", terminal_type: "container", length_m: 400, draft_m: 18, longitude: 54.63923, latitude: 24.80321 },
  { id: "KCT-2", name: "C2", terminal_type: "container", length_m: 400, draft_m: 18, longitude: 54.64093, latitude: 24.80123 },
  { id: "KBT-1", name: "B1", terminal_type: "bulk", length_m: 300, draft_m: 14, longitude: 54.6506, latitude: 24.79232 },
  { id: "KGT-1", name: "G1", terminal_type: "general", length_m: 250, draft_m: 12, longitude: 54.65402, latitude: 24.79211 },
];
const h = (hours: number) => new Date(Date.UTC(2026, 6, 28) + hours * 3_600_000).toISOString();
const t = (hours: number) => Date.parse(h(hours));
const event = (activity: string, start: number, end: number, resource: string | null = null) => ({
  case_id: "C-1", activity, start: h(start), end: h(end), resource, status: "completed",
});
const vessel: Vessel = {
  case_id: "C-1", vessel_type: "container", loa: 300, draft: 12, berth: "KCT-2",
  service_window_start: null, service_window_end: null,
  events: [
    event("Port call request submitted", 0, 0),
    event("Authority review", 2, 5, "reviewer_a"),
    event("Berth assigned", 30, 30, "KCT-2"),
    event("Vessel arrives / anchorage wait", 10, 30),
    event("Berthed, cargo start", 33, 33, "pilot"),
  ],
};
const ctx = motionContext([vessel], berths);
const meters = (a: [number, number], b: [number, number]) => {
  const [ax, ay] = toMeters(a);
  const [bx, by] = toMeters(b);
  return Math.hypot(ax - bx, ay - by);
};

describe("event-timed replay motion", () => {
  it("reads milestones from the recorded events", () => {
    expect(callTimes(vessel, 420)).toEqual({
      arrive: t(10), release: t(30), berthed: t(33), depart: t(33) + 420 * 60_000, berth: "KCT-2",
    });
  });
  it("shows no position before the ship is recorded arriving", () => {
    const pose = observedPose(vessel, t(5), 420, ctx);
    expect(pose.phase).toBe("Inbound");
    expect(pose.visible).toBe(false);
  });
  it("approaches over the horizon, then waits at a fixed anchorage slot", () => {
    const approach = observedPose(vessel, t(10) - (APPROACH_MIN / 2) * 60_000, 420, ctx);
    expect(approach.phase).toBe("Approaching");
    expect(approach.opacity).toBeGreaterThan(0);
    const early = observedPose(vessel, t(12), 420, ctx);
    const late = observedPose(vessel, t(29), 420, ctx);
    expect(early.phase).toBe("At anchor");
    expect(early.lngLat).toEqual(late.lngLat);
  });
  it("moves continuously during pilotage — never a jump", () => {
    const steps = Array.from({ length: 181 }, (_, i) => observedPose(vessel, t(30) + i * 60_000, 420, ctx));
    expect(steps.slice(1, -1).every((p) => p.phase === "Pilotage")).toBe(true);
    const maxStep = Math.max(...steps.slice(1).map((p, i) => meters(p.lngLat, steps[i].lngLat)));
    const total = route(steps.map((p) => p.lngLat), 0).total;
    expect(maxStep).toBeLessThan(total / 40);
  });
  it("berths at the assigned berth, then departs after the occupancy assumption", () => {
    const alongside = observedPose(vessel, t(34), 420, ctx);
    expect(alongside.phase).toBe("At berth");
    expect(meters(alongside.lngLat, berthSpot(berths[1], berths))).toBeLessThan(1);
    expect(observedPose(vessel, t(33) + 421 * 60_000, 420, ctx).phase).toBe("Departing");
    expect(observedPose(vessel, t(50), 420, ctx).visible).toBe(false);
  });
  it("is deterministic for the same inputs", () => {
    expect(observedPose(vessel, t(31), 420, ctx)).toEqual(observedPose(vessel, t(31), 420, motionContext([vessel], berths)));
  });
  it("replays a proposed reservation at its planned berth", () => {
    const pose = plannedPose({ vessel: "C-1", berth: "KGT-1", start: h(40), end: h(45), reviewer: null } as never, t(41), t(30), ctx);
    expect(pose.phase).toBe("At berth");
    expect(pose.berth).toBe("KGT-1");
  });
});

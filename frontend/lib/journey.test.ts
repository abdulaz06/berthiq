import { describe, expect, it } from "vitest";
import { compatible, idleShare, journey } from "./journey";
import { protagonist, waitingMoment } from "./story";
import type { Berth, Operations, Vessel } from "./operations";

const h = (hours: number) => new Date(Date.UTC(2026, 6, 28) + hours * 3_600_000).toISOString();
const berth = (id: string, terminal_type: string, length_m = 400, draft_m = 18): Berth => ({
  id, name: id, terminal_type, length_m, draft_m, longitude: 54.64, latitude: 24.8,
});
const ev = (case_id: string, activity: string, start: number, end: number, status = "completed", resource: string | null = null) => ({
  case_id, activity, start: h(start), end: h(end), resource, status,
});
const waiting: Vessel = {
  case_id: "W-1", vessel_type: "container", loa: 300, draft: 12, berth: "KCT-1",
  service_window_start: null, service_window_end: null,
  events: [
    ev("W-1", "Port call request submitted", 0, 0),
    ev("W-1", "Documents submitted", 0, 2),
    ev("W-1", "Completeness check", 2, 3),
    ev("W-1", "Authority review", 8, 10, "rejected", "reviewer_a"),
    ev("W-1", "Documents submitted", 10, 12),
    ev("W-1", "Completeness check", 12, 13),
    ev("W-1", "Authority review", 13, 15, "completed", "reviewer_b"),
    ev("W-1", "Berth assigned", 16, 16, "completed", "KCT-1"),
    ev("W-1", "Vessel arrives / anchorage wait", 4, 16),
    ev("W-1", "Berthed, cargo start", 18, 18, "completed", "pilot"),
  ],
};
const data: Operations = {
  dataset_id: "d", port_name: "Test", clock_start: h(0), clock_end: h(30),
  berths: [berth("KCT-1", "container"), berth("KBT-1", "bulk", 300, 14)],
  vessels: [waiting], metrics: {}, geography_disclosure: "", operations_disclosure: "",
  occupancy_assumption_minutes: 420,
} as unknown as Operations;

describe("why a call waited", () => {
  it("splits the paperwork from the ship and finds the review queue", () => {
    const j = journey(waiting, data, Date.parse(h(30)));
    expect(j.rejections).toBe(1);
    expect(j.reviews).toBe(2);
    expect(j.desk.filter((s) => s.kind === "queue")).toHaveLength(1);
    expect(j.queueHours).toBeCloseTo(5);
    expect(j.anchorHours).toBeCloseTo(12);
    expect(j.ship.map((s) => s.kind)).toEqual(["anchor", "pilotage", "alongside"]);
    expect(j.idleBerthShare).toBe(1);
    expect(j.headline).toBe("W-1 waited 12 hours at anchor before berthing at KCT-1.");
    expect(j.detail.join(" ")).toContain("returned its documents once before approving them");
    expect(j.detail.join(" ")).toContain("the berths were not the constraint");
  });
  it("never reads past the replay clock", () => {
    const j = journey(waiting, data, Date.parse(h(9)));
    expect(j.rejections).toBe(0);
    expect(j.stillAtAnchor).toBe(true);
    expect(j.anchorHours).toBeCloseTo(5);
    expect(j.headline).toBe("W-1 has been at anchor for 5 hours.");
  });
  it("mirrors the solver's berth compatibility rule", () => {
    expect(compatible({ vessel_type: "tanker", loa: 200, draft: 10 }, berth("KBT-1", "bulk", 300, 14))).toBe(true);
    expect(compatible({ vessel_type: "container", loa: 401, draft: 10 }, berth("KCT-1", "container"))).toBe(false);
    expect(compatible({ vessel_type: "roro", loa: 200, draft: 15 }, berth("KGT-1", "general", 250, 12))).toBe(false);
  });
  it("measures idle berth time over an interval", () => {
    const busy = new Map([["KCT-1", [[Date.parse(h(0)), Date.parse(h(5))] as [number, number]]]]);
    expect(idleShare([data.berths[0]], busy, Date.parse(h(0)), Date.parse(h(10)))).toBeCloseTo(0.5, 1);
  });
});

describe("story beats come from the data", () => {
  it("finds the busiest anchorage moment and the explanatory ship", () => {
    const moment = waitingMoment(data)!;
    expect(moment.anchored).toEqual(["W-1"]);
    expect(moment.idle).toBe(2);
    expect(protagonist(data)?.id).toBe("W-1");
  });
});

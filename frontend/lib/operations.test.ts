import { describe, expect, it } from "vitest";
import { vesselState, type Vessel } from "./operations";

const start = Date.parse("2026-07-30T00:00:00Z");
const vessel: Vessel = {
  case_id: "CALL-1", vessel_type: "container", loa: 250, draft: 12, berth: "KCT-1",
  service_window_start: null, service_window_end: null,
  events: [
    { case_id: "CALL-1", activity: "Port call request submitted", start: null, end: new Date(start).toISOString(), resource: null, status: "completed" },
    { case_id: "CALL-1", activity: "Berth assigned", start: null, end: new Date(start+60_000).toISOString(), resource: "KCT-1", status: "completed" },
    { case_id: "CALL-1", activity: "Berthed, cargo start", start: null, end: new Date(start+120_000).toISOString(), resource: "pilot", status: "completed" },
  ],
};
describe("observed event playback", () => {
  it("does not reveal a future berth or workflow stage", () => {
    expect(vesselState(vessel,start-1,420).phase).toBe("Expected");
    expect(vesselState(vessel,start,420).berth).toBeNull();
    expect(vesselState(vessel,start,420).seen).toHaveLength(1);
  });
  it("occupies and releases berths using the disclosed duration", () => {
    expect(vesselState(vessel,start+120_000,420).phase).toBe("At berth");
    expect(vesselState(vessel,start+423*60_000,420).phase).toBe("Released");
    expect(vesselState(vessel,start+60_000,420).berth).toBe("KCT-1");
  });
});

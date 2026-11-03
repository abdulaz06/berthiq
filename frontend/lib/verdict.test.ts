import { describe, expect, it } from "vitest";
import simulation from "./fixtures/simulation_result.example.json";
import optimization from "./fixtures/optimization_result.example.json";
import { verdict } from "./verdict";
import type { OptimizationResult, SimulationResult } from "./api/contracts";

const sim = simulation as unknown as SimulationResult;
const opt = optimization as unknown as OptimizationResult;

describe("scenario verdict", () => {
  it("states the gain and the cost from the simulator's own numbers", () => {
    const v = verdict(sim, opt);
    expect(v.tone).toBe("better");
    expect(v.headline).toMatch(/reviewer hours/);
    expect(v.waiting?.before).toBe(sim.headline.avg_waiting_time[0].value);
    expect(v.lines[0]).toBe("Average wait per open call: 62.9 h → 45.1 h (-28%).");
    expect(v.lines.some((l) => l.startsWith("Reviewer time staffed: 252 h → 420 h (+168 h)"))).toBe(true);
  });
  it("does not dress up an unchanged on-time rate or a tie with FIFO", () => {
    const lines = verdict(sim, opt).lines.join(" ");
    expect(lines).toContain("0% → 0%");
    expect(lines).toContain("the gain comes from capacity, not from re-sequencing");
  });
  it("reports a worse plan as worse", () => {
    const worse = structuredClone(sim);
    worse.headline.avg_waiting_time[1].value = 80;
    expect(verdict(worse, null).tone).toBe("worse");
  });
});

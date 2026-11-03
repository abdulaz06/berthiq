// @vitest-environment node
// The landing page's numbers, kept honest. With BERTHIQ_SNAPSHOT_API set it
// regenerates lib/fixtures/landing_story.json from a running API; otherwise it
// checks the committed snapshot against the committed reference fixtures.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { landingSnapshot } from "../lib/story";
import { verdict } from "../lib/verdict";

const at = (p) => resolve(process.cwd(), p);
const file = at("lib/fixtures/landing_story.json");
const api = process.env.BERTHIQ_SNAPSHOT_API;

describe("landing story snapshot", () => {
  it.runIf(api)("regenerates from the live reference dataset", async () => {
    const headers = { "X-Demo-Session": crypto.randomUUID() };
    const get = async (path) => (await fetch(`${api}${path}`, { headers })).json();
    const [dataset] = (await get("/api/datasets")).filter((d) => d.source === "builtin");
    await fetch(`${api}/api/datasets/${dataset.id}/discover`, { method: "POST", headers });
    const snapshot = landingSnapshot(
      await get(`/api/datasets/${dataset.id}/operations`),
      await get(`/api/datasets/${dataset.id}/risk`),
      await get(`/api/discovery/${dataset.id}`),
    );
    writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);
  });
  it("tells a story the committed evidence supports", () => {
    const s = JSON.parse(readFileSync(file, "utf8"));
    expect(s.hero.rejections).toBeGreaterThan(0);
    expect(s.hero.anchor_hours).toBeGreaterThan(24);
    expect(s.hero.idle_berth_share).toBeGreaterThan(0.5);
    expect(s.moment.anchored).toBeGreaterThan(s.moment.berths - s.moment.idle);
    expect(s.discovery.bottleneck).toBe("Authority review");
    expect(s.risk.likely_late).toBeLessThanOrEqual(s.risk.open);
  });
  it("quotes the simulator's reference verdict exactly", async () => {
    const sim = JSON.parse(readFileSync(at("lib/fixtures/simulation_result.example.json"), "utf8"));
    const opt = JSON.parse(readFileSync(at("lib/fixtures/optimization_result.example.json"), "utf8"));
    const evaluation = JSON.parse(readFileSync(at("../DOCS/REFERENCE_EVALUATION.json"), "utf8"));
    const v = verdict(sim, opt);
    expect(v.waiting.before).toBeCloseTo(evaluation.simulation.avg_waiting_time[0].value, 6);
    expect(v.waiting.after).toBeCloseTo(evaluation.simulation.avg_waiting_time[1].value, 6);
  });
});

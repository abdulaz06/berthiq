import { describe, expect, it, vi } from "vitest";

import dataQualityReportFixture from "../fixtures/data_quality_report.example.json";
import datasetSummaryFixture from "../fixtures/dataset_summary.example.json";
import demoCapabilitiesFixture from "../fixtures/demo_capabilities.example.json";
import jobStatusFixture from "../fixtures/job_status.example.json";
import optimizationResultFixture from "../fixtures/optimization_result.example.json";
import processModelFixture from "../fixtures/process_model.example.json";
import riskBoardFixture from "../fixtures/risk_board.example.json";
import simulationResultFixture from "../fixtures/simulation_result.example.json";
import type { components } from "../types/api";

import { getDataset, getJob } from "./contracts";

type Schemas = components["schemas"];

/**
 * A JSON import widens literals to their base type (`"builtin"` → `string`) and
 * arrays lose tuple-ness (`[string, string]` → `string[]`). `Widen<T>` applies
 * the same widening to the generated type so a genuine *structural* mismatch
 * (a missing or wrong-shaped field) still fails to compile, while that benign
 * JSON widening does not. If a fixture drifts from its schema, the corresponding
 * `structurallyMatches<…>(…)` call below stops type-checking.
 */
type Widen<T> = T extends readonly (infer U)[]
  ? Widen<U>[]
  : T extends string
    ? string
    : T extends number
      ? number
      : T extends boolean
        ? boolean
        : T extends object
          ? { [K in keyof T]: Widen<T[K]> }
          : T;

/** Compile-time guard: `fixture` must be assignable to (a widened) `T`. */
function structurallyMatches<T>(fixture: T): T {
  return fixture;
}

describe("generated types ↔ committed fixtures", () => {
  it("each fixture is structurally compatible with its generated schema", () => {
    const checks = [
      structurallyMatches<Widen<Schemas["DatasetSummary"]>>(datasetSummaryFixture),
      structurallyMatches<Widen<Schemas["DemoCapabilities"]>>(demoCapabilitiesFixture),
      structurallyMatches<Widen<Schemas["DataQualityReport"]>>(dataQualityReportFixture),
      structurallyMatches<Widen<Schemas["ProcessModel"]>>(processModelFixture),
      structurallyMatches<Widen<Schemas["RiskBoard"]>>(riskBoardFixture),
      structurallyMatches<Widen<Schemas["OptimizationResult"]>>(optimizationResultFixture),
      structurallyMatches<Widen<Schemas["SimulationResult"]>>(simulationResultFixture),
      structurallyMatches<Widen<Schemas["JobStatus"]>>(jobStatusFixture),
    ];
    // Runtime sanity: the checks preserved the fixtures (and thus ran at all).
    expect(checks).toHaveLength(8);
    expect(datasetSummaryFixture.id).toBeTruthy();
    expect(jobStatusFixture.job_type).toBe("optimization");
  });
});

describe("NEXT_PUBLIC_USE_FIXTURES flag", () => {
  it("returns the committed fixture without touching the network when on", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const ds = await getDataset("any-id", { useFixtures: true });
    expect(ds).toEqual(datasetSummaryFixture);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("makes a live call when off — same function, no other change", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(jobStatusFixture), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const job = await getJob("9d1b7c40", { useFixtures: false });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:8000/api/jobs/9d1b7c40",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(job).toEqual(jobStatusFixture);
    fetchSpy.mockRestore();
  });
});

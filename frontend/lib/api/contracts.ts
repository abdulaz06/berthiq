/**
 * Typed accessors for the M1 contract endpoints (docs/DATA_CONTRACTS.md §5).
 *
 * Each returns the committed fixture when NEXT_PUBLIC_USE_FIXTURES is "true" and
 * calls the live backend otherwise — the one-flag seam (§7). Return types come
 * from the generated OpenAPI types (`lib/types/api.ts`), so a contract change
 * shows up here as a type error until the fixtures/usages are updated.
 */

import datasetSummaryFixture from "../fixtures/dataset_summary.example.json";
import dataQualityReportFixture from "../fixtures/data_quality_report.example.json";
import jobStatusFixture from "../fixtures/job_status.example.json";
import optimizationResultFixture from "../fixtures/optimization_result.example.json";
import processModelFixture from "../fixtures/process_model.example.json";
import riskBoardFixture from "../fixtures/risk_board.example.json";
import simulationResultFixture from "../fixtures/simulation_result.example.json";
import type { components } from "../types/api";
import { apiGet, fixturesEnabledByDefault } from "./client";

type Schemas = components["schemas"];

export type DatasetSummary = Schemas["DatasetSummary"];
export type DataQualityReport = Schemas["DataQualityReport"];
export type ProcessModel = Schemas["ProcessModel"];
export type RiskBoard = Schemas["RiskBoard"];
export type OptimizationResult = Schemas["OptimizationResult"];
export type SimulationResult = Schemas["SimulationResult"];
export type JobStatus = Schemas["JobStatus"];
export type KpiValue = Schemas["KpiValue"];

export interface FetchOpts {
  /** Force a mode in tests; defaults to the NEXT_PUBLIC_USE_FIXTURES flag. */
  useFixtures?: boolean;
}

/** Return the committed fixture when in fixtures mode, else GET from the backend. */
async function resource<T>(path: string, fixture: unknown, opts?: FetchOpts): Promise<T> {
  const useFixtures = opts?.useFixtures ?? fixturesEnabledByDefault();
  return useFixtures ? (fixture as T) : apiGet<T>(path);
}

export function getDataset(datasetId: string, opts?: FetchOpts): Promise<DatasetSummary> {
  return resource<DatasetSummary>(`/api/datasets/${datasetId}`, datasetSummaryFixture, opts);
}

export function getValidation(datasetId: string, opts?: FetchOpts): Promise<DataQualityReport> {
  return resource<DataQualityReport>(
    `/api/datasets/${datasetId}/validation`,
    dataQualityReportFixture,
    opts,
  );
}

export function getDiscovery(datasetId: string, opts?: FetchOpts): Promise<ProcessModel> {
  return resource<ProcessModel>(`/api/discovery/${datasetId}`, processModelFixture, opts);
}

export function getRisk(datasetId: string, opts?: FetchOpts): Promise<RiskBoard> {
  return resource<RiskBoard>(`/api/datasets/${datasetId}/risk`, riskBoardFixture, opts);
}

export function getOptimization(runId: string, opts?: FetchOpts): Promise<OptimizationResult> {
  return resource<OptimizationResult>(`/api/optimization/${runId}`, optimizationResultFixture, opts);
}

export function getSimulation(runId: string, opts?: FetchOpts): Promise<SimulationResult> {
  return resource<SimulationResult>(`/api/simulation/${runId}`, simulationResultFixture, opts);
}

export function getJob(jobId: string, opts?: FetchOpts): Promise<JobStatus> {
  return resource<JobStatus>(`/api/jobs/${jobId}`, jobStatusFixture, opts);
}

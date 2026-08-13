import healthFixture from "../fixtures/health.example.json";
import { apiGet, fixturesEnabledByDefault } from "./client";

/** GET /api/health payload — mirrors the backend HealthResponse schema. */
export interface Health {
  status: string;
  version: string;
  app_name: string;
}

/**
 * Fetch backend liveness. Honours NEXT_PUBLIC_USE_FIXTURES by default; pass
 * `{ useFixtures }` to force a mode (used in tests).
 */
export async function getHealth(opts?: { useFixtures?: boolean }): Promise<Health> {
  const useFixtures = opts?.useFixtures ?? fixturesEnabledByDefault();
  if (useFixtures) {
    return healthFixture as Health;
  }
  return apiGet<Health>("/api/health");
}

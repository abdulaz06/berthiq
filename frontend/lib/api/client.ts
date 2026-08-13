/**
 * Base API client. One place decides the backend origin and the fixtures flag,
 * so flipping NEXT_PUBLIC_USE_FIXTURES swaps every call from live to fixture
 * with no other code change (the contracts seam, docs/DATA_CONTRACTS.md §7).
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/** True when the app should render committed fixtures instead of calling the backend. */
export function fixturesEnabledByDefault(): boolean {
  return process.env.NEXT_PUBLIC_USE_FIXTURES === "true";
}

/** GET a JSON resource from the live backend. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

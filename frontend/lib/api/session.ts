import { API_BASE_URL } from "./client";
import type { JobStatus } from "./contracts";

export function demoSession() {
  let token = sessionStorage.getItem("berthiq-session");
  if (!token) {
    token = crypto.randomUUID();
    sessionStorage.setItem("berthiq-session", token);
  }
  return token;
}

export async function sessionRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    cache: "no-store",
    signal,
    headers: {
      "X-Demo-Session": demoSession(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const detail =
      typeof error.detail === "string"
        ? error.detail
        : Array.isArray(error.detail)
          ? error.detail.map((e: { msg: string }) => e.msg).join("; ")
          : `Request failed (${response.status}).`;
    throw new Error(detail);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export async function awaitJob(
  job: JobStatus,
  update: (job: JobStatus) => void,
  signal: AbortSignal,
) {
  const deadline = Date.now() + 120_000;
  while (true) {
    signal.throwIfAborted();
    update(job);
    if (job.status === "succeeded" && job.result_id) return job.result_id;
    if (job.status === "failed")
      throw new Error(
        job.error ?? "The compute job failed. Retry with a new scenario.",
      );
    if (Date.now() >= deadline)
      throw new Error(
        "The server is taking longer than expected. Your saved scenario remains available; inspect it before submitting another run.",
      );
    await new Promise((resolve) => setTimeout(resolve, 700));
    job = await sessionRequest<JobStatus>(
      `/api/jobs/${job.id}`,
      "GET",
      undefined,
      signal,
    );
  }
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { awaitJob, demoSession, sessionRequest } from "./session";
import type { JobStatus } from "./contracts";

const job: JobStatus = {
  id: "job",
  job_type: "optimization",
  status: "running",
  progress: 0,
  result_type: null,
  result_id: null,
  error: null,
};
describe("private decision requests", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it("keeps the private token within the tab and includes it on requests", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    const token = demoSession();
    await sessionRequest("/api/scenarios");
    expect(demoSession()).toBe(token);
    expect(fetch.mock.calls[0][1].headers["X-Demo-Session"]).toBe(token);
  });
  it("surfaces server validation rather than hiding it behind a status code", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              detail: [
                { msg: "At least one objective weight must be positive." },
              ],
            }),
            { status: 422 },
          ),
        ),
    );
    await expect(sessionRequest("/api/scenarios", "POST", {})).rejects.toThrow(
      "At least one objective weight",
    );
  });
  it("polls persisted jobs and returns only a completed result ID", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ ...job, status: "succeeded", result_id: "17" }),
          ),
        ),
    );
    const progress = vi.fn();
    const result = awaitJob(job, progress, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(700);
    expect(await result).toBe("17");
    expect(progress).toHaveBeenCalledTimes(2);
  });
  it("surfaces worker failures and respects cancellation", async () => {
    await expect(
      awaitJob(
        { ...job, status: "failed", error: "Invalid berth lock." },
        vi.fn(),
        new AbortController().signal,
      ),
    ).rejects.toThrow("Invalid berth lock.");
    const controller = new AbortController();
    controller.abort();
    await expect(awaitJob(job, vi.fn(), controller.signal)).rejects.toThrow();
  });
});

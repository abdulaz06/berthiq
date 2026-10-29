# Decision engine implementation

The launch implementation preserves FastAPI/SQLAlchemy/PostgreSQL, the deterministic
generator, PM4Py discovery and the committed HGB risk model. New services are
`ingestion`, `planning`, `optimization`, `simulation` and `jobs`.

## Observable snapshot

Scenarios read canonical events through the dataset cutoff. Active case summary
fields are deliberately not read because the original generator computed some
summaries before truncating future events. Unknown future service times and arrival
estimates use the configured means, disclosed in every result. Completed calls
reserve assumed occupancy for the configured mean after observed cargo start.

## Scheduling

CP-SAT jointly chooses non-preemptive reviews within reviewer shifts, compatible
berths, approach starts and berth release times. Reviewer caps constrain total
work per shift; caps above 720 minutes allow a review already started during a
shift to finish in overtime (up to 900 minutes). No new review begins in overtime.
Berth occupation includes the pilot approach and cargo occupancy. A cumulative
constraint limits simultaneous pilots. Cargo-start time is compared to the soft
service-window target; the planning horizon is a hard limit.

Weights apply to waiting minutes, priority-weighted tardiness minutes, reviewer
overtime minutes, reviewer workload range in minutes and changed berth decisions.
Weights are rounded to hundredths for the integer objective. One solver worker,
fixed seed, deterministic effort budget and a ten-second wall-time ceiling bound
execution. Independent verification recomputes every hard constraint from output
timestamps; it does not trust CP-SAT variables. A timeout without an incumbent is
UNKNOWN. General infeasibility text does not claim a minimal unsatisfiable core.

FIFO, greedy-deadline and preserved-berth baselines fill unspecified decisions with
feasible schedules. Objective comparisons use the same scenario constraints and
weights. Simulation's no-change baseline uses original reviewer capacity; both
sides share external berth closures. This distinction is included in assumptions.

## Counterfactual evaluation

One SimPy implementation evaluates both plans. Per-case RNG streams are keyed by
seed and case ID, so a scheduling reorder does not change exogenous draws. Review
service, observable-document-based rework, pilot service and berth occupancy vary
across replications. Reviews queue under shifts/caps; vessels queue for berths and
pilots. Actual resource occupancy cannot overlap. Both sides may therefore have
zero berth conflicts. No artificial improvement is added.

Results report all replication samples, mean/std/p10/p50/p90, three headline KPIs,
staffed reviewer hours, overtime and workload imbalance. Example replay schedules
are explicitly replication one. They are not the distribution mean. All result
KPIs have `simulated` provenance. Full historical simulator calibration against
generator ground truth remains an outstanding launch task.

## Persistence and public demo

Migration `0003` adds scenario snapshots, immutable analysis result envelopes,
upload owners and the job/scenario FK. `analysis_runs.kind` separates optimization
and simulation; each JSONB payload validates against its own contract. This is a
deliberate simplification of the original two-result-table proposal.

Use one Uvicorn worker. Two bounded in-process background slots execute work with
fresh SQLAlchemy sessions. Jobs/results survive requests; startup marks interrupted
jobs failed. No Redis or Celery. Scenarios are private to a randomly generated
UUID-v4 session token, expire in 24 hours, and have row/run quotas. Canonical built-in
data cannot be mutated via HTTP. Uploads default off (`ENABLE_UPLOADS=false`).
The body limit is enforced before multipart parsing. CORS is not the access boundary.

`POST /scenarios` now returns `ScenarioRecord` (not the historical stub JobStatus).
Optimize/simulate return JobStatus with HTTP 202; retrieve immutable outputs using
the resulting IDs. `/scenarios/{id}/export` includes the spec, snapshot and evidence.
The generated OpenAPI/TypeScript contracts describe the complete paths.

## Verified reference

See `REFERENCE_EVALUATION.json` and run `python scripts/refresh_fixtures.py` from
the backend environment. This loads the committed model without retraining it.
Current cutoff calls are already delayed: review capacity can reduce remaining
waiting but cannot undo missed windows. These are synthetic, controlled outcomes,
not measured port savings. Geography and operational berth coordinates are distinct.

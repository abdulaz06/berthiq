# BerthIQ — Data Contracts

**Status:** Approved foundation
**Source of truth:** the Pydantic schemas in `backend/app/schemas/` implement this document; the frontend types in `frontend/lib/types/api.ts` are generated from the resulting OpenAPI spec.
**Reads with:** `ARCHITECTURE.md`, `DATABASE.md`

This is the most important document in the repo for the way you two work. Every seam here has a committed example fixture, and **that fixture is what lets one person build the frontend of a feature while the other builds the backend, on different days, without either waiting.** When a contract changes, the schema, the fixture, and the generated types change together, in the same task.

Schemas below are written in Pydantic-flavoured pseudocode — precise enough to implement directly, not final code.

---

## 1. The canonical event

The internal representation every uploaded or generated log is mapped into. Ingestion's whole job is to turn arbitrary CSV/XLSX columns into a list of these.

```python
class CanonicalEvent:
    case_id:     str                    # REQUIRED — the port call
    activity:    str                    # REQUIRED — stage name
    end_ts:      datetime               # REQUIRED — completion time
    start_ts:    datetime | None        # strongly recommended
    resource_id: str | None             # reviewer / planner / pilot / berth
    status:      str | None             # completed / rejected / returned / awaiting_docs
    attributes:  dict                    # maritime + optional fields, see below
```

**`attributes` well-known keys** (present for maritime datasets, absent-tolerant for generic ones):

```
berth, vessel_type, loa, draft, cargo_type,
eta, ata, etb, atb,           # estimated/actual arrival & berthing
weather_severity,             # 0..1
remark_text,                  # free text (drives remark classifier)
cost                          # optional scenario KPI
```

**Minimum viable log:** `case_id`, `activity`, `end_ts`. Everything else degrades gracefully — the maritime module lights up when its fields are present, and the generic path works without them.

---

## 2. Column mapping and validation

```python
class ColumnMapping:
    case_id:     str                    # source column → canonical field
    activity:    str
    end_ts:      str
    start_ts:    str | None
    resource_id: str | None
    status:      str | None
    attribute_map: dict[str, str]       # source column → attributes key

class ValidationIssue:
    severity: "fatal" | "warning" | "info"
    code:     str                        # 'missing_timestamp', 'impossible_order', 'duplicate_event', ...
    message:  str
    count:    int
    sample_rows: list[int]

class DataQualityReport:
    dataset_id: str
    total_events: int
    total_cases:  int
    issues: list[ValidationIssue]
    is_blocking: bool                    # true if any fatal issue → cannot proceed
```

Fatal (blocks): missing `case_id`, missing `end_ts`, unparseable timestamps.
Warning (proceed): duplicates, negative durations, unknown resource, single-event cases, impossible ordering.

---

## 3. The provenance wrapper — used everywhere a KPI appears

**Non-negotiable.** No endpoint returns a bare number for a KPI. Every KPI is:

```python
class KpiValue:
    value: float
    unit:  str                           # 'hours' | 'percent' | 'count'
    provenance: "observed" | "predicted" | "simulated" | "optimized"
```

The frontend renders every `KpiValue` through `<ProvenanceBadge>`. This is the wire-level half of the honesty guarantee described in `DATABASE.md` §8.

---

## 4. The EvidenceRecord — what powers every explanation

The deterministic explanation layer renders text from this structure. It is never free-form.

```python
class ShapFactor:
    feature: str
    contribution: float                  # signed
    direction: "increases_risk" | "decreases_risk"

class ConstraintRef:
    kind: str                            # 'berth_no_overlap', 'draft_limit', 'reviewer_capacity', ...
    detail: str                          # human-readable specifics

class EvidenceRecord:
    kind: "recommendation" | "risk" | "bottleneck"
    solver_status: str | None            # OPTIMAL / FEASIBLE / INFEASIBLE (optimization only)
    objective_value: float | None
    binding_constraints: list[ConstraintRef]
    penalized_soft_constraints: list[ConstraintRef]
    top_factors: list[ShapFactor]        # risk explanations
    baseline_deltas: dict[str, KpiValue] # vs no-change / FIFO / greedy
    simulation_seed: int | None
    replications: int | None
    notes: list[str]                     # structured, template-fillable — not prose
```

`TemplateExplainer.render(evidence)` maps this to a sentence. Example: an `EvidenceRecord` with `binding_constraints=[berth_no_overlap]`, `baseline_deltas={avg_waiting_time: -3.1h}` renders as *"Moving Vessel C to Berth 2 clears a berth overlap and lowers simulated average waiting time by 3.1 hours."* The number came from the solver and simulator; the template only phrased it.

---

## 5. Endpoint contracts

Base path `/api`. Slow operations return a `job_id` immediately and are polled.

### 5.1 Datasets and ingestion

```
POST /api/datasets                        multipart upload (CSV/XLSX)
  → DatasetSummary

POST /api/datasets/builtin/{name}         load a seeded dataset (e.g. 'khalifa_demo')
  → DatasetSummary

GET  /api/datasets                        → list[DatasetSummary]
GET  /api/datasets/{id}                   → DatasetSummary

GET  /api/datasets/{id}/suggested-mapping → ColumnMapping     (auto-detected)
POST /api/datasets/{id}/mapping           body: ColumnMapping
  → DataQualityReport

GET  /api/datasets/{id}/validation        → DataQualityReport
```

```python
class DatasetSummary:
    id: str
    name: str
    source: "builtin" | "uploaded" | "generated"
    status: "validating" | "invalid" | "ready"
    port_config: str | None
    event_count: int
    case_count: int
    active_case_count: int
    time_range: tuple[datetime, datetime] | None
    activities: list[str]
    resources: list[str]
```

### 5.2 Discovery

```
POST /api/datasets/{id}/discover          → { job_id }        (job_type='discovery')
GET  /api/discovery/{dataset_id}          → ProcessModel
```

```python
class DfgNode:  activity: str; frequency: int; median_duration_min: float
class DfgEdge:  source: str; target: str; frequency: int; median_wait_min: float; p90_wait_min: float
class Variant:  sequence: list[str]; count: int; median_total_min: float
class Bottleneck:
    activity: str
    metric: str                          # 'median_wait' | 'rework_rate' | 'resource_load'
    value: KpiValue
    rank: int
    evidence: EvidenceRecord

class ProcessModel:
    dataset_id: str
    nodes: list[DfgNode]
    edges: list[DfgEdge]
    variants: list[Variant]
    bottlenecks: list[Bottleneck]
    metrics: dict[str, KpiValue]         # throughput, rework_rate, avg_utilization
```

### 5.3 Prediction (risk)

```
GET  /api/datasets/{id}/risk             → RiskBoard          (inference is fast — synchronous)
GET  /api/cases/{case_id}/explanation?dataset_id=...  → CaseExplanation
```

```python
class CaseRisk:
    case_id: str
    vessel_type: str | None
    current_stage: str
    miss_probability: float              # 0..1
    predicted_remaining_min: float | None
    top_factors: list[ShapFactor]        # 3-5 drivers for the row
    service_window_end: datetime | None

class RiskBoard:
    dataset_id: str
    model_version: str
    cases: list[CaseRisk]                 # active cases, caller sorts

class CaseExplanation:
    case_id: str
    miss_probability: float
    evidence: EvidenceRecord             # kind='risk', full SHAP
    narrative: str                       # rendered by TemplateExplainer
```

### 5.4 Scenarios, optimization, simulation

```
POST /api/scenarios                       body: ScenarioSpec
  → { scenario_id }

POST /api/scenarios/{id}/optimize         → { job_id }        (job_type='optimization')
GET  /api/optimization/{run_id}           → OptimizationResult

POST /api/scenarios/{id}/simulate         → { job_id }        (job_type='simulation'; runs BOTH plans)
GET  /api/simulation/{run_id}             → SimulationResult
```

```python
class ScenarioSpec:
    dataset_id: str
    name: str
    constraints: ScenarioConstraints
    objective_weights: ObjectiveWeights

class ScenarioConstraints:
    reviewer_count: int | None           # override available reviewers
    reviewer_shift_caps: dict | None
    locked_berths: dict[str, str] | None # vessel → berth the user pins
    allow_parallel_low_risk: bool
    priority_vessels: list[str]

class ObjectiveWeights:                   # the five terms from PRODUCT_DEFINITION §15
    waiting_time: float                   # w1
    tardiness: float                      # w2
    reviewer_overtime: float              # w3
    workload_imbalance: float             # w4
    plan_changes: float                   # w5

class Assignment:
    vessel: str
    berth: str
    start: datetime
    reviewer: str | None                 # present when c2 (reviewer coupling) is active

class OptimizationResult:
    run_id: str
    scenario_id: str
    solver_status: "OPTIMAL" | "FEASIBLE" | "INFEASIBLE"
    objective_value: float | None
    runtime_ms: int
    assignments: list[Assignment]
    changed_decisions: list[Assignment]  # subset differing from the existing plan
    evidence: EvidenceRecord             # kind='recommendation'
    narrative: str
    infeasibility: list[ConstraintRef] | None   # populated only when INFEASIBLE

class KpiDistribution:
    name: str
    unit: str
    provenance: "simulated"
    mean: float; std: float; p10: float; p50: float; p90: float

class SimulationResult:
    run_id: str
    scenario_id: str
    seed: int
    replications: int
    baseline: list[KpiDistribution]
    optimized: list[KpiDistribution]
    headline: dict[str, tuple[KpiValue, KpiValue]]  # name → (baseline, optimized) for the 3 hero KPIs
    tradeoffs: dict[str, tuple[KpiValue, KpiValue]]  # overtime, workload — the honest costs
```

### 5.5 Jobs

```
GET /api/jobs/{id} → JobStatus
```

```python
class JobStatus:
    id: str
    job_type: "discovery" | "optimization" | "simulation"
    status: "pending" | "running" | "succeeded" | "failed"
    progress: float                       # 0..1, best-effort
    result_type: str | None               # what to GET when succeeded
    result_id: str | None
    error: str | None
```

Frontend loop: `POST …/optimize` → poll `GET /api/jobs/{id}` ~1s → on `succeeded`, `GET /api/optimization/{result_id}`.

---

## 6. Port configuration schema

Ports are files (`backend/data/ports/{name}.json`), not database rows. This is the contract for one:

```python
class Berth:
    id: str
    name: str
    length_m: float                      # LOA limit
    depth_m: float                       # draft limit
    terminal: str
    compatible_vessel_types: list[str]
    geo_ref: str                          # key into the port's GeoJSON

class PortConfig:
    name: str                             # 'khalifa'
    display_name: str                     # 'Khalifa Port'
    berths: list[Berth]
    reviewer_pool_size: int
    pilot_pool_size: int
    terminals: list[str]
    default_service_mix: dict              # vessel-type → share, for the generator
```

Berth **geometry** lives in `backend/data/geo/{name}.geojson` (from OpenStreetMap), keyed by `geo_ref`. Adding a fourth port = one JSON config + one GeoJSON file, no code.

---

## 7. The fixture strategy (how nobody waits)

For **every** response schema above, a canned example lives in **two** places with identical content:

```
backend/tests/fixtures/<schema>.example.json     ← backend tests assert responses match this
frontend/lib/fixtures/<schema>.example.json      ← frontend renders this until the endpoint is live
```

Rules:

1. **A contract task ships the fixture first** — before either the endpoint or the UI that consumes it. Defining `OptimizationResult` means committing `optimization_result.example.json` in the same change.
2. **Frontend builds against the fixture.** A component's task is "done" when it renders the fixture correctly. It does not depend on the backend existing.
3. **Backend proves it matches the fixture.** An endpoint's task includes a test asserting its response validates against, and structurally matches, the committed fixture.
4. **Flip is one flag.** `frontend/lib/api/` reads `NEXT_PUBLIC_USE_FIXTURES`. Development against fixtures, integration against the live backend, no code rewrite.
5. **Fixtures are realistic.** They use Khalifa berths, plausible vessel names, real-looking timestamps — so a fixture-driven UI already looks like the real thing in a screenshot.

When a schema changes, the same task updates: the Pydantic model, the fixture (both copies), and regenerates `frontend/lib/types/api.ts`. These four move together or not at all. That discipline is what keeps two independently-built halves fitting together on first integration.

---

## 8. Type generation

```
backend running → GET /openapi.json → commit to repo
  → npx openapi-typescript openapi.json -o frontend/lib/types/api.ts
```

`api.ts` is **generated, never hand-edited** (a header comment says so). Pydantic is the single source of truth; the TS types are a build output. This removes the entire class of "frontend and backend disagree about the shape" bugs — which, for two people building the two halves separately, is the bug you'd otherwise hit constantly.

# BerthIQ — Product Definition Pack

**Status:** Awaiting approval
**Version:** 1.0
**Date:** 23 July 2026
**Owners:** Abdul (product decisions, merges), Shravani (development)
**Approval required before:** repository setup, dependency installation, architecture implementation, backlog creation

Requirements are labelled **[MUST]**, **[SHOULD]**, **[COULD]**, or **[NOT-NOW]** (explicitly out of scope for version one).

---

## 1. Name and tagline

**BerthIQ**

> Evidence-backed port-call optimization.

A search found no existing product, company, or domain under this name, though the adjacent berth-planning market is crowded (Portchain Quay, Avlino PortBerth, Awake.AI Port Vision, Veson IMOS, Innovez One, Systems Navigator Dropboard). This is not a trademark opinion; a formal search is required before any public launch or commercial use.

The name lives in one configuration constant (`APP_NAME`) so a rename costs one commit rather than a refactor.

**"OpsTwin" is dropped entirely.** There is one application. No platform/product split, no umbrella branding, and no claim of generalization to non-maritime workflows.

The flagship feature is called **Scenario Studio**. The term "What-If Optimizer" is retired. The term "digital twin" is not used anywhere in the product, README, or interview language — the honest term is **simulation-backed workflow model**.

---

## 2. One-sentence pitch

BerthIQ reconstructs how port calls actually run from operational event logs, predicts which active calls will miss their service window, and recommends a solver-backed change to reviewer and berth assignments — showing the constraints, the evidence, and a simulated before-and-after for every recommendation.

---

## 3. Users

### Primary user [MUST]

**Port or terminal operations analyst.** One persona performs the entire journey: uploads or selects a dataset, confirms field mappings, reviews the discovered process, investigates bottlenecks, inspects at-risk calls, builds a scenario, reviews the recommendation, and exports the result.

### Secondary users [NOT-NOW]

Berth planner, VTS coordinator, terminal operations supervisor, shipping-line analyst, and management viewer are recognised as real roles but receive **no dedicated views, permissions, or workflows** in version one.

### Explicit non-user

BerthIQ is a decision-support tool. It does not issue operational commands, control equipment, or make autonomous decisions. Every recommendation requires human acceptance.

---

## 4. Job to be done

> When port calls are running late or heading for a berth conflict, help an operations analyst find the dominant cause, see which active vessels are at risk, test feasible changes to reviewer and berth assignments, and choose the change expected to improve waiting time and service-window compliance without breaking an operational constraint.

---

## 5. Flagship workflow

**Boundaries:** begins at *Port call request submitted*; ends at *Berthed / cargo operations started*.

Departure clearance, outbound services, and the departure leg are **[NOT-NOW]**. This roughly halves the state space and concentrates the product on the two bottlenecks that matter: document approval and berth assignment.

### Stages [MUST]

| # | Stage | Type | Resource | Notes |
|---|---|---|---|---|
| 1 | Port call request submitted | Instant | — | Case start |
| 2 | Documents submitted | Duration | Agent | Completeness varies |
| 3 | Completeness check | Duration | System + Reviewer | Fast, can fail |
| 4 | Authority review | Duration | **Reviewer** | **Rework loop → stage 2** |
| 5 | Arrival plan confirmed | Instant | Planner | Sets the service window |
| 6 | Berth planning | Duration | Planner | Parallel with 7 |
| 7 | Berth assigned | Instant | **Berth** | Compatibility constraints bind |
| 8 | Vessel arrives / anchorage wait | Duration | — | Queue forms here |
| 9 | Berthed, cargo start | Instant | **Pilot** + Berth | Case end |

### Loops and parallelism [MUST]

- **Rework loop:** stage 4 → stage 2 on rejection. Multiple iterations permitted. This is the primary source of approval churn.
- **Parallel eligibility:** stages 6 and 7 may begin before stage 4 completes for low-risk calls — this is an optimizer decision variable, not a fixed rule.
- **Mandatory ordering:** stage 9 cannot precede stages 4 and 7. This constraint is never relaxed.

### Resources [MUST]

Exactly three resource types are modelled and controllable:

1. **Reviewers** — a pool with shift calendars and workload caps
2. **Berths** — with length, draft, and terminal-type compatibility
3. **Pilots** — a scarce shared resource that creates queues

Tugs, cranes, labour gangs, and mooring crews are **[NOT-NOW]**.

### Delay definition [MUST]

A **service window** is a target berthing time agreed at stage 5. A port call is **delayed** when actual berthing falls after the end of that window. A **berth conflict** occurs when two calls are assigned overlapping occupancy of the same berth, or when an assigned vessel exceeds the berth's length or draft limit.

---

## 6. Core user journey [MUST]

1. Open BerthIQ; select a built-in dataset or upload CSV/XLSX
2. Confirm auto-detected column mapping
3. Review data-quality report; proceed or fix
4. Inspect the discovered process map and variants
5. Read the bottleneck panel; identify the dominant constraint
6. Open the risk board; sort active calls by predicted miss probability
7. Drill into one at-risk call; read its case-level explanation
8. Open **Scenario Studio**; set constraints and objective weights
9. Run the optimizer; receive a recommendation with evidence
10. Compare baseline versus optimized on the berth Gantt and the map
11. Read the tradeoff panel — what improved, what got worse
12. Export a scenario summary

---

## 7. Functional requirements

### 7.1 Ingestion and validation

| Requirement | Priority |
|---|---|
| Accept CSV and XLSX upload | MUST |
| Ship built-in seeded datasets | MUST |
| Auto-detect and map columns to the event-log schema, with user confirmation | MUST |
| Deterministic validation: missing case IDs, missing timestamps, duplicate events, negative durations, impossible ordering, unknown resources or berths | MUST |
| Present a data-quality report with severity levels; block only on fatal errors | MUST |
| Persist a versioned validated dataset | MUST |
| Support datasets up to ~50,000 events | SHOULD |
| Streaming or real-time ingestion | NOT-NOW |

### 7.2 Process discovery

| Requirement | Priority |
|---|---|
| Directly-follows graph as the primary process view | MUST |
| Variant list with frequency and duration | MUST |
| Activity and transition frequencies; median and p90 waiting times | MUST |
| Rework-loop detection and quantification | MUST |
| Rare-path filtering with an adjustable threshold | MUST |
| Bottleneck ranking with supporting metrics | MUST |
| Resource utilisation view | SHOULD |
| Inductive Miner process tree as a secondary view | COULD |
| Conformance checking against a reference model | COULD |
| Petri net / BPMN export | NOT-NOW |
| Object-centric process mining | NOT-NOW |

### 7.3 Prediction

| Requirement | Priority |
|---|---|
| Binary classifier: will this active call miss its service window | MUST |
| Leakage-safe prefix-based feature extraction | MUST |
| Chronological train/validation/test split | MUST |
| Logistic-regression and majority-class baselines | MUST |
| Gradient-boosted main model | MUST |
| Case-level SHAP explanations surfaced in the UI | MUST |
| Probability calibration | SHOULD |
| Expected remaining time as a displayed estimate | SHOULD |
| Separately trained remaining-time regressor | COULD |
| Rework-probability model | COULD |
| Sequence models (LSTM, Transformer, GNN) | NOT-NOW |

### 7.4 Scenario Studio and optimization

| Requirement | Priority |
|---|---|
| Constrained optimization over reviewer and berth assignment | MUST |
| Scenario controls mapped one-to-one to model parameters or constraints | MUST |
| Configurable objective weights | MUST |
| Report solver status, runtime, and objective value | MUST |
| Explain infeasibility with the conflicting constraint set | MUST |
| Compare against naive baselines (no change, FIFO, greedy) | MUST |
| Alternative near-optimal solutions | SHOULD |
| Multi-objective Pareto frontier | NOT-NOW |
| Robust optimization under uncertainty | NOT-NOW |

### 7.5 Simulation

| Requirement | Priority |
|---|---|
| Discrete-event simulation of arrivals, review queues, berth occupancy, pilot availability | MUST |
| Fixed seeds; reproducible runs | MUST |
| Multiple replications with variability reported | MUST |
| Identical model and seeds for baseline and optimized runs | MUST |
| Validation that the simulator reproduces generated ground truth within a stated tolerance | MUST |
| Sensitivity analysis across capacity levels | SHOULD |

### 7.6 Explanation and provenance

| Requirement | Priority |
|---|---|
| Every KPI value carries a provenance tag: `observed`, `predicted`, `simulated`, `optimized` | MUST |
| Provenance visually distinguished in the UI | MUST |
| Structured `EvidenceRecord` behind every recommendation | MUST |
| Deterministic template rendering of explanations | MUST |
| Persistent synthetic-data banner on all dataset and result views | MUST |
| Remarks classifier for delay reasons (supervised, not LLM) | SHOULD |
| Runtime LLM phrasing | NOT-NOW |

### 7.7 Visualization

| Requirement | Priority |
|---|---|
| Berth Gantt: berths × time, baseline versus optimized side by side | MUST |
| Directly-follows process graph | MUST |
| Risk board: sortable active calls with probability and top factors | MUST |
| Tradeoff panel showing gains and costs together | MUST |
| Port map with berth occupancy and anchorage queue | MUST |
| Animated before/after replay | SHOULD |
| Live AIS overlay, clearly labelled as external context | COULD |

---

## 8. Non-functional requirements

| Requirement | Target | Priority |
|---|---|---|
| Solver runtime | ≤ 10s, returns best-found on timeout | MUST |
| Simulation runtime | ≤ 15s for a full replication set | MUST |
| Process discovery | ≤ 5s on the reference dataset | MUST |
| Runtime external-service cost | $0 | MUST |
| Runs on 8GB Apple Silicon without Docker | MUST |
| One-command startup after setup | MUST |
| Deterministic outputs given a fixed seed | MUST |
| Desktop-first responsive layout | MUST |
| Mobile layout | NOT-NOW |
| Authentication / multi-tenancy | NOT-NOW |

---

## 9. MVP scope — the vertical slice

The first complete milestone proves this loop end to end, with nothing skipped:

```
upload / select dataset
  → validate + map columns
  → discover process
  → identify dominant bottleneck
  → predict risk on active calls
  → configure scenario
  → optimize under constraints
  → simulate baseline vs optimized
  → compare KPIs with provenance
  → explain with evidence
```

MVP includes: one seeded dataset, one port config (Khalifa), berth-only optimization (c1), one prediction target, the Gantt and process graph, and the tradeoff panel.

MVP excludes: the map, animated replay, remarks classification, multiple ports, and reviewer coupling. These arrive in the next scope level.

---

## 10. Strong version scope

Everything above, plus:

- Reviewer assignment coupled to berth scheduling (c2)
- Three port configurations: Khalifa, Zayed, Fujairah
- Port map with berth occupancy and anchorage queue
- Animated before/after replay
- SHAP case explanations in the UI
- Remarks classifier
- Dirty, active-case, and stress-test datasets
- Evaluation report with baselines and honest limitations
- Architecture diagram and README targeted at SWE and AI-engineering reviewers

---

## 11. Explicit non-goals

Not built, not claimed, not implied:

- Port Community System or Terminal Operating System functionality
- Real-time vessel control, autonomous berth allocation, or any safety-critical decision
- Live operational data integration with any real port system
- A general-purpose process-mining platform for arbitrary business domains
- Multi-tenancy, authentication, roles, or permissions
- Mobile application
- Real-time streaming architecture or microservices
- Reinforcement learning or deep sequence models
- An LLM as any part of the decision path
- Any claim of measured real-world savings
- Any representation that this reflects actual AD Ports Group operations

---

## 12. Data strategy

### Hard rule

**No proprietary, employer-derived, or confidential data. Public sources and synthetic generation only.** No exceptions.

### Public data

| Source | Use | Cost |
|---|---|---|
| OpenStreetMap | Berth, quay, and terminal geometry → static GeoJSON committed to repo | Free (ODbL) |
| OpenFreeMap + MapLibre GL JS | Basemap tiles; no API key, no registration, no usage limits | Free (MIT / OSM) |
| aisstream.io | Optional live AIS overlay; global coverage, stream-only | Free |
| Marine Cadastre | Historical AIS archives for calibrating arrival and anchorage-dwell distributions | Free (US only) |
| UNCTAD port statistics | Realism calibration for time-in-port and waiting-time ranges | Free |
| DCSA Port Call Standard | Event vocabulary and timestamp semantics | Free (standard, not data) |

Free global AIS with historical depth does not exist — the market consolidated, and free sources are either regional-with-history or global-stream-only. We therefore calibrate timing distributions from one region with free archives and apply them to any port, documenting this explicitly.

**Time-sensitive action:** because free global AIS is stream-only, Gulf history accrues only from the moment a collector starts running. If a real Arabian Gulf AIS slice is wanted, start a collector script early. [SHOULD]

### Synthetic data

The following is synthetic and must be labelled as such throughout:

document submissions and completeness states; approval and rejection loops; reviewer identities, shifts, and workloads; berth-planning decisions; pilot allocation; internal queues; operational remarks; cost proxies; service-level rules; and all ground-truth bottleneck labels.

### Generator principles [MUST]

- Fixed seeds; fully reproducible
- Delays are **caused**, not random: missing documents raise rework probability; reviewer overload lengthens approval queues; vessel size drives berth-compatibility conflicts; weather severity extends service times
- Queues emerge from finite capacity rather than being injected
- Shift and time-of-day effects
- Hidden ground truth recorded separately for evaluation: the true bottleneck stage, the true delay cause per case, the true optimal-ish assignment
- Produces clean, deliberately dirty, active-case, and stress-test variants

### Dataset scale [MUST]

~600 completed port calls, ~7,000 events, ~25 active in-flight calls, spanning six months.

### Port configurations

Ports are configuration files (berth list, lengths, drafts, terminal types, service mix), not code. Three realized in the strong version: **Khalifa Port** (deep-water, container-dominant), **Zayed Port** (multipurpose and cruise), **Fujairah Terminals** (eastern seaboard, distinct constraint profile). Adding a fourth is a config file.

### Honesty requirement [MUST]

Real port names and real geography are used as a realistic setting. All operational data is synthetic. The application displays a persistent, visible banner stating this. It is not a footnote.

---

## 13. AI boundaries

**No LLM in the deployed application.** Runtime token cost is $0.

| Layer | Produced by |
|---|---|
| Historical metrics | Deterministic computation over the event log |
| Process model | PM4Py discovery algorithms |
| Risk probabilities | Trained gradient-boosted classifier |
| Feature attributions | SHAP |
| Assignments and schedules | OR-Tools CP-SAT |
| Counterfactual KPIs | SimPy, fixed seeds |
| Explanation text | Deterministic templates over structured `EvidenceRecord`s |
| Remark classification | Supervised text classifier (TF-IDF + logistic regression) |

An `ExplanationProvider` interface is defined with `TemplateExplainer` as the only implementation, leaving a one-class seam if LLM phrasing is ever wanted.

**Never permitted:** generating a KPI value, inventing an event, choosing an assignment without the solver, producing a confidence number without a model, or concealing infeasibility.

---

## 14. Prediction target

**Primary [MUST]:** binary classification — *will this active port call miss its service window?*

- **Prediction point:** recomputed at every completed event for every active case
- **Features:** current stage, time in stage, total elapsed, completed sequence, rework count, missing-document count, reviewer queue length, reviewer workload, berth availability, vessel type, LOA, draft, cargo type, planned-arrival variance, weather severity, pilot availability, historical similar-case outcomes
- **Leakage controls:** prefix-based extraction only; no post-prediction information; chronological split; no target-derived features
- **Baselines:** majority class, logistic regression
- **Main model:** gradient-boosted trees
- **Metrics:** PR-AUC (primary, delays are the minority class), AUROC, Brier score, calibration curve
- **Explanations:** SHAP per case, surfaced in the UI

**Secondary [SHOULD]:** expected remaining time to berthing, displayed as an estimate with MAE reported.

---

## 15. Optimization problem

**Bounded joint model**, built in two stages so a working version exists at every point.

### Stage c1 — berth assignment and scheduling [MUST]

**Decision variables**
- `assign[v,b] ∈ {0,1}` — vessel `v` to berth `b`
- `start[v]` — berthing start time (interval variable)
- `late[v] ≥ 0` — minutes past the service window
- `changed[v] ∈ {0,1}` — plan differs from the existing assignment

**Hard constraints**
- Exactly one compatible berth per vessel
- No overlapping occupancy on a berth (no-overlap on intervals)
- Vessel LOA ≤ berth length; draft ≤ berth depth
- Pilots not double-booked
- Berthing not before documents approved and vessel arrived
- Earliest-arrival and latest-allowed windows respected

**Soft constraints (penalised)**
- Changing an existing berth assignment
- Deviating from planned windows for priority vessels

### Stage c2 — reviewer coupling [SHOULD]

Adds `review[t,r] ∈ {0,1}` (review task to reviewer), reviewer shift and workload caps, and a parallel-eligibility decision for low-risk checks. Reviewer completion determines each vessel's earliest-ready time, which becomes the release constraint in c1. This coupling is what makes the recommendation feel causally intelligent rather than arbitrary.

If c2 proves too slow or unstable, c1 ships as a complete story.

### Objective

```
Minimize  w1·total_waiting_time
        + w2·weighted_tardiness
        + w3·reviewer_overtime
        + w4·workload_imbalance
        + w5·plan_changes
```

Weights are user-configurable in Scenario Studio and displayed with the result.

### Output contract

Solver status, objective value, runtime, assignments, changed decisions, binding constraints, penalised soft constraints, comparison against naive baselines, and — when infeasible — the conflicting constraint set stated plainly.

---

## 16. Simulation scope

**Engine:** SimPy discrete-event simulation.

**Modelled:** port-call arrivals, document-review queueing and service, rework loops, berth occupancy, pilot availability, anchorage waiting, cargo-start timing, weather effects on service duration.

**Comparison method [MUST]:** baseline and optimized plans run through the **same model with the same seeds**; only decision variables differ. This is the only structure that isolates the optimizer's effect from simulator optimism.

**Separate validation [MUST]:** a one-time experiment showing the simulator reproduces the generator's ground-truth KPI distributions within a documented tolerance. Two claims, two experiments, never mixed.

**Reporting:** multiple replications with mean and spread. Never a single run presented as a point estimate.

---

## 17. Evaluation criteria

| Component | Baseline | Metric | Method |
|---|---|---|---|
| Process discovery | Generator's true process | Transition precision/recall | Compare to recorded ground truth |
| Bottleneck detection | Injected known bottlenecks | Precision/recall on bottleneck rank | Stress tests with injected overload |
| Delay classifier | Majority class, logistic regression | PR-AUC, AUROC, Brier, calibration | Chronological split |
| Remaining time | Per-stage historical median | MAE | Chronological split |
| Optimizer | No change, FIFO, greedy | Waiting time, compliance, overtime | Constraint verification + objective delta |
| Simulation | Generator ground truth | KPI distribution error | Fixed seeds, multiple replications |
| Explanations | Manual spot checks | Consistency with stored model and solver output | Automated assertion that displayed values match stored records |

**Honest reporting requirement [MUST]:** results demonstrate that the pipeline behaves correctly under controlled assumptions. They do not demonstrate real-world port performance. The evaluation report states this plainly.

---

## 18. Golden path

Replacing the "demo script" concept. This is an **automated end-to-end integration test** that also happens to be presentable.

**Scenario:** Khalifa Port, six months of synthetic history plus 25 active calls. The generator has injected a reviewer shortage on night shifts, causing approval backlog, causing late berth assignment, causing two berth conflicts and a lengthening anchorage queue.

**Expected outcome:** the system discovers the approval bottleneck, ranks affected active calls by risk, and the optimizer recommends a reviewer reallocation plus one berth change that reduces simulated waiting time and improves service-window compliance — at the cost of measurable reviewer overtime, which is displayed rather than hidden.

**Requirements [MUST]**
- Runs headless in CI on every push
- Fully deterministic under a fixed seed
- Asserts on KPI direction and constraint satisfaction, not exact values
- Fails loudly if any stage breaks

The three headline KPIs: **average vessel waiting time**, **service-window compliance %**, **berth conflicts**. Reviewer overtime and workload imbalance are shown as tradeoff counters — a recommendation that improves everything at once is less credible than one with an honest cost.

---

## 19. Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Scope exceeds available hours (~12 hrs/week combined) | **High** | Vertical slice first; c1 before c2; map and replay after the loop closes |
| Two Claude Code sessions overwrite each other | **High** | Task claiming in `ACTIVE_WORK.md`, branch per task, CI on every push |
| Tasks block each other, forcing one developer to wait | **High** | Contract-first design; committed fixtures so frontend never waits on backend |
| Synthetic data looks arbitrary | **High** | Causal dependency chains, capacity-derived queues, recorded ground truth, documented assumptions |
| Optimizer is trivially simple | **High** | Real no-overlap, compatibility, and precedence constraints; comparison against naive baselines; infeasible cases shown |
| Project drifts into a dashboard | **High** | Decision loop before any secondary view |
| Estimates mistaken for facts | **High** | Provenance tag on every KPI, enforced at the data-model level |
| 8GB machine cannot run the stack | **Medium** | Native Postgres, no Docker for daily development, offline model training |
| Process graph unreadable | **Medium** | Rare-path filtering, variant selection, adjustable abstraction |
| Solver too slow | **Medium** | 10s ceiling, best-found on timeout, bounded first formulation |
| Neither developer can explain the system in interview | **Medium** | Both must be able to explain every module; rotate task types rather than specialising |
| Name collision surfaces later | **Low** | Name in one config constant; formal search before public launch |

---

## 20. Open decisions

Deferred, not blocking:

1. Whether to start an AIS collector now to accrue real Gulf history
2. Whether the animated replay is strongest on the Gantt, the map, or both
3. Whether the remarks classifier ships in the strong version or later
4. Whether to add a fourth port configuration
5. Objective weight defaults — to be tuned once the generator produces realistic data
6. Whether conformance checking is worth a tab
7. Hosting target, if any, beyond local execution

---

## Approval

Approving this document authorises: repository setup, dependency installation, architecture implementation, data-contract definition, and backlog creation.

**Changes requested before approval:**

_(record amendments here)_

**Approved by:** ______________  **Date:** ______________

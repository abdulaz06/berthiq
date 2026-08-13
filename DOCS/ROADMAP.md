# BerthIQ — Roadmap

**Status:** Approved foundation
**Reads with:** `PRODUCT_DEFINITION.md`, `BACKLOG.md`
**Pace assumption:** ~1 hour/day each (~14–20 combined hrs/week). Durations below are **estimates that flex with scope, not deadlines.** The lever for going faster is cutting scope, never compressing an estimate.

---

## The one rule of sequencing

Build the **decision loop end-to-end before any secondary view.** Every source document warns that the failure mode is a beautiful dashboard with a hollow core. So the order is always:

```
ingest → discover → predict → optimize → simulate → explain → (then polish)
```

A thin, ugly, working version of the whole loop beats a gorgeous half of it. We make it work, then make it good, then make it broad.

---

## M0 — Foundations (skeleton + seams + CI)

**Goal:** the repo exists, both of you can run it, the contracts-and-fixtures seams are in place, CI is green, provenance primitives exist, and a trickle of synthetic data flows through a trivial end-to-end path. No features yet — the frame everything hangs on.

**Done when:** `just dev` runs the stack on both machines, `just seed` produces a small valid Khalifa dataset, the health-check page loads through the real backend, and CI passes on `main`.

**Estimate:** ~1.5–2 weeks.

---

## M1 — The vertical slice (MVP)

**Goal:** the entire loop working on one port (Khalifa), berth-only optimization (c1), one prediction target. Each stage minimal but demo-quality; nothing stubbed.

Scope, exactly as the Pack's MVP: upload/select a dataset → validate + map → discover process + bottlenecks → predict which active calls miss their window → build a scenario → optimize berth assignment under real constraints → simulate baseline vs optimized on shared seeds → compare the three hero KPIs with provenance tags → deterministic evidence-backed explanation.

**Done when:** the golden-path E2E test runs the full loop headless on the Khalifa seed, the three KPIs move in the right direction, all solver constraints are satisfied, and every KPI on screen carries a provenance badge.

**Estimate:** ~6–8 weeks. This is the milestone that makes the project real; treat everything after it as enhancement.

---

## M2 — Strong version

**Goal:** the portfolio-grade product. Backlogged in detail only when M1 lands (planning it now would be guessing).

Scope (from the Pack's strong version):
- Reviewer assignment coupled to berth scheduling (c2) — the causal link that makes recommendations feel intelligent
- Interactive port map (MapLibre) with berth occupancy + anchorage queue
- Animated before/after replay
- SHAP case explanations surfaced in the UI
- Remarks classifier (supervised, not LLM)
- Three port configs: Khalifa, Zayed, Fujairah
- Dirty, active-case, and stress-test datasets
- Evaluation report with baselines and honest limitations
- README + architecture diagram aimed at SWE / AI-engineering reviewers

**Estimate:** ~2–3 further months.

---

## M3+ — Optional depth (only if it serves a goal)

Continuous data ingestion, richer scheduling, calibration/survival models, the AD Ports domain-feedback sessions (Pack §C.1 — the highest-value startup-validation activity, zero company data). Pulled in individually, never as a batch.

---

## Dependency map (what unblocks what)

```
M0-1 scaffold ──┬─► M0-2 db ──► M0-6 generator+seed ──► (all M1 pipeline work)
                ├─► M0-3 schemas+fixtures ──► (every frontend + backend M1 task, in parallel)
                ├─► M0-4 type-gen ──────────► (frontend M1 tasks)
                ├─► M0-5 health slice
                ├─► M0-7 provenance primitives ─► (any task showing a KPI)
                └─► M0-8 CI

Within M1 (once M0-6 gives data + M0-3 gives fixtures):
  ingestion ── discovery ── prediction(offline train → risk) ── optimization(c1) ── simulation ── explanation ── golden-path
        │           │              │                                  │                 │
        └───────────┴──────────────┴──────── frontend tasks build against fixtures in parallel, no waiting ───┘
```

The whole point of the contracts+fixtures seam: after M0, **frontend and backend halves of every M1 stage can be picked up independently, on different days, by whoever is free** — neither blocks the other, because both are built against the same committed fixture.

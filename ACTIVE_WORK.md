# ACTIVE_WORK.md — live board

The single source of truth for **who is doing what right now.** Update this the moment you claim or release a task. It may be committed directly to `main` (see `docs/WORKFLOW.md` §3).

How to use it: pick the top task from **Ready to pick up** whose dependencies are all in **Done** → move it to **In progress** with your name, branch, and date → when merged, move it to **Done** and pull the next task(s) into **Ready**.

---

## In progress

_Nothing yet — the project hasn't started. First claim will be M0-1 (repo scaffold), by Abdul._

<!-- format:
- [M1-09] berth optimizer — Abdul — branch task/M1-09-berth-optimizer — started 2026-08-14
-->

---

## Blocked

_None._

<!-- format:
- [M1-11] simulation — blocked on M1-09 (needs the optimizer's assignments)
-->

---

## Ready to pick up

Only **M0-1** is ready (everything else depends on the scaffold existing).

- [M0-1] Repository scaffold — *this is the one-time setup task; Abdul runs SETUP_PROMPT.*

After M0-1 merges, move these into Ready (all depend only on M0-1):
- [M0-2] Database bootstrap
- [M0-3] Contracts + fixtures
- [M0-5] Health-check vertical slice
- [M0-7] Provenance primitives
- [M0-8] CI hardening

---

## Done

_None yet._

<!-- format:
- [M0-1] Repository scaffold — Abdul — merged 2026-08-14
-->

---

## Notes / decisions in flight

_Use this space for short coordination notes between sessions (e.g. "renamed the risk endpoint field X→Y in M1-07, frontend M1-08 should use the updated fixture")._

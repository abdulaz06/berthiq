# Showcase sprint — product takeover (Claude Code)

Active objective since 2026-11-02. Supersedes `CODEX_LAUNCH_SPRINT.md` as the
working tracker; that file remains the historical record of the engineering sprint
(PR #7–#11). Correctness, provenance, determinism and security rules from
`CLAUDE.md` / `AGENTS.md` still apply unchanged.

**Resume rule:** if the owner types "Continue", read this file, `git status` and
the current branch, then start at **Exact next action** below. Do not restart the
evaluation or repeat completed milestones.

## Audit (what was wrong)

The engineering is real and well-tested, but the product explained its
machinery, not its value.

- Landing ("Every port call. A clearer decision.") never states a problem. A
  visitor sees a compass, a screenshot and three generic cards. No ship, no wait,
  no consequence.
- The console is a toolbox of six peer views (Port, Risk, Events, Process,
  Studio, Data) with no thread between them. Filler copy ("Observe the flow.
  Understand the pressure.") repeats on every view.
- The guided tour is a text card that switches tabs. It never selects a ship,
  points at anything, or runs anything.
- Replay teleports vessels: positions ignore event *start* times, every ship
  without a berth sits in a rigid 7-column lattice, and all MapLibre markers are
  destroyed and rebuilt on every clock tick (1 s steps of 10 min).
- The map misrepresents the data: ~27 ships are drawn at anchorage, but most
  active calls have not physically arrived — their paperwork has only started.
- Typography is Arial; the palette (seafoam on navy) is generic.
- The single most interesting finding in the data — ships wait at anchor for
  days because authority review bounces their documents, not because berths are
  full — is never told. Example from the reference log: **KHL-0592** anchored
  for ~43 h while its documents were rejected three times.
- Scenario results are a grid of before→after numbers with no verdict. "Window
  compliance 0 → 0 %" reads like failure with no explanation.

## Creative direction

**One question:** *Why is this ship waiting — and what should the port change?*
Every surface is organised as an investigation: the port → one ship → the
pattern → who is next → a decision → the verdict.

**Identity — the Q flag.** At sea, the plain yellow "Q" signal flag means *my
vessel requests clearance*: it is literally the flag of a ship waiting for
paperwork. BerthIQ's accent is that signal yellow, used for *waiting*. Teal
means *moving / clear*, coral means *at risk*. Headlines in Big Shoulders
Display (industrial port signage), UI in IBM Plex Sans, data in IBM Plex Mono.
Deep chart-navy water with depth contours.

**Motion is evidence.** Vessels move only when the event log says they moved:
approach → anchorage at the arrival event's start, pilotage to the berth over
the real interval between anchorage release and "Berthed, cargo start",
departure after the configured occupancy assumption. Paths are illustrative and
labelled so; timing comes from the data. Calls whose ships have not arrived are
shown as *inbound* (paperwork in progress), not parked at anchor.

**Plain language first, evidence one click deeper.** Each view answers one
question in its header. Each ship has a journey strip that explains its wait in
a sentence phrased by template from observed events. Each scenario result opens
with a verdict that states the gain *and* the cost.

## Milestones

| # | Milestone | State |
|---|-----------|-------|
| 0 | Audit, Caravan study, direction, tracker | done |
| 1 | Motion model + map rewrite (persistent markers, rAF playback) | pending |
| 2 | Ship journey ("why is it waiting") model + panel | pending |
| 3 | Identity: fonts, tokens, Q-flag mark, console copy and nav | pending |
| 4 | Story mode: guided investigation driving the real app | pending |
| 5 | Landing page rebuilt as the problem → solution story | pending |
| 6 | Scenario verdict + result clarity | pending |
| 7 | Case study + README rewrite | pending |
| 8 | Showcase media: frame-accurate 60 fps recorder, video, stills, GIF, OG | pending |
| 9 | Full verification, PR, CI, merge, final handoff | pending |

## Environment notes

- Branch: `claude/product-takeover` (from `main` @ `9f86aa4`).
- Unrelated local changes to preserve, never commit: `.env.example` deletion,
  `frontend/next-env.d.ts` rewrite by Next.
- Dev servers: `node scripts/dev.mjs` (Postgres runs as a Windows service).
- ffmpeg with libx264 is not on PATH; media scripts take `FFMPEG=<path>`.
  This session installed `ffmpeg-static` in its scratchpad, not the repo.
- Caravan reference clone is read-only, in the session scratchpad.

## Verification evidence

_(appended per milestone)_

## Exact next action

Milestone 1: write `frontend/lib/motion.ts` (+ tests) and rewrite
`components/map/PortMap.tsx` to persistent markers driven by a rAF clock.

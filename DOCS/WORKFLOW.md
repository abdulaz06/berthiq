# BerthIQ — Workflow

**Status:** Approved foundation
**Reads with:** `BACKLOG.md`, `RECOVERY.md`, `ACTIVE_WORK.md`, `HANDOFF.md`

This document is how two people, at an hour a day each, in mostly separate sessions, build one repo without stepping on each other. The design goal: **anyone free can pull `main` and pick up the next task, and no session can silently break another's work.**

---

## 1. The collaboration model: a claim-based queue

There is no ownership split by skill or by 50/50. Work is a queue in `BACKLOG.md`; `ACTIVE_WORK.md` is the live board of what's claimed and what's ready.

**To start work:**
1. `git checkout main && git pull`
2. Open `ACTIVE_WORK.md`. Pick the top task from **Ready to pick up** (or continue your own in-progress task per `HANDOFF.md`).
3. Add it under **In progress** in `ACTIVE_WORK.md` with your name, the task id, the branch name, and the date. Commit that change to `main` directly (see §3). This is your claim — it stops the other session grabbing the same task.
4. Create the task branch and build.

**Only one person holds a task at a time.** If `ACTIVE_WORK.md` shows a task in progress, it's taken — pick another. Because you rarely work simultaneously, collisions are rare; the board makes them impossible rather than merely unlikely.

---

## 2. Branching

- Every task gets a branch: `task/<id>-<slug>` (e.g. `task/M1-09-berth-optimizer`).
- Branches are short-lived — one task, then merged and deleted.
- The branch exists for **isolation and one-command rollback**, not for approval. There is no human PR review (agreed: neither of you can meaningfully review the other's code; CI is the reviewer instead).
- Never commit feature work directly to `main`. The only direct-to-`main` commits are the coordination/docs exceptions in §3.

---

## 3. What may go straight to `main`

Direct commits to `main` are allowed **only** for:
- `ACTIVE_WORK.md` claims and releases
- `HANDOFF.md` entries
- `docs/` edits
- `data/ports/*.json` and other pure config

Everything that is code, schema, or a fixture goes through a task branch + CI.

---

## 4. Merging: CI is the gate

1. Push your branch. GitHub Actions runs the full suite (lint, typecheck, `pytest`, `vitest`, Playwright golden-path once it exists).
2. **Green → self-merge** to `main` (squash merge), then delete the branch. No approval needed.
3. **Red → do not merge.** Fix on the branch until green.
4. `main` is always green and always runnable. If `main` ever goes red, fixing it is the next task anyone picks up, ahead of everything else.

This is also why the repo will read as professional to the engineers you're targeting: real branches, real CI, clean history — not force-pushed chaos on `main`.

---

## 5. Commits

- Present-tense, task-tagged: `M1-09: add berth no-overlap constraint`.
- Commit in small, working increments — easier to hand off and to recover.
- Never commit secrets or large raw data. `.gitignore` must cover `.env`, `aisstream_key.txt`, `ais_data/`, `node_modules/`, `__pycache__/`, and large model artifacts.

---

## 6. Avoiding conflicts by construction

The architecture already minimizes collisions, but reinforce it:
- **Contracts + fixtures** mean the frontend and backend halves of a stage touch different files — they rarely conflict even when built at the same time.
- **One task = one branch = a bounded set of files.** Small tasks conflict less.
- **Claim before you start.** The board is the truth about who's touching what.
- If two tasks would edit the same file heavily, sequence them (mark one *Blocked on* the other in `ACTIVE_WORK.md`) rather than run them together.
- Never rebase or force-push shared history. Merge `main` into your branch if it's moved under you.

---

## 7. Generated + derived files

- `frontend/lib/types/api.ts` is **generated** (`just types`). If a task changes a schema, that same task regenerates and commits `api.ts` and updates both fixture copies. Schema + fixture + types move together, in one branch, or not at all.
- Generated datasets under `data/datasets/` are regenerable (`just seed`) and gitignored; the seed in the `datasets` row is the real source of truth.

---

## 8. The session ritual (every time)

**Start:** pull `main` → read `ACTIVE_WORK.md` + the latest `HANDOFF.md` entry → claim a task.
**End (always, even mid-task):** update `ACTIVE_WORK.md` (release or mark in-progress with exact state) → append a `HANDOFF.md` entry with what you did and the precise next step → push everything. A session that ends without a handoff entry is the one thing that breaks continuity — never skip it.

The recovery procedure that depends on this ritual is in `RECOVERY.md`.

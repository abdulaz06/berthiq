# BerthIQ — Recovery

**Status:** Approved foundation
**Reads with:** `WORKFLOW.md`, `ACTIVE_WORK.md`, `HANDOFF.md`, `CLAUDE.md`

The premise: **all project state lives in the repo, not in any one Claude Code session's memory.** So either person, on either machine, can reconstruct exactly where things are by reading four things — and continue from the precise point the last session stopped. This is what makes the "whoever's free picks it up" model actually work across separate sessions.

---

## The four sources of truth

1. **`git log` + `git status` on `main`** — what is *done* (merged, CI-green tasks) and whether `main` is clean.
2. **`ACTIVE_WORK.md`** — what is *claimed and in progress* (by whom, which branch), what is *blocked*, and the *Ready* set to pick from next.
3. **Latest `HANDOFF.md` entry** — what the last session actually did and the **exact next step** it left.
4. **Open branches** (`git branch -a`) — any half-finished task lives on its `task/<id>-...` branch.

If those four agree, you know the full state. Keeping them in sync is the entire discipline (see the session ritual in `WORKFLOW.md` §8).

---

## Cold start: "I'm opening this project and I don't know where we are"

```
1. git checkout main && git pull
2. Read CLAUDE.md            → the rules and how we work
3. Read the last 1–2 HANDOFF.md entries  → what just happened + the next step
4. Read ACTIVE_WORK.md       → what's claimed, blocked, and Ready
5. git branch -a             → any in-progress task branches?
6. just dev                  → confirm the app still runs
7. Decide:
     - Continue an in-progress task (per HANDOFF) that is yours or abandoned, OR
     - Claim the top Ready task
```

## Picking up after the *other* person

The `HANDOFF.md` next-step is written to be actionable by either of you. To continue their in-progress task:
```
1. git fetch
2. git checkout task/<id>-<slug>        (their branch)
3. git pull
4. Read the HANDOFF entry for that task → the exact next step and any gotchas
5. just dev / just test                 → see current state
6. Continue from the next step; keep the same branch
```
Update the `ACTIVE_WORK.md` claim to your name so it's clear you now hold it.

## After an interruption (session died, laptop closed mid-task)

Nothing merged to `main` is ever broken (CI gates it), so recovery is always to a safe base.
```
1. git status on your task branch → uncommitted work still there?
2. If the branch is coherent: finish it, get CI green, merge.
3. If the branch is a mess: either
     - git reset to the last good commit and continue, or
     - abandon it (delete the branch) and re-pick the task from Ready —
       main is untouched, so nothing is lost but that branch's work.
4. Append a HANDOFF entry describing what you recovered.
```

## If `main` is red

Fixing `main` is the highest-priority task, ahead of any feature.
```
1. Read the failing CI job → which check, which task last merged.
2. Branch fix/main-green, repair, get CI green, merge.
3. HANDOFF entry noting the fix.
```

---

## Why this is robust for two AI-driven sessions

- **No shared mutable state outside git.** Two Claude Code sessions never rely on each other's context — they rely on the repo, which both can read.
- **Small branches + CI-green `main`** mean the worst case is losing one unfinished branch, never the project.
- **The handoff entry is the baton.** Its "exact next step" line is what lets a *different* person's session resume without guessing. That single line is the most important thing any session writes.
- **The claim board prevents double-work.** Because sessions are usually not simultaneous, the board plus pull-before-claim is enough to guarantee two people never build the same task.

The one failure mode is a session that ends without updating `ACTIVE_WORK.md` and `HANDOFF.md`. Treat that update as part of the task, not optional cleanup — it is the thing that makes everyone's next session possible.

# SESSION_PROMPT — both developers, every session

This is the recurring prompt. Paste it at the start of **every** working session. It's identical for both of you except the name on the first line — fill in yours (it's used for the claim board and the handoff log; git handles commit attribution separately).

Because work is a shared queue, this same prompt drives both sessions; the claim board keeps you from ever picking the same task.

---

## The prompt to paste

```
You are working on BerthIQ as <ABDUL | SHRAVANI>'s session. Follow CLAUDE.md and
docs/WORKFLOW.md exactly.

START — orient yourself before touching anything:
1. git checkout main && git pull
2. Read CLAUDE.md (rules), the latest 1–2 entries in HANDOFF.md (what just
   happened + the next step), and ACTIVE_WORK.md (claims / blocked / ready).
3. git branch -a — is there an in-progress task branch I should continue?

CHOOSE ONE task:
- If HANDOFF points to an in-progress task that is mine or clearly abandoned,
  continue it on its existing branch, OR
- Take the top task in "Ready to pick up" whose dependencies are all in Done.
Do not start a task whose dependencies aren't merged. Do not invent scope beyond
the task's acceptance criteria in docs/BACKLOG.md.

CLAIM it: add it under "In progress" in ACTIVE_WORK.md (my name, task id, branch,
date) and commit that to main directly. This reserves the task.

BUILD it:
- Create branch task/<id>-<slug>.
- Implement to the task's acceptance criteria. Respect the non-negotiables:
  contracts+fixtures (build against fixtures, don't wait on the other half),
  determinism (seeds, no wall-clock), provenance on every KPI, no runtime LLM,
  8GB-friendly (native Postgres, no new heavy infra).
- If I change a schema: update the schema + BOTH fixture copies + regenerate
  frontend/lib/types/api.ts, in this same branch.
- Write the tests the task lists. Run just test locally.

MERGE:
- Push the branch. Wait for CI. Green -> squash-merge to main, delete the branch.
  Red -> fix on the branch until green. Never merge red. Never push feature code
  straight to main.

END — always, even if the task isn't finished:
- Update ACTIVE_WORK.md: move the task to Done (if merged) OR leave it In progress
  with a note on the exact current state; refresh the Ready set if tasks unblocked.
- Append a HANDOFF.md entry: Task, Branch, Did, State, Next step (the single most
  actionable next thing — precise enough for the OTHER person to resume cold),
  Gotchas.
- Push everything.

Never end a session without the ACTIVE_WORK.md + HANDOFF.md update. If you're
running low on time, stop implementing early and spend the remaining time writing
a clean handoff — continuity matters more than one extra commit.
```

# HANDOFF.md — session log

Append one entry at the end of **every** session, even if you stopped mid-task. Newest entry on top. The **Next step** line is the baton — write it so the *other* person's Claude Code could resume without guessing. This file is what makes recovery work (`docs/RECOVERY.md`).

Keep it to real signal; when it gets long, older entries can be trimmed to a one-line summary.

---

<!-- Copy this template for each entry:

## YYYY-MM-DD — <Name> — <session length>
**Task(s):** <id(s)>
**Branch:** <branch, or "main" for coordination-only>
**Did:** <what actually changed — files, endpoints, decisions>
**State:** <merged / on branch, CI green or red, what works and what doesn't yet>
**Next step:** <the single most actionable thing to do next — precise enough for the other person to start cold>
**Gotchas:** <anything surprising: a workaround, a flaky test, a decision that needs revisiting>

-->

## (project not started)
**Next step:** Abdul runs `SETUP_PROMPT.md` in Claude Code to create the repository skeleton (task M0-1), gets CI green, merges to `main`, and records it here and in `ACTIVE_WORK.md`. Then Shravani runs `ONBOARDING_PROMPT.md` to set up her machine and confirm `just dev` works. After that, either person picks up the next Ready task.

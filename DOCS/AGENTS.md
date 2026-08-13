# AGENTS.md

Instructions for Codex (and other agentic coding tools that follow the AGENTS.md convention) when working on this repository.

**This file lives at the repo root and is loaded automatically at the start of every Codex session.** Keep it small. Detail lives in topic-specific docs under `docs/`. This file's job is to tell Codex which topic doc to load for the current task.

This file is kept in sync with `CLAUDE.md` (also at repo root). Only the bottom "Tool-specific notes" section differs between them. If you edit anything above that section, update `CLAUDE.md` too.

## Project in one paragraph

ASP Invoicing Platform is an internal invoicing system for ASP Auditing LLC Dubai, built as a custom Frappe app named `asp_invoicing` on top of ERPNext. It replaces ASP's Excel-based invoicing with FTA-compliant tax invoices, receipts, credit notes, and a collections dashboard. Scope is invoicing only — not full accounting. ERPNext's general ledger machinery exists but is not used; ASP keeps actual books in Tally and consumes our CSV export.

## Session start protocol

Every session, in this order:

1. Read this file (`AGENTS.md` at repo root).
2. Read `docs/STATE.md` to see current phase, last completed item, next item, blockers.
3. Read only the topic doc relevant to the current task. Use the routing table below.
4. If `docs/STATE.md` says a phase is blocked, surface the blocker before suggesting work.

Do not read all docs at session start. That defeats the point of splitting them.

## Routing table — which doc to read for which task

| Task | Doc to load |
|---|---|
| Installing ERPNext, scaffolding the custom app, setting up Docker | `docs/FOUNDATION.md` |
| Custom fields, naming series, chart of accounts, tax templates, item groups, multi-currency | `docs/DATA_MODEL.md` |
| FTA-compliant PDFs, Jinja templates, letterhead, print format design | `docs/PRINT_FORMATS.md` |
| Roles, role profiles, permissions, workspace shaping, hiding modules | `docs/PERMISSIONS.md` |
| Number cards, dashboard charts, query reports, the ASP workspace | `docs/DASHBOARD.md` |
| CSV export for Tally hand-off | `docs/TALLY_EXPORT.md` |
| Frappe Cloud signup, custom domain, email, fixtures sync, backups | `docs/DEPLOYMENT.md` |
| Pilot, parallel running, training, go-live, rollback | `docs/PILOT_AND_CUTOVER.md` |
| Checking what's locked in | `docs/DECISIONS.md` |
| Checking what's still open | `docs/REQUIREMENTS.md` |
| Evaluating whether to continue with ERPNext after Phase 3 | `docs/GO_NO_GO.md` |
| Looking up an unfamiliar term | `docs/GLOSSARY.md` |
| Looking up canonical prompts for a phase | `docs/PROMPTS.md` |

If a task spans multiple topics (e.g., a print format that depends on custom fields), load both relevant docs.

## Session end protocol

Every session, before ending:

1. Update `docs/STATE.md` with current phase, last completed item, next item, any new blockers.
2. Append to `docs/SESSION_LOG.md` a single entry with: date, tool (Codex), phase, what was completed, what's blocked, what's next.
3. Commit and push all changes (docs + code + fixtures) per the git workflow below.

If the session ended mid-task, `docs/STATE.md` should say so clearly so the next session picks up correctly.

## Git workflow

Codex is expected to run `git add`, `git commit`, and `git push` directly. The remote is GitHub (`origin/main`). Treat git as part of the work, not as an afterthought.

**Commit at logical units, not just at session end.** A logical unit is a chunk you could revert cleanly if it broke. For this project that means:
- Each phase's definition of done = at least one commit.
- Each fixture export = a commit.
- Each meaningful subsection of a phase = a commit.
- Any docs update (`docs/STATE.md`, `docs/SESSION_LOG.md`, topic doc corrections) = a commit, often grouped with the code change that prompted it.

**Commit before any big or risky change.** If you are about to do something that touches many files or has nontrivial chance of going wrong (a sweeping refactor, a fixture re-export across many doctypes, a permission overhaul), commit the current state first. This way a `git reset --hard HEAD` is a safe undo button.

**Push at session end, always.** Even if the session was short and there's nothing to commit, run `git status` to verify nothing is unpushed. The remote is the off-laptop backup.

**Pull at session start if working across machines.** For single-machine solo work, this is unnecessary. If the developer ever works on this from a second machine or a collaborator is added, `git pull --rebase` at the start of every session is mandatory.

**Commit message format.** Short imperative subject line (under 72 chars), optional body for context. Examples:
- `Add custom fields for Customer doctype`
- `Export Sales Invoice naming series fixture`
- `Fix Tax Credit Note print format alignment`
- `Update STATE.md after Phase 2 completion`

Don't be cute. Don't pile multiple unrelated changes into one commit just to clear the queue.

**Never force-push to main.** If a commit needs to be undone after pushing, use `git revert`, not `git push --force`. Force-push destroys history.

**Things that should not be committed.** The `.gitignore` at the repo root catches most of them. If you find yourself adding any of these to git, stop:
- API keys, passwords, tokens, `.env` files, anything resembling a secret
- Database dumps or backup `.sql` files
- Large binary files (compiled assets, video, anything over a few MB) unless they're a required project asset (logo, etc.)
- Local-only Frappe artifacts (the `sites/` directory, log files, the `.bench/` config)

## Hard rules — never violate

These come from `docs/DECISIONS.md` and apply to every line of work.

1. **No edits to ERPNext or Frappe core files.** Anything that would require editing `apps/erpnext/` or `apps/frappe/` is wrong. Find the customization path instead (Custom Field, Property Setter, Client Script, Server Script, Custom App).
2. **All customizations live in the `asp_invoicing` custom app.** Custom fields, naming series, print formats, roles, role profiles, workspaces, reports — all exported as fixtures into the app.
3. **All customizations exported as fixtures (JSON) in the same session.** Configuring something in the UI without exporting it as a fixture means it doesn't survive a fresh install. Treat fixture export as part of the task definition of done.
4. **No multi-tenancy.** One ERPNext site per client. Resale means a fresh deployment, not a tenant on a shared instance.
5. **Junior-dev maintainability over architectural purity.** When two approaches both work, pick the one the developer can debug in 6 months without re-reading framework internals.
6. **Verify before assuming.** If you're not sure whether something is a fixture-exportable customization or requires a core edit, search the Frappe docs or ask. Do not guess and hope.

## Style and tone for docs and code

- Direct, no hedging unless the uncertainty is real and material.
- No marketing language. No "this is awesome" or "robust solution." Plain descriptions of what exists and why.
- Code comments explain *why*, not *what*. The code shows what; the comment is for the reasoning that isn't obvious.
- Markdown docs: short sentences, scannable structure. Headings for navigation. No emoji.
- When asked for an opinion or recommendation, give one. Don't dump a list of options without a preference.

## When you're not sure

- If the user's request seems to contradict a locked decision in `docs/DECISIONS.md`, raise the contradiction before acting. Don't silently override.
- If a task is ambiguous, ask one focused question rather than assuming. Ambiguity in a financial system is expensive.
- If you find yourself wanting to edit ERPNext core, stop. Ask. There's almost always another way.
- If you find a bug in ERPNext itself (not in the custom app), document it in `docs/SESSION_LOG.md` and work around it. Do not patch core.

## Tool-specific notes for Codex

- Codex operates with file editing and shell access in a sandboxed environment.
- Prefer making concrete file changes over describing them. The user is using Codex to get work done, not to receive instructions.
- When generating fixture JSON, run the actual `bench export-fixtures` command in the sandbox if available rather than hand-writing JSON. Hand-written fixtures get out of sync with reality.
- If a shell command would have irreversible side effects (dropping a database, force-pushing to main, deleting backups), confirm with the user before running it.
- When in doubt about a Frappe API, check the Frappe source code in `apps/frappe/` (read-only — never edit).
- If the previous session was Claude Code, the most recent `docs/SESSION_LOG.md` entry will say "Tool: Claude Code". Read it for handoff context, especially any "next" or "blocker" notes.

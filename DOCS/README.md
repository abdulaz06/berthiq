# ASP Invoicing Platform — Documentation

Internal invoicing, billing, payment tracking, receipts, credit notes, and dashboard reporting for ASP Auditing LLC Dubai.

Built on ERPNext (frozen version), packaged as a custom Frappe app named `asp_invoicing`. Hosted on Frappe Cloud.

## Where to start

- **Working with Claude Code or Codex:** read `CLAUDE.md` or `AGENTS.md`. Both contain the routing map for which doc to read for which task.
- **Understanding the project:** read `BLUEPRINT.md` for the executive summary and phase index.
- **Knowing what's locked in:** read `DECISIONS.md`.
- **Knowing what's still open:** read `REQUIREMENTS.md`.
- **Current state of work:** read `STATE.md`.

## Doc index

### Project-level
- `BLUEPRINT.md` — executive summary, phase index, build order
- `DECISIONS.md` — locked decisions with rationale
- `REQUIREMENTS.md` — open questions and information to gather from ASP
- `GO_NO_GO.md` — criteria for continuing with ERPNext after the prototype
- `GLOSSARY.md` — terms used in these docs (Bench, DocType, Workspace, etc.)

### Phase docs (build order specified in `BLUEPRINT.md`)
- `FOUNDATION.md` — ERPNext install, custom app scaffold, company setup
- `DATA_MODEL.md` — custom fields, naming series, chart of accounts, tax templates
- `PRINT_FORMATS.md` — FTA-compliant Tax Invoice, Receipt, Tax Credit Note (Jinja templates)
- `PERMISSIONS.md` — roles, role profiles, workspace shaping, UI hiding
- `DASHBOARD.md` — number cards, charts, query reports, workspace layout
- `TALLY_EXPORT.md` — CSV export specification for ASP's accountant
- `DEPLOYMENT.md` — Frappe Cloud setup, domain, email, branding, backups
- `PILOT_AND_CUTOVER.md` — testing protocol, training, go-live, rollback

### Session management
- `STATE.md` — current phase, last completed item, next item, blockers
- `SESSION_LOG.md` — append-only log of work done per session
- `PROMPTS.md` — phase-by-phase prompts to paste into either tool

> `CLAUDE.md` and `AGENTS.md` live at the **repo root**, not in `docs/`. Both files are auto-loaded by their respective tools at session start, and both point into this `docs/` directory via their routing tables.

## How to use these docs

1. Read `BLUEPRINT.md` once, top to bottom, to understand the whole project.
2. Read `DECISIONS.md` once, so you know what's settled.
3. From then on, only read the doc relevant to whatever phase you're working on. Both Claude Code and Codex are configured to do the same.
4. Before any coding session, glance at `STATE.md` to know where you left off.
5. After any coding session, update `STATE.md` and append to `SESSION_LOG.md`.

## Repository structure

These docs live under `docs/` at the root of the `asp_invoicing` repository. The custom app code (when written) lives under `asp_invoicing/` at the same level. The repository is hosted privately on GitHub and connected to Frappe Cloud for deployment.

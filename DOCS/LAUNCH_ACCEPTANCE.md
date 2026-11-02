# Portfolio acceptance record

Final verification: November 2, 2026. This records local/CI acceptance,
**not a public deployment**.
The original maritime references guide the dark map, calm panel hierarchy, turquoise
signals, restrained typography and dedicated mobile navigation. Changes in the
final pass address observed defects rather than replace the established design.

| Requirement | Evidence / state |
| --- | --- |
| Select → validate → discover → risk → scenario → optimize → simulate → compare → export | Real PostgreSQL-backed Playwright journey and backend API tests |
| Deterministic data and prefix boundary | Generator hashes, model chronological evaluation, future-event poisoning tests |
| Hard constraints and tradeoffs | Independent solver checks, infeasible-lock tests, matched simulations and full costs |
| Historical simulator validation | Eight fixed cutoffs, all failures included; limitations in SIMULATOR_VALIDATION.md |
| Private/bounded public writes | Per-tab owner tokens, immutable built-in data, quotas, input bounds and disabled-by-default uploads |
| Timeout/recovery | Process kill/reap, child watchdog, capacity recovery and durable restart tests |
| Production release/start | Migration + insert-only seed + real serve.py readiness/CORS test in disposable PostgreSQL |
| Native Windows workflow | Direct-argv just dev served frontend/API; doctor verified Python 3.12 native imports and model |
| Dependency security | pip-audit and runtime npm audit: no findings; full npm tree has one narrowly reviewed legacy dev-only advisory exception in DEPENDENCY_SECURITY.md |
| Backend checks | Ruff, mypy (43 app files), 108 tests passed on disposable PostgreSQL, no skips |
| Frontend checks | ESLint, TypeScript, 21 unit tests, provenance and production build |
| Real browser acceptance | Nine tests including desktop/mobile, upload isolation, tile failure, full decision loop and keyboard access |
| Automated accessibility | axe WCAG A/AA checks across homepage, case study and all console views at both target sizes |
| Documentation/presentation | Current README, architecture/lifecycle diagrams, case study, screenshots, OG image and GitHub description/topics |
| Deployment configuration | Production preflight, environment/release instructions and illustrative systemd units; no host provisioned |

## Visual review

Reviewed 1920×1080 desktop and 390×844 mobile screenshots in `DOCS/media`:
landing, port map/detail panel, risk detail, process explorer, Scenario Studio,
simulation comparison, dataset workspace and case study. Final corrections include
larger mobile distribution labels, clearer data-section hierarchy, sufficient
secondary text contrast and underlined map attribution links. The map remains
immersive; selection and replay work with external geography or a local fallback.
Source attribution and synthetic/simulated disclosures remain visible.

Keyboard review covers skip links, selecting a vessel, focus entering the detail
panel, Escape dismissal, return to the marker after MapLibre updates, and tour
dismissal. Native form labels and visible focus remain available. Automated checks
do not replace manual assistive-technology testing or constitute WCAG certification.

## Deliberately unresolved

- **Licensing:** Abdul chose to keep licensing pending. PM4Py's AGPL dependency and
  the absence of a project license remain an explicit public-launch blocker.
  Shravani's consent is not assumed; no project license is added.
- **Public hosting:** prohibited for this sprint. No provider, payment or live URL
  has been provisioned or verified. HTTPS, proxy limits, backup restore, host-level
  memory/process limits and live-URL acceptance await an authorized environment.
  The systemd examples are not validated on this Windows host.
- **Model scope:** synthetic data only. Timing intervals under-cover historical
  outcomes; one historical berth conflicts with current terminal policy. No
  calibrated arrival forecast, external validation or real-world saving is claimed.
- **Demo scope:** a single API instance and per-tab tokens, not enterprise identity,
  multi-replica workers, confidential-upload hosting or live AIS.

All non-blocked implementation criteria are complete. Final delivery is recorded
in [PR #11](https://github.com/abdulaz06/berthiq/pull/11); the implementation passed
all six push/PR CI checks. The next consequential step is the owner's
licensing/hosting decision. Do not deploy or change licensing to satisfy a checkbox.
Research calibration and broader assistive-technology testing can be undertaken
separately without changing the honesty of the current portfolio demonstration.

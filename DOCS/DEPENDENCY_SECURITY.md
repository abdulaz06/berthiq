# Dependency security review — November 2, 2026

Python dependency audit has no known findings. npm's raw audit reports development
dependency alerts; it must not be described as clean. Runtime-only npm audit and
the reviewed full-tree policy are separate checks.

[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), published
in the GitHub advisory database October 30, describes amplification in minimatch's
`firstPhasePreProcess` when `optimizationLevel >= 2`. Its affected range labels
all releases below 11.0.1. The installed modern 10.2.6 copy is replaced with pinned
11.0.4 through a scoped override; frontend checks validate that consumer.

The installed 3.1.5 and 5.1.9 implementations have neither that preprocessing
function nor the optimizationLevel option (inspected in their installed sources).
ESLint/plugins and OpenAPI tooling still require these legacy APIs. Glob patterns
are trusted repository configuration, not user uploads or HTTP input. Forcing all
copies to v11 breaks legacy callable exports; npm's suggested ESLint downgrade
is incompatible with this application.

`npm run audit:security` runs a fresh complete npm audit and permits only this
exact advisory on those two exact versions marked development-only in the lock.
Every other advisory, affected modern version, production copy, missing report or
network failure fails. Policy tests verify those failure paths. This is a reviewed
exception, not a vulnerability fix or a blanket severity exemption. Remove the
exception when upstream consumers migrate or the advisory range is corrected.

CI also runs `npm audit --omit=dev --audit-level=low`. Review this exception on
every dependency update. No untrusted repository should be linted or have its
configuration executed without the usual isolation for contributor code.

# Historical simulator validation

Reproduce offline with `backend/.venv/Scripts/python.exe backend/scripts/validate_simulator.py`
(use `.venv/bin/python` on macOS/Linux). No database is modified and no model is
trained. The machine-readable result, including every scored case, failure and
assumption, is committed in [SIMULATOR_VALIDATION.json](SIMULATOR_VALIDATION.json).

The experiment freezes eight weekly observation cutoffs in the seeded synthetic
history, from June 5 through July 24, 2026. Only Events completed by each cutoff
enter `build_input`; generator Case summaries and hidden truth are used only by
the offline scorer. Twenty no-change replications use seeds 20260601–20260620 and
the same 168-hour horizon. Forecast cargo-start times are scored against the
generator's actual later cargo-start timestamps. Tests poison/remove future
events and verify that forecasts remain identical.

| Cutoff | Scored active calls | Median forecast MAE (hours) | p10–p90 coverage |
| --- | ---: | ---: | ---: |
| June 5 | 6 | 9.30 | 66.7% |
| June 12 | 2 | 2.01 | 50.0% |
| June 19 | 1 | 7.88 | 0.0% |
| June 26 | — | No feasible no-change plan | — |
| July 3 | 4 | 7.38 | 0.0% |
| July 10 | 3 | 2.24 | 0.0% |
| July 17 | 2 | 0.02 | 100.0% |
| July 24 | 4 | 5.46 | 25.0% |

There are 22 scored call/cutoff observations across seven successful windows.
The eighth window is included in the denominator: KHL-0487's historical KBT-1
assignment is incompatible with the current general-cargo terminal rule. The
preserved generator permits non-container vessels at bulk or general terminals;
the decision engine applies stricter vessel-type compatibility. The validation
does not quietly relax constraints, change the historical dataset, or discard
this failure. A future generator/version revision should reconcile this policy.

The low and variable coverage means p10–p90 ranges **are not calibrated predictive
intervals**. They describe variability under the simulator's assumptions. The
generator and forecast also have different dispatch, occupancy, rework and review
policies. Small samples and repeated calls across cutoffs prevent strong aggregate
claims. The report includes deterministic-plan errors as a comparator and retains
all failed replication records (none in the seven forecastable windows).

Investigation of individual traces identifies concrete sources of mismatch:
KHL-0423 (June 5) has two held-out authority rejections and an additional
completeness-return loop; its actual cargo start is 43.15 hours after cutoff,
versus a simulated median of 14.98 hours. KHL-0513 (July 3) has another held-out
rejection/completeness loop after an already observed rejection, giving 35.84
versus 14.77 hours. The simulator's observable missing-document proxy, capped
review attempts and simplified document-return durations do not reproduce the
generator's hidden completeness mechanism. Conversely KHL-0577 (July 24) was
already being reviewed at midnight, but the completion-only prefix cannot reveal
that unfinished event. Starting a new full review overstates its remaining work:
15.44 simulated versus 5.77 historical hours. Reading its future completion record
to recover the earlier start would leak information, so the evaluation does not.
These mechanisms explain errors in both directions; widening intervals to hit a
coverage target on these same samples would not establish out-of-sample calibration.

This is a reproducible baseline timing check, not external validation of a real
port or proof of causal staffing savings. It does not validate the counterfactual
response to adding staff against a separate generator intervention. Calibration,
policy reconciliation and external data validation remain open research work.
No hidden generator labels enter application features, CP-SAT or SimPy.

The reference five-reviewer experiment remains separately recorded in
[REFERENCE_EVALUATION.json](REFERENCE_EVALUATION.json): simulated mean waiting
62.874→45.067 hours, compliance 0→0%, conflicts 0→0, staffed reviewer hours
252→420. The waiting difference costs more staffing; it is not a measured saving.

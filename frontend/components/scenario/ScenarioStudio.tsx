"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Download,
  FlaskConical,
  Play,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import type { components } from "@/lib/types/api";
import type {
  JobStatus,
  OptimizationResult,
  SimulationResult,
} from "@/lib/api/contracts";
import { awaitJob, sessionRequest } from "@/lib/api/session";
import { portTime, type Operations } from "@/lib/operations";
import { ProvenanceBadge } from "@/components/provenance/ProvenanceBadge";
import DistributionCompare from "./DistributionCompare";
import BerthSchedule from "@/components/gantt/BerthSchedule";

const PortMap = dynamic(() => import("@/components/map/PortMap"), {
  ssr: false,
});
type Record = components["schemas"]["ScenarioRecord"];
type Weights = components["schemas"]["ObjectiveWeights"];
type Export = {
  scenario: Record;
  runs: { kind: string; result: OptimizationResult | SimulationResult }[];
};
const initialWeights: Weights = {
  waiting_time: 1,
  tardiness: 4,
  reviewer_overtime: 2,
  workload_imbalance: 0.1,
  plan_changes: 30,
};
const label = (value: string) => value.replaceAll("_", " ");
const fmt = (value: number) =>
  value.toLocaleString("en-GB", { maximumFractionDigits: 2 });

export default function ScenarioStudio({
  data,
  enabled,
  selected,
  onSelect,
}: {
  data: Operations;
  enabled: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [name, setName] = useState("Khalifa · capacity study");
  const [reviewers, setReviewers] = useState(5);
  const [horizon, setHorizon] = useState(168);
  const [weights, setWeights] = useState(initialWeights);
  const [locked, setLocked] = useState<{ [id: string]: string }>({});
  const [priorities, setPriorities] = useState<string[]>([]);
  const [closure, setClosure] = useState("");
  const [closureHours, setClosureHours] = useState(12);
  const [seed, setSeed] = useState(20260601);
  const [replications, setReplications] = useState(20);
  const [saved, setSaved] = useState<Record[]>([]);
  const [scenario, setScenario] = useState<Record | null>(null);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(
    null,
  );
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState<JobStatus | null>(null);
  const [replayMode, setReplayMode] = useState<"plan" | "simulation">("plan");
  const [chosenBerth, setChosenBerth] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<"optimized" | "fifo">("optimized");
  const [clock, setClock] = useState(Date.parse(data.clock_end));
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    sessionRequest<Record[]>("/api/scenarios")
      .then(
        (rows) =>
          active &&
          setSaved(rows.filter((r) => r.spec.dataset_id === data.dataset_id)),
      )
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [enabled, data.dataset_id]);

  async function run(kind: "optimize" | "simulate") {
    const c = new AbortController();
    controller.current = c;
    setBusy(kind);
    setError("");
    setJob(null);
    try {
      if (kind === "optimize") {
        const created = await sessionRequest<Record>(
          "/api/scenarios",
          "POST",
          {
            dataset_id: data.dataset_id,
            name,
            constraints: {
              reviewer_count: reviewers,
              horizon_hours: horizon,
              locked_berths: locked,
              priority_vessels: priorities,
              berth_closures: closure
                ? [
                    {
                      berth: closure,
                      start: data.clock_end,
                      end: new Date(
                        Date.parse(data.clock_end) + closureHours * 3600000,
                      ).toISOString(),
                    },
                  ]
                : [],
            },
            objective_weights: weights,
          },
          c.signal,
        );
        setScenario(created);
        setSaved((rows) => [created, ...rows]);
        setOptimization(null);
        setSimulation(null);
        setReplayMode("plan");
        const queued = await sessionRequest<JobStatus>(
          `/api/scenarios/${created.id}/optimize`,
          "POST",
          undefined,
          c.signal,
        );
        const id = await awaitJob(queued, setJob, c.signal);
        setOptimization(
          await sessionRequest<OptimizationResult>(
            `/api/optimization/${id}`,
            "GET",
            undefined,
            c.signal,
          ),
        );
        setClock(Date.parse(data.clock_end));
      } else if (scenario && optimization) {
        const queued = await sessionRequest<JobStatus>(
          `/api/scenarios/${scenario.id}/simulate`,
          "POST",
          { optimization_run_id: optimization.run_id, seed, replications },
          c.signal,
        );
        const id = await awaitJob(queued, setJob, c.signal);
        setSimulation(
          await sessionRequest<SimulationResult>(
            `/api/simulation/${id}`,
            "GET",
            undefined,
            c.signal,
          ),
        );
        setReplayMode("simulation");
      }
    } catch (e) {
      if (!c.signal.aborted) setError((e as Error).message);
    } finally {
      if (!c.signal.aborted) setBusy("");
    }
  }
  async function load(id: string) {
    if (!id) return;
    setBusy("load");
    setError("");
    try {
      const payload = await sessionRequest<Export>(
        `/api/scenarios/${id}/export`,
      );
      setScenario(payload.scenario);
      const spec = payload.scenario.spec;
      setName(spec.name);
      setReviewers(spec.constraints?.reviewer_count ?? 5);
      setHorizon(spec.constraints?.horizon_hours ?? 168);
      setWeights(spec.objective_weights ?? initialWeights);
      setLocked(spec.constraints?.locked_berths ?? {});
      setPriorities(spec.constraints?.priority_vessels ?? []);
      const savedClosure = spec.constraints?.berth_closures?.[0];
      setClosure(savedClosure?.berth ?? "");
      setClosureHours(
        savedClosure
          ? (Date.parse(savedClosure.end) - Date.parse(savedClosure.start)) /
              3600000
          : 12,
      );
      setReplayMode(
        payload.runs.some((r) => r.kind === "simulation")
          ? "simulation"
          : "plan",
      );
      setOptimization(
        ([...payload.runs].reverse().find((r) => r.kind === "optimization")
          ?.result as OptimizationResult) ?? null,
      );
      setSimulation(
        ([...payload.runs].reverse().find((r) => r.kind === "simulation")
          ?.result as SimulationResult) ?? null,
      );
      setClock(Date.parse(data.clock_end));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function download() {
    if (!scenario) return;
    try {
      const payload = await sessionRequest<Export>(
        `/api/scenarios/${scenario.id}/export`,
      );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `berthiq-scenario-${scenario.id}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const feasible =
    optimization &&
    ["FEASIBLE", "OPTIMAL"].includes(optimization.solver_status);
  const simulatedReplay = replayMode === "simulation" && !!simulation;
  const proposed = simulatedReplay
    ? (simulation.optimized_schedule ?? [])
    : (optimization?.assignments ?? []);
  const baseline = simulatedReplay
    ? (simulation.baseline_schedule ?? [])
    : (optimization?.baselines?.fifo ?? []);
  const assignments = schedule === "optimized" ? proposed : baseline;
  const selectedAssignment = assignments.find((a) => a.vessel === selected);
  const end = Math.max(
    Date.parse(data.clock_end) + 3600000,
    ...[...baseline, ...proposed].map((a) => Date.parse(a.end ?? a.start)),
  );
  const calls = data.vessels.filter(
    (v) => !v.events.some((e) => e.activity === "Berthed, cargo start"),
  );
  return (
    <section className="studio">
      <div className="analysis-header">
        <div>
          <span className="eyebrow">MAKE THE TRADEOFF VISIBLE</span>
          <h2>Scenario Studio</h2>
          <p>A saved snapshot. A constrained plan. A matched simulation.</p>
        </div>
        <div className="saved-select">
          <Save size={15} />
          <select
            aria-label="Load saved scenario"
            value={scenario?.id ?? ""}
            onChange={(e) => void load(e.target.value)}
            disabled={!!busy}
          >
            <option value="">Saved studies in this session</option>
            {saved.map((s) => (
              <option key={s.id} value={s.id}>
                {s.spec.name} · #{s.id}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}
      <div className="studio-layout">
        <form
          className="analysis-card scenario-controls"
          onSubmit={(e) => {
            e.preventDefault();
            void run("optimize");
          }}
        >
          <div className="section-heading">
            <h3>
              <SlidersHorizontal size={18} /> Shape the plan
            </h3>
            <span className="eyebrow">01 / CONFIGURE</span>
          </div>
          <fieldset disabled={!!busy}>
            <label>
              Study name
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="field-pair">
              <label>
                Reviewers
                <select
                  aria-label="Reviewer count"
                  value={reviewers}
                  onChange={(e) => setReviewers(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Horizon (hours)
                <input
                  type="number"
                  min={12}
                  max={336}
                  value={horizon}
                  onChange={(e) => setHorizon(Number(e.target.value))}
                />
              </label>
            </div>
            <p className="form-hint">
              Approval, berth compatibility, pilot capacity and existing
              commitments remain hard constraints.
            </p>
            <details>
              <summary>Objective weights</summary>
              <div className="weight-fields">
                {Object.entries(weights).map(([key, value]) => (
                  <label key={key}>
                    {label(key)}
                    <input
                      aria-label={`${label(key)} weight`}
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={value}
                      onChange={(e) =>
                        setWeights((w) => ({
                          ...w,
                          [key]: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            </details>
            <details>
              <summary>Berth closure</summary>
              <label>
                Close berth
                <select
                  value={closure}
                  onChange={(e) => setClosure(e.target.value)}
                >
                  <option value="">No closure</option>
                  {data.berths.map((b) => (
                    <option key={b.id}>{b.id}</option>
                  ))}
                </select>
              </label>
              {closure && (
                <label>
                  Hours from observation cutoff
                  <input
                    type="number"
                    min={1}
                    max={336}
                    value={closureHours}
                    onChange={(e) => setClosureHours(Number(e.target.value))}
                  />
                </label>
              )}
            </details>
            <details>
              <summary>Priorities & berth locks</summary>
              <div className="lock-list">
                {calls.map((v) => (
                  <div key={v.case_id}>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={priorities.includes(v.case_id)}
                        onChange={(e) =>
                          setPriorities((p) =>
                            e.target.checked
                              ? [...p, v.case_id]
                              : p.filter((id) => id !== v.case_id),
                          )
                        }
                      />
                      {v.case_id}
                    </label>
                    <select
                      aria-label={`Lock berth for ${v.case_id}`}
                      value={locked[v.case_id] ?? ""}
                      onChange={(e) =>
                        setLocked((l) => {
                          const next = { ...l };
                          if (e.target.value) next[v.case_id] = e.target.value;
                          else delete next[v.case_id];
                          return next;
                        })
                      }
                    >
                      <option value="">Solver chooses</option>
                      {data.berths.map((b) => (
                        <option key={b.id}>{b.id}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </details>
            <button className="primary run-button" type="submit">
              <Play size={16} />
              {busy === "optimize"
                ? "Finding a feasible plan…"
                : "Save & optimize"}
            </button>
            <p className="form-hint">
              Private to this browser tab. Saved studies expire after 24 hours.
              Each new solve creates a snapshot.
            </p>
          </fieldset>
        </form>
        <div className="studio-output">
          {busy && (
            <div className="job-progress" role="status">
              <i />
              <strong>
                {busy === "load"
                  ? "Restoring saved evidence"
                  : busy === "optimize"
                    ? "Solving reviewer and berth assignments"
                    : "Running matched replications"}
              </strong>
              <span>{job?.status ?? "Preparing inputs"}</span>
            </div>
          )}
          {!optimization ? (
            <section className="analysis-card studio-intro">
              <FlaskConical size={48} strokeWidth={1} />
              <span className="eyebrow">A COUNTERFACTUAL, NOT A PROMISE</span>
              <h3>What would you change?</h3>
              <p>
                Adjust reviewer capacity, protect a berth commitment, or test a
                closure. BerthIQ will show the feasible schedule and the cost of
                that decision.
              </p>
              <ol>
                <li>Configure constraints</li>
                <li>Inspect the proposed plan</li>
                <li>Compare matched simulations</li>
              </ol>
              <p className="form-hint">
                Synthetic operational data. Simulated outcomes are not measured
                savings.
              </p>
            </section>
          ) : (
            <>
              <section className="analysis-card result-summary">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">
                      02 / PROPOSED PLAN · SAVED #{scenario?.id}
                    </span>
                    <h3>{scenario?.spec.name}</h3>
                  </div>
                  <span
                    className={`solver-status ${feasible ? "seafoam" : "coral-text"}`}
                    data-testid="solver-status"
                  >
                    {optimization.solver_status}
                  </span>
                </div>
                <p className="result-narrative">{optimization.narrative}</p>
                <div className="result-metrics">
                  <div>
                    <span>Weighted objective</span>
                    <strong>
                      {optimization.objective_value === null
                        ? "—"
                        : fmt(optimization.objective_value)}
                    </strong>
                    <ProvenanceBadge provenance="optimized" />
                  </div>
                  <div>
                    <span>Changed assignments</span>
                    <strong>{optimization.changed_decisions.length}</strong>
                    <ProvenanceBadge provenance="optimized" />
                  </div>
                  <div>
                    <span>Proposed calls</span>
                    <strong>{optimization.assignments.length}</strong>
                    <ProvenanceBadge provenance="optimized" />
                  </div>
                </div>
                {!feasible && (
                  <div className="notice">
                    {optimization.solver_status === "UNKNOWN"
                      ? "The solver reached its limit without a feasible plan. This does not prove infeasibility."
                      : "These constraints cannot produce a feasible schedule."}
                    {optimization.infeasibility?.map((c, i) => (
                      <p key={i}>
                        {c.kind}: {c.detail}
                      </p>
                    ))}
                  </div>
                )}
                <details>
                  <summary>Constraint checks & assumptions</summary>
                  <ul className="evidence-list">
                    {Object.entries(optimization.constraint_checks ?? {}).map(
                      ([key, value]) => (
                        <li key={key}>
                          {value ? "✓" : "✕"} {label(key)}
                        </li>
                      ),
                    )}
                    {optimization.assumptions?.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </details>
                <details>
                  <summary>Objective terms & baseline scores</summary>
                  <div className="evidence-pairs">
                    {Object.entries({
                      ...optimization.objective_terms,
                      ...optimization.baseline_objectives,
                    }).map(([key, value]) => (
                      <div key={key}>
                        <span>{label(key)}</span>
                        <strong>
                          {value === null ? "Infeasible" : fmt(value)}{" "}
                          <ProvenanceBadge provenance="optimized" />
                        </strong>
                      </div>
                    ))}
                  </div>
                </details>
              </section>
              {feasible && (
                <>
                  <section className="analysis-card">
                    <BerthSchedule
                      assignments={proposed}
                      comparison={baseline}
                      simulated={simulatedReplay}
                      selected={selected}
                      onSelect={onSelect}
                    />
                  </section>
                  <section className="analysis-card plan-comparison">
                    <div className="section-heading">
                      <div>
                        <h3>Synchronized plan comparison</h3>
                        <p>
                          {simulatedReplay
                            ? "First matched replication. Shared clock, sampled service and rework."
                            : "Same candidate staffing. FIFO heuristic versus CP-SAT plan. Positions represent reserved berth occupancy."}
                        </p>
                      </div>
                      <ProvenanceBadge
                        provenance={simulatedReplay ? "simulated" : "optimized"}
                      />
                    </div>
                    {simulation && (
                      <label className="replay-select">
                        Compare
                        <select
                          aria-label="Comparison source"
                          value={replayMode}
                          onChange={(e) =>
                            setReplayMode(
                              e.target.value as "plan" | "simulation",
                            )
                          }
                        >
                          <option value="plan">
                            Deterministic plans · candidate staffing
                          </option>
                          <option value="simulation">
                            Matched simulation · first replication
                          </option>
                        </select>
                      </label>
                    )}
                    <div className="comparison-toolbar">
                      <div className="segmented">
                        <button
                          className={schedule === "fifo" ? "active" : ""}
                          onClick={() => setSchedule("fifo")}
                        >
                          {simulatedReplay
                            ? "No-change baseline"
                            : "FIFO baseline"}
                        </button>
                        <button
                          className={schedule === "optimized" ? "active" : ""}
                          onClick={() => setSchedule("optimized")}
                        >
                          Proposed plan
                        </button>
                      </div>
                      <time>{portTime(clock)} GST</time>
                    </div>
                    <PortMap
                      data={data}
                      clock={clock}
                      risk={null}
                      selected={selected}
                      onSelect={onSelect}
                      onBerth={setChosenBerth}
                      showRisk={false}
                      plan={assignments}
                      simulatedPlan={simulatedReplay}
                    />
                    {chosenBerth && (
                      <p className="form-hint">
                        {data.berths.find((b) => b.id === chosenBerth)?.name} ·{" "}
                        {
                          data.berths.find((b) => b.id === chosenBerth)
                            ?.length_m
                        }{" "}
                        m length limit ·{" "}
                        {data.berths.find((b) => b.id === chosenBerth)?.draft_m}{" "}
                        m draft limit. Configured, approximate berth.
                      </p>
                    )}
                    <input
                      className="plan-clock"
                      aria-label="Comparison clock"
                      type="range"
                      min={Date.parse(data.clock_end)}
                      max={end}
                      step={60000}
                      value={clock}
                      onChange={(e) => setClock(Number(e.target.value))}
                    />
                    {selectedAssignment && (
                      <div className="assignment-detail">
                        <strong>
                          {selectedAssignment.vessel} →{" "}
                          {selectedAssignment.berth}
                        </strong>
                        <span>
                          Reserved: {portTime(selectedAssignment.start)} —{" "}
                          {portTime(
                            selectedAssignment.end ?? selectedAssignment.start,
                          )}{" "}
                          GST
                        </span>
                        <span>
                          Reviewer:{" "}
                          {selectedAssignment.reviewer ?? "Already approved"}
                        </span>
                      </div>
                    )}
                  </section>
                  <section className="analysis-card simulation-controls">
                    <div>
                      <span className="eyebrow">03 / TEST THE PLAN</span>
                      <h3>Matched simulation</h3>
                      <p>
                        Baseline and proposal share the same per-case random
                        draws. Results include uncertainty and staffing costs.
                      </p>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run("simulate");
                      }}
                    >
                      <fieldset disabled={!!busy}>
                        <label>
                          Seed
                          <input
                            aria-label="Simulation seed"
                            type="number"
                            min={0}
                            max={2147483548}
                            value={seed}
                            onChange={(e) => setSeed(Number(e.target.value))}
                          />
                        </label>
                        <label>
                          Replications
                          <input
                            aria-label="Replications"
                            type="number"
                            min={2}
                            max={50}
                            value={replications}
                            onChange={(e) =>
                              setReplications(Number(e.target.value))
                            }
                          />
                        </label>
                        <button type="submit" className="primary">
                          <FlaskConical size={16} />
                          {busy === "simulate"
                            ? "Simulating…"
                            : "Simulate comparison"}
                        </button>
                      </fieldset>
                    </form>
                  </section>
                </>
              )}
              {simulation && (
                <section
                  className="analysis-card simulation-results"
                  data-testid="simulation-results"
                >
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">04 / OUTCOMES & COSTS</span>
                      <h3>What changes. What it costs.</h3>
                      <p>
                        {simulation.replications} matched replications · seed{" "}
                        {simulation.seed} · synthetic operations
                      </p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => void download()}
                    >
                      <Download size={16} /> Export evidence
                    </button>
                  </div>
                  <div className="comparison-kpis">
                    {Object.entries({
                      ...simulation.headline,
                      ...simulation.tradeoffs,
                    }).map(([key, [before, after]]) => (
                      <article key={key}>
                        <div className="metric-label">
                          {label(key)}
                          <ProvenanceBadge provenance="simulated" />
                        </div>
                        <div className="comparison-values">
                          <span>{fmt(before.value)}</span>
                          <ArrowRight size={16} />
                          <strong>{fmt(after.value)}</strong>
                          <small>{after.unit}</small>
                        </div>
                        <p>
                          Change: {after.value - before.value > 0 ? "+" : ""}
                          {fmt(after.value - before.value)} {after.unit}
                        </p>
                      </article>
                    ))}
                  </div>
                  <h4>Replication distributions</h4>
                  <p className="form-hint">
                    No-change baseline retains the original staffing; the
                    proposal uses the saved scenario. Dots show means; whiskers
                    show p10–p90 simulation variability, not calibrated arrival
                    confidence or measured savings.
                  </p>
                  <div className="distribution-charts">
                    {simulation.baseline.map((b) => {
                      const a = simulation.optimized.find(
                        (d) => d.name === b.name,
                      );
                      return a ? (
                        <DistributionCompare
                          key={b.name}
                          before={b}
                          after={a}
                        />
                      ) : null;
                    })}
                  </div>
                  <div className="distribution-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Metric / unit</th>
                          <th>No-change mean [p10, p90]</th>
                          <th>Proposed mean [p10, p90]</th>
                        </tr>
                      </thead>
                      <tbody>
                        {simulation.baseline.map((b) => {
                          const a = simulation.optimized.find(
                            (v) => v.name === b.name,
                          );
                          return (
                            <tr key={b.name}>
                              <th>
                                {label(b.name)}
                                <small>
                                  {b.unit} ·{" "}
                                  <ProvenanceBadge provenance="simulated" />
                                </small>
                              </th>
                              <td>
                                {fmt(b.mean)} [{fmt(b.p10)}, {fmt(b.p90)}]
                              </td>
                              <td>
                                {a &&
                                  `${fmt(a.mean)} [${fmt(a.p10)}, ${fmt(a.p90)}]`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="form-hint">
                    p10–p90 describes variability across replications, not a
                    confidence interval. Some calls are already late at the
                    observation cutoff; additional resources cannot undo that
                    lateness.
                  </p>
                  <details>
                    <summary>Simulation assumptions</summary>
                    <ul className="evidence-list">
                      {simulation.assumptions?.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </details>
                </section>
              )}
              {!simulation && scenario && (
                <button className="secondary" onClick={() => void download()}>
                  <Download size={16} /> Export saved evidence
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

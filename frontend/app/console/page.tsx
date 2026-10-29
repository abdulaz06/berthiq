"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Anchor,
  Database,
  HelpCircle,
  ArrowUpRight,
  Activity,
  GitBranch,
  FlaskConical,
  ChevronRight,
  Compass,
  Maximize2,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Search,
  Ship,
  Waves,
  X,
} from "lucide-react";
import { sessionRequest } from "@/lib/api/session";
import DatasetManager from "@/components/datasets/DatasetManager";
import type { DatasetSummary } from "@/lib/api/contracts";
import {
  portTime,
  vesselState,
  type Operations,
  type Risk,
} from "@/lib/operations";
import { ProvenanceBadge } from "@/components/provenance/ProvenanceBadge";
import "./console.css";
import "./analysis.css";
import ScenarioStudio from "@/components/scenario/ScenarioStudio";
const ProcessExplorer = dynamic(
  () => import("@/components/process/ProcessExplorer"),
  { ssr: false },
);

const PortMap = dynamic(() => import("@/components/map/PortMap"), {
  ssr: false,
  loading: () => <div className="map-loading">Preparing harbor chart…</div>,
});
type View = "port" | "risk" | "events" | "process" | "studio" | "data";

export default function ConsolePage() {
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [dataset, setDataset] = useState("");
  const [data, setData] = useState<Operations | null>(null);
  const [risk, setRisk] = useState<Risk | null>(null);
  const [error, setError] = useState("");
  const [riskError, setRiskError] = useState("");
  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [selected, setSelected] = useState<string | null>(null);
  const [berth, setBerth] = useState<string | null>(null);
  const [view, setView] = useState<View>("port");
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState(false);
  const [showRisk, setShowRisk] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [tour, setTour] = useState<number | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("tour")) setTour(0);
  }, []);
  const steps = [
    {
      view: "port",
      title: "Read the harbor",
      body: "Select a vessel for its observed events and predicted risk. Scrub the clock to replay the last 48 hours.",
    },
    {
      view: "process",
      title: "Find the bottleneck",
      body: "The graph is discovered from canonical events. Select Authority review to inspect its transitions and rework.",
    },
    {
      view: "risk",
      title: "Inspect the prediction",
      body: "Choose a high-risk call to see signed SHAP contributions. The model is trained on synthetic examples; explanations are not causal.",
    },
    {
      view: "studio",
      title: "Test a different plan",
      body: "Start with five reviewers. Save & optimize, inspect constraints and the berth schedule, then run the matched simulation.",
    },
    {
      view: "studio",
      title: "Compare the whole outcome",
      body: "Read waiting time alongside compliance, conflicts and staffing cost. Switch the comparison source to see the first matched replication, then export the evidence.",
    },
  ] as const;
  const synthetic =
    datasets.find((d) => d.id === dataset)?.source !== "uploaded";
  useEffect(() => {
    let active = true;
    sessionRequest<DatasetSummary[]>("/api/datasets")
      .then((list) => {
        if (!active) return;
        const ready = list.filter((d) => d.status === "ready");
        setDatasets(ready);
        setDataset(ready[0]?.id ?? "");
        if (!ready.length)
          setError(
            "No ready datasets are available. The server needs its demo seed.",
          );
      })
      .catch(
        () =>
          active &&
          setError("The operations server is unavailable. Retry in a moment."),
      );
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (!dataset) return;
    let active = true;
    setData(null);
    setRisk(null);
    setError("");
    setRiskError("");
    setPlaying(false);
    sessionRequest<Operations>(`/api/datasets/${dataset}/operations`)
      .then((result) => {
        if (!active) return;
        setData(result);
        setClock(Date.parse(result.clock_end));
        setSelected(null);
        setBerth(null);
      })
      .catch(
        () =>
          active &&
          setError(
            "Operational data could not be loaded. Retry the connection.",
          ),
      );
    sessionRequest<Risk>(`/api/datasets/${dataset}/risk`)
      .then((result) => active && setRisk(result))
      .catch(
        () =>
          active &&
          setRiskError(
            "Risk model unavailable. Operational replay remains available.",
          ),
      );
    return () => {
      active = false;
    };
  }, [dataset, attempt]);
  useEffect(() => {
    if (!playing || !data) return;
    const timer = setInterval(
      () =>
        setClock((current) =>
          Math.min(Date.parse(data.clock_end), current + speed * 60_000),
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, [playing, data, speed]);
  useEffect(() => {
    if (data && clock >= Date.parse(data.clock_end)) setPlaying(false);
  }, [clock, data]);
  const selectVessel = useCallback((id: string) => {
    setSelected(id);
    setBerth(null);
  }, []);
  const selectBerth = useCallback((id: string) => {
    setBerth(id);
    setSelected(null);
  }, []);
  const vessel = data?.vessels.find((v) => v.case_id === selected);
  const chosenBerth = data?.berths.find((b) => b.id === berth);
  const score = risk?.cases.find((c) => c.case_id === selected);
  const vessels = useMemo(
    () =>
      data?.vessels.filter(
        (v) =>
          v.case_id.toLowerCase().includes(search.toLowerCase()) ||
          v.vessel_type.includes(search.toLowerCase()),
      ) ?? [],
    [data, search],
  );
  const visible = vessels.filter(
    (v) =>
      !["Expected", "Released"].includes(
        vesselState(v, clock, data?.occupancy_assumption_minutes ?? 420).phase,
      ),
  );
  const events = useMemo(
    () =>
      data?.vessels
        .flatMap((v) => v.events)
        .filter((e) => Date.parse(e.end) <= clock)
        .sort((a, b) => Date.parse(b.end) - Date.parse(a.end))
        .slice(0, 30) ?? [],
    [data, clock],
  );
  const atBerth =
    data?.vessels.filter(
      (v) =>
        vesselState(v, clock, data.occupancy_assumption_minutes).phase ===
        "At berth",
    ).length ?? 0;
  const riskCases = [...(risk?.cases ?? [])]
    .filter(
      (c) =>
        c.case_id.toLowerCase().includes(search.toLowerCase()) ||
        (c.vessel_type ?? "").toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => b.miss_probability - a.miss_probability);
  return (
    <main className={`harbor ${focus ? "focus-mode" : ""}`}>
      <nav className="rail" aria-label="Workspace navigation">
        <Link href="/" className="brand-mark" aria-label="BerthIQ home">
          <Waves />
        </Link>
        {(
          [
            ["port", Compass, "Port"],
            ["risk", Activity, "Risk"],
            ["events", Radio, "Events"],
            ["process", GitBranch, "Process"],
            ["studio", FlaskConical, "Studio"],
            ["data", Database, "Data"],
          ] as const
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            aria-current={view === id ? "page" : undefined}
            className={view === id ? "active" : ""}
            onClick={() => setView(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
        <span className="rail-end">
          KHL
          <br />
          UAE
        </span>
      </nav>
      <div className="workspace">
        <header className="console-header">
          <div className="wordmark">
            Berth<span>IQ</span>
            <small>OPERATIONS INTELLIGENCE</small>
          </div>
          <label className="dataset-select">
            <span>WORKSPACE</span>
            <select
              aria-label="Select dataset"
              value={dataset}
              onChange={(e) => setDataset(e.target.value)}
            >
              {datasets.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.port_config === "khalifa" ? "Khalifa reference" : d.name}
                </option>
              ))}
            </select>
          </label>
          <div className="clock-readout">
            <i />
            SIMULATED LIVE VIEW
            <strong>
              {clock ? portTime(clock) : "Connecting…"}
              <small> GST</small>
            </strong>
          </div>
          <button
            className="icon-button"
            aria-label="Toggle map presentation mode"
            onClick={() => {
              setFocus(!focus);
              setView("port");
            }}
          >
            <Maximize2 />
          </button>
          <button
            className="icon-button tour-trigger"
            aria-label="Start guided walkthrough"
            onClick={() => {
              setTour(0);
              setView("port");
            }}
          >
            <HelpCircle size={18} />
          </button>
        </header>
        <div className="workspace-title">
          <div>
            <span className="eyebrow">THE HARBOR, IN CONTEXT</span>
            <h1>
              {view === "port"
                ? "Port control"
                : view === "risk"
                  ? "Risk intelligence"
                  : view === "process"
                    ? "Process intelligence"
                    : view === "studio"
                      ? "Decision workspace"
                      : view === "data"
                        ? "Data workspace"
                        : "Operational activity"}
              <span className="status-pill">
                {synthetic ? "Synthetic dataset" : "Private event log"}
              </span>
            </h1>
          </div>
          <p>
            Observe the flow.
            <br />
            <span>Understand the pressure.</span>
          </p>
        </div>
        {tour !== null && (
          <section className="tour-card" aria-label="Guided walkthrough">
            <span className="eyebrow">
              GUIDED DEMO · {tour + 1} / {steps.length}
            </span>
            <div>
              <h2>{steps[tour].title}</h2>
              <p>{steps[tour].body}</p>
            </div>
            <button
              className="secondary"
              onClick={() => {
                const next = tour + 1;
                if (next === steps.length) setTour(null);
                else {
                  setTour(next);
                  setView(steps[next].view);
                }
              }}
            >
              {tour === steps.length - 1 ? "Finish walkthrough" : "Next step"}
            </button>
            <button
              aria-label="Close walkthrough"
              className="icon-button"
              onClick={() => setTour(null)}
            >
              <X size={16} />
            </button>
          </section>
        )}
        {error ? (
          <section className="connection-state" role="alert">
            <Anchor size={40} />
            <h2>Waiting for the harbor</h2>
            <p>{error}</p>
            <button
              className="primary"
              onClick={() => setAttempt((a) => a + 1)}
            >
              Retry connection
            </button>
          </section>
        ) : !data ? (
          <section className="connection-state" role="status">
            <Waves size={40} />
            <h2>Preparing the workspace</h2>
            <p>Loading canonical port events and model predictions…</p>
          </section>
        ) : (
          <>
            <section
              hidden={
                view === "studio" || view === "process" || view === "data"
              }
              className="telemetry"
              aria-label="Operational indicators"
            >
              {[
                {
                  label: "Calls in replay",
                  value: visible.length,
                  suffix: "vessels",
                  detail: "At the selected clock",
                },
                {
                  label: "Alongside",
                  value: atBerth,
                  suffix: "vessels",
                  detail: "Assumed occupancy after cargo start",
                },
                {
                  label: "High predicted risk",
                  value:
                    risk?.cases.filter((c) => c.miss_probability > 0.66)
                      .length ?? "—",
                  suffix: "calls",
                  detail: "Latest observed prefix · fixed during replay",
                },
                {
                  label: "Configured berths",
                  value: data.berths.length,
                  suffix: "berths",
                  detail: "Synthetic operational constraints",
                },
              ].map((k, i) => (
                <article key={k.label}>
                  <div className="metric-label">
                    {k.label}
                    <ProvenanceBadge
                      provenance={
                        i === 2
                          ? "predicted"
                          : i === 1
                            ? "simulated"
                            : "observed"
                      }
                    />
                  </div>
                  <strong>
                    {k.value}
                    <small>{k.suffix}</small>
                  </strong>
                  <p>{k.detail}</p>
                </article>
              ))}
            </section>
            {!risk && !riskError && (
              <div className="notice" role="status">
                Loading latest-prefix model predictions…
              </div>
            )}
            {riskError && (
              <div className="notice" role="status">
                {riskError}
              </div>
            )}
            <div hidden={view !== "process"}>
              <ProcessExplorer
                key={dataset}
                dataset={dataset}
                enabled={view === "process"}
              />
            </div>
            <div hidden={view !== "studio"}>
              <ScenarioStudio
                key={dataset}
                data={data}
                enabled={view === "studio"}
                selected={selected}
                onSelect={selectVessel}
              />
            </div>
            <div hidden={view !== "data"}>
              <DatasetManager
                enabled={view === "data"}
                onUse={(d) => {
                  setDatasets((ds) => [...ds.filter((x) => x.id !== d.id), d]);
                  setDataset(d.id);
                  setView("port");
                }}
              />
            </div>
            {!["studio", "process", "data"].includes(view) && (
              <div className="console-grid">
                <section className="main-panel">
                  <div className="panel-toolbar">
                    <div className="panel-tabs">
                      <button
                        className={view === "port" ? "active" : ""}
                        onClick={() => setView("port")}
                      >
                        Harbor map
                      </button>
                      <button
                        className={view === "risk" ? "active" : ""}
                        onClick={() => setView("risk")}
                      >
                        Risk board
                      </button>
                      <button
                        className={view === "events" ? "active" : ""}
                        onClick={() => setView("events")}
                      >
                        Event log
                      </button>
                    </div>
                    <label className="risk-toggle">
                      <input
                        type="checkbox"
                        checked={showRisk}
                        onChange={(e) => setShowRisk(e.target.checked)}
                      />
                      Risk overlay
                    </label>
                  </div>
                  {view === "port" ? (
                    <PortMap
                      data={data}
                      clock={clock}
                      risk={risk}
                      selected={selected}
                      onSelect={selectVessel}
                      onBerth={selectBerth}
                      showRisk={showRisk}
                    />
                  ) : (
                    <div className="board">
                      <label className="search-box">
                        <Search size={16} />
                        <input
                          placeholder="Search case or vessel type"
                          aria-label="Search vessels"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                      {view === "risk" ? (
                        <>
                          <p className="board-caption">
                            Predictions use each call’s latest observed event,
                            independent of replay time. Model:{" "}
                            {risk?.model_version ??
                              (riskError ? "unavailable" : "loading")}
                            .
                          </p>
                          {riskCases.map((c) => (
                            <button
                              className={`risk-row ${selected === c.case_id ? "selected-row" : ""}`}
                              onClick={() => selectVessel(c.case_id)}
                              key={c.case_id}
                            >
                              <Ship size={22} />
                              <span>
                                <strong>{c.case_id}</strong>
                                <small>
                                  {c.vessel_type} · {c.current_stage}
                                </small>
                              </span>
                              <div>
                                <strong
                                  className={
                                    c.miss_probability > 0.66
                                      ? "coral-text"
                                      : "seafoam"
                                  }
                                >
                                  {Math.round(c.miss_probability * 100)}%
                                </strong>
                                <ProvenanceBadge provenance="predicted" />
                              </div>
                              <ChevronRight size={16} />
                            </button>
                          ))}
                        </>
                      ) : (
                        events
                          .filter((e) =>
                            e.case_id
                              .toLowerCase()
                              .includes(search.toLowerCase()),
                          )
                          .map((e, i) => (
                            <button
                              className="event-row"
                              key={`${e.case_id}-${i}`}
                              onClick={() => selectVessel(e.case_id)}
                            >
                              <time>{portTime(e.end)}</time>
                              <span>
                                <strong>{e.activity}</strong>
                                <small>
                                  {e.case_id} · {e.status}
                                </small>
                              </span>
                              <ChevronRight size={16} />
                            </button>
                          ))
                      )}
                    </div>
                  )}
                  <div className="playback">
                    <button
                      className="play-button"
                      aria-label={playing ? "Pause replay" : "Play replay"}
                      onClick={() => {
                        if (clock >= Date.parse(data.clock_end))
                          setClock(Date.parse(data.clock_start));
                        setPlaying(!playing);
                      }}
                    >
                      {playing ? <Pause size={19} /> : <Play size={19} />}
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Reset replay"
                      onClick={() => {
                        setPlaying(false);
                        setClock(Date.parse(data.clock_start));
                      }}
                    >
                      <RotateCcw size={17} />
                    </button>
                    <div className="scrubber">
                      <div>
                        <span>{portTime(clock)}</span>
                        <span>48-HOUR EVENT REPLAY</span>
                      </div>
                      <input
                        aria-label="Simulation clock"
                        type="range"
                        min={Date.parse(data.clock_start)}
                        max={Date.parse(data.clock_end)}
                        step={60_000}
                        value={clock}
                        onChange={(e) => {
                          setPlaying(false);
                          setClock(Number(e.target.value));
                        }}
                      />
                    </div>
                    <select
                      aria-label="Playback speed"
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                    >
                      <option value={1}>1 min/s</option>
                      <option value={10}>10 min/s</option>
                      <option value={60}>60 min/s</option>
                    </select>
                  </div>
                </section>
                <aside
                  className={`context-panel ${vessel || chosenBerth ? "detail-open" : ""}`}
                >
                  {vessel ? (
                    <>
                      <div className="panel-heading">
                        <span className="eyebrow">SELECTED PORT CALL</span>
                        <button
                          className="icon-button"
                          aria-label="Close vessel details"
                          onClick={() => setSelected(null)}
                        >
                          <X size={18} />
                        </button>
                      </div>
                      <div className="vessel-portrait">
                        <Ship size={76} strokeWidth={0.7} />
                        <span>{vessel.vessel_type.toUpperCase()}</span>
                      </div>
                      <h2>{vessel.case_id}</h2>
                      <p className="muted">
                        {
                          vesselState(
                            vessel,
                            clock,
                            data.occupancy_assumption_minutes,
                          ).stage
                        }
                      </p>
                      <dl className="detail-grid">
                        <div>
                          <dt>Length / draft</dt>
                          <dd>
                            {vessel.loa ?? "—"} / {vessel.draft ?? "—"} m
                          </dd>
                        </div>
                        <div>
                          <dt>Assigned berth at clock</dt>
                          <dd>
                            {vesselState(
                              vessel,
                              clock,
                              data.occupancy_assumption_minutes,
                            ).berth ?? "Unassigned"}
                          </dd>
                        </div>
                        <div>
                          <dt>Service target</dt>
                          <dd>
                            {vessel.service_window_end
                              ? portTime(vessel.service_window_end)
                              : "Not observed"}
                          </dd>
                        </div>
                      </dl>
                      {score ? (
                        <section className="risk-detail">
                          <div className="metric-label">
                            Window miss probability
                            <ProvenanceBadge provenance="predicted" />
                          </div>
                          <strong>
                            {Math.round(score.miss_probability * 100)}
                            <small>%</small>
                          </strong>
                          <p>
                            Latest-prefix estimate · synthetic training data
                          </p>
                          {score.top_factors.map((f) => (
                            <div className="factor" key={f.feature}>
                              <span>{f.feature.replaceAll("_", " ")}</span>
                              <b
                                className={
                                  f.contribution > 0 ? "coral-text" : "seafoam"
                                }
                              >
                                {f.contribution > 0 ? "+" : ""}
                                {f.contribution.toFixed(2)}
                              </b>
                            </div>
                          ))}
                          <small>
                            Signed SHAP contributions; not causal effects.
                          </small>
                        </section>
                      ) : (
                        <p className="muted">
                          {!risk && !riskError
                            ? "Loading model prediction…"
                            : riskError
                              ? "Prediction unavailable."
                              : "No active-case prediction for this call."}
                        </p>
                      )}
                      <h3>Supporting events</h3>
                      {vesselState(
                        vessel,
                        clock,
                        data.occupancy_assumption_minutes,
                      )
                        .seen.slice(-4)
                        .map((e, i) => (
                          <div className="mini-event" key={i}>
                            <i />
                            <span>
                              {e.activity}
                              <small>{portTime(e.end)}</small>
                            </span>
                          </div>
                        ))}
                    </>
                  ) : chosenBerth ? (
                    <>
                      <div className="panel-heading">
                        <span className="eyebrow">BERTH CONSTRAINTS</span>
                        <button
                          className="icon-button"
                          aria-label="Close berth details"
                          onClick={() => setBerth(null)}
                        >
                          <X size={18} />
                        </button>
                      </div>
                      <Anchor size={52} className="seafoam" />
                      <h2>{chosenBerth.id}</h2>
                      <p>{chosenBerth.name}</p>
                      <dl className="detail-grid">
                        <div>
                          <dt>Length limit</dt>
                          <dd>{chosenBerth.length_m} m</dd>
                        </div>
                        <div>
                          <dt>Draft limit</dt>
                          <dd>{chosenBerth.draft_m} m</dd>
                        </div>
                        <div>
                          <dt>Terminal compatibility</dt>
                          <dd>{chosenBerth.terminal_type}</dd>
                        </div>
                      </dl>
                      <p className="muted">
                        Configured synthetic constraints. Position is
                        approximate.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="panel-heading">
                        <span className="eyebrow">PORT CALLS</span>
                        <Ship size={17} />
                      </div>
                      <h2>On the radar</h2>
                      <p className="muted">
                        Select a vessel to follow its evidence.
                      </p>
                      <label className="search-box">
                        <Search size={16} />
                        <input
                          aria-label="Filter port calls"
                          placeholder="Find a call…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                      <div className="vessel-list">
                        {visible.map((v) => (
                          <button
                            key={v.case_id}
                            onClick={() => selectVessel(v.case_id)}
                          >
                            <span className="ship-icon">
                              <Ship size={21} />
                            </span>
                            <span>
                              <strong>{v.case_id}</strong>
                              <small>
                                {v.vessel_type} ·{" "}
                                {
                                  vesselState(
                                    v,
                                    clock,
                                    data.occupancy_assumption_minutes,
                                  ).phase
                                }
                              </small>
                            </span>
                            <ArrowUpRight size={15} />
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </aside>
              </div>
            )}
            <footer className="console-footer">
              <span>
                <i />
                {synthetic ? "Synthetic operations." : "Uploaded events."}{" "}
                Simulated positions. No live AIS.
              </span>
              <span>
                Replay occupancy uses a configured{" "}
                {data.occupancy_assumption_minutes}-minute assumption.
              </span>
              <a
                href="https://github.com/abdulaz06/berthiq"
                target="_blank"
                rel="noreferrer"
              >
                Source & methodology ↗
              </a>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}

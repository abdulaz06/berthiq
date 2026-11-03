"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Anchor,
  ChevronRight,
  Compass,
  Database,
  FlaskConical,
  GitBranch,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Search,
  Ship,
  Waves,
  X,
} from "lucide-react";
import { sessionRequest } from "@/lib/api/session";
import { getHealth } from "@/lib/api/health";
import { EngineOffline } from "@/components/offline/EngineOffline";
import DatasetManager from "@/components/datasets/DatasetManager";
import type { DatasetSummary } from "@/lib/api/contracts";
import { portTime, vesselState, type Operations, type Risk } from "@/lib/operations";
import { occupancy, journey as callJourney } from "@/lib/journey";
import { featureLabel, GLOSSARY } from "@/lib/language";
import { protagonist, waitingMoment } from "@/lib/story";
import { verdict } from "@/lib/verdict";
import { ProvenanceBadge } from "@/components/provenance/ProvenanceBadge";
import { JourneyStrip } from "@/components/journey/JourneyStrip";
import { StoryGuide, type StoryChapter } from "@/components/story/StoryGuide";
import { QFlagMark } from "@/components/brand/QFlagMark";
import "./console.css";
import "./analysis.css";
import "./identity.css";
import ScenarioStudio, { type StudioControl, type StudioState } from "@/components/scenario/ScenarioStudio";

const ProcessExplorer = dynamic(() => import("@/components/process/ProcessExplorer"), { ssr: false });
const PortMap = dynamic(() => import("@/components/map/PortMap"), {
  ssr: false,
  loading: () => <div className="map-loading">Preparing harbor chart…</div>,
});

type View = "port" | "risk" | "events" | "process" | "studio" | "data";

const VIEWS: Record<View, { eyebrow: string; title: string; lede: string }> = {
  port: {
    eyebrow: "HARBOR · ONE WEEK OF PORT CALLS",
    title: "Harbor",
    lede: "Yellow ships are waiting at anchor. Select one to see why.",
  },
  risk: {
    eyebrow: "RISK · CALLS STILL IN PROGRESS",
    title: "Who is likely to be late",
    lede: "A model scores each open call’s chance of missing its service window.",
  },
  events: {
    eyebrow: "EVENT LOG · THE RAW RECORD",
    title: "Event log",
    lede: "Every step every call took, as recorded. Everything else is built from this.",
  },
  process: {
    eyebrow: "PROCESS · SIX MONTHS OF HISTORY",
    title: "Process",
    lede: "The path every call takes, discovered from the log — and where it loops.",
  },
  studio: {
    eyebrow: "DECIDE · TEST A CHANGE",
    title: "Test a decision",
    lede: "Change capacity or rules, get a feasible plan, and simulate it against today’s.",
  },
  data: {
    eyebrow: "DATA · BRING YOUR OWN LOG",
    title: "Data workspace",
    lede: "Validate and map your own port-call event log into a private dataset.",
  },
};

export default function ConsolePage() {
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [dataset, setDataset] = useState("");
  const [data, setData] = useState<Operations | null>(null);
  const [risk, setRisk] = useState<Risk | null>(null);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [riskError, setRiskError] = useState("");
  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(180);
  const [selected, setSelected] = useState<string | null>(null);
  const [berth, setBerth] = useState<string | null>(null);
  const [view, setView] = useState<View>("port");
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState(false);
  const [showRisk, setShowRisk] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [story, setStory] = useState<number | null>(null);
  const [processFocus, setProcessFocus] = useState<string | null>(null);
  const [studio, setStudio] = useState<StudioState>({ busy: "", optimization: null, simulation: null });
  const studioControl = useRef<StudioControl>(null);
  const detailClose = useRef<HTMLButtonElement>(null);
  const detailTrigger = useRef<HTMLElement | null>(null);

  const closeDetails = useCallback(() => {
    setSelected(null);
    setBerth(null);
    const trigger = detailTrigger.current;
    const label = trigger?.getAttribute("aria-label");
    const target = trigger?.isConnected
      ? trigger
      : label
        ? document.querySelector<HTMLElement>(`button[aria-label="${CSS.escape(label)}"]`)
        : null;
    target?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if ((selected || berth) && story === null) detailClose.current?.focus({ preventScroll: true });
  }, [selected, berth, story]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (story !== null) {
        setStory(null);
        document.querySelector<HTMLButtonElement>(".tour-trigger")?.focus();
      } else if (selected || berth) closeDetails();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [selected, berth, story, closeDetails]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("story") || params.has("tour")) setStory(0);
  }, []);

  const synthetic = datasets.find((d) => d.id === dataset)?.source !== "uploaded";
  useEffect(() => {
    let active = true;
    setOffline(false);
    getHealth().catch(() => active && setOffline(true));
    sessionRequest<DatasetSummary[]>("/api/datasets")
      .then((list) => {
        if (!active) return;
        const ready = list.filter((d) => d.status === "ready");
        setDatasets(ready);
        setDataset(ready[0]?.id ?? "");
        if (!ready.length) setError("No ready datasets are available. The server needs its demo seed.");
      })
      .catch(() => active && setOffline(true));
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
      .catch(() => active && setOffline(true));
    sessionRequest<Risk>(`/api/datasets/${dataset}/risk`)
      .then((result) => active && setRisk(result))
      .catch(() => active && setRiskError("Risk model unavailable. Operational replay remains available."));
    return () => {
      active = false;
    };
  }, [dataset, attempt]);
  useEffect(() => {
    if (!playing || !data) return;
    // Continuous playback: ships glide frame by frame instead of stepping.
    const end = Date.parse(data.clock_end);
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(now - last, 100);
      last = now;
      setClock((current) => Math.min(end, current + (speed * 60_000 * elapsed) / 1000));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, data, speed]);
  useEffect(() => {
    if (data && clock >= Date.parse(data.clock_end)) setPlaying(false);
  }, [clock, data]);

  const selectVessel = useCallback((id: string) => {
    detailTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelected(id);
    setBerth(null);
  }, []);
  const selectBerth = useCallback((id: string) => {
    detailTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBerth(id);
    setSelected(null);
  }, []);

  const occupancyAt = data?.occupancy_assumption_minutes ?? 420;
  const vessel = data?.vessels.find((v) => v.case_id === selected);
  const chosenBerth = data?.berths.find((b) => b.id === berth);
  const score = risk?.cases.find((c) => c.case_id === selected);
  const path = useMemo(() => (vessel && data ? callJourney(vessel, data, clock) : null), [vessel, data, clock]);
  const query = search.toLowerCase();
  const matches = (id: string, type?: string | null) =>
    id.toLowerCase().includes(query) || (type ?? "").toLowerCase().includes(query);
  const states = useMemo(
    () => new Map((data?.vessels ?? []).map((v) => [v.case_id, vesselState(v, clock, occupancyAt)])),
    [data, clock, occupancyAt],
  );
  const visible = (data?.vessels ?? []).filter(
    (v) => matches(v.case_id, v.vessel_type) && !["Not requested", "Departed"].includes(states.get(v.case_id)!.phase),
  );
  const count = (phase: string) => [...states.values()].filter((s) => s.phase === phase).length;
  const busyBerths = useMemo(() => {
    if (!data) return 0;
    const busy = occupancy(data);
    return data.berths.filter((b) => (busy.get(b.id) ?? []).some(([s, e]) => s <= clock && clock < e)).length;
  }, [data, clock]);
  const events = useMemo(
    () =>
      data?.vessels
        .flatMap((v) => v.events)
        .filter((e) => Date.parse(e.end) <= clock)
        .sort((a, b) => Date.parse(b.end) - Date.parse(a.end))
        .slice(0, 40) ?? [],
    [data, clock],
  );
  const riskCases = [...(risk?.cases ?? [])]
    .filter((c) => matches(c.case_id, c.vessel_type))
    .sort((a, b) => b.miss_probability - a.miss_probability);

  // ── The guided investigation: each chapter sets the real console up. ──
  const moment = useMemo(() => (data ? waitingMoment(data) : null), [data]);
  const hero = useMemo(() => (data ? protagonist(data) : null), [data]);
  const heroJourney = useMemo(() => {
    const v = data?.vessels.find((x) => x.case_id === hero?.id);
    return v && data && hero ? callJourney(v, data, hero.at) : null;
  }, [data, hero]);
  const topRisk = useMemo(
    () => (risk ? [...risk.cases].sort((a, b) => b.miss_probability - a.miss_probability)[0] : null),
    [risk],
  );
  const chapters: StoryChapter[] = useMemo(() => {
    const result = studio.simulation ? verdict(studio.simulation, studio.optimization) : null;
    const opt = studio.optimization;
    return [
      {
        kicker: "THE HARBOR",
        title: "A week at Khalifa Port",
        body: "This is a replay of one week of port calls, driven by the event log. Ships arrive, wait at anchor, are piloted in and berth. Yellow means waiting.",
        note: "Synthetic operations on real port geography. Paths are illustrative; every arrival and berthing time comes from a recorded event.",
      },
      {
        kicker: "THE PUZZLE",
        title:
          moment && moment.idle === moment.berths
            ? "Ships wait. Every berth is empty."
            : "Ships wait while berths sit idle.",
        body: moment
          ? `At ${portTime(moment.time)}, ${moment.anchored.length} ships are at anchor — and ${moment.idle} of ${moment.berths} berths are free. Berth space is not what they are waiting for.`
          : "Ships wait at anchor even when berths are free.",
      },
      {
        kicker: "ONE SHIP",
        title: hero ? `Why did ${hero.id} wait?` : "Follow one ship",
        body: heroJourney
          ? `${heroJourney.headline} ${heroJourney.detail.slice(0, 2).join(" ")}`
          : "Select any ship to see its journey.",
        note: "Its timeline puts the paperwork (top lane) above the ship (bottom lane). Every ship has one — select any of them.",
      },
      {
        kicker: "THE PATTERN",
        title: "It isn’t bad luck. It’s the review queue.",
        body: "Process discovery over six months of recorded steps finds the same thing across every call: authority review is the largest controllable delay. Coral arrows are documents sent back to be fixed — each loop adds hours.",
      },
      {
        kicker: "THE FORECAST",
        title: "Who is next?",
        body: topRisk
          ? `${topRisk.case_id} is still in paperwork. From its steps so far, the model estimates a ${Math.round(topRisk.miss_probability * 100)}% chance it misses its service window.`
          : "A model scores every open call’s chance of missing its service window.",
        note: "A prediction from a model trained on synthetic history. The factors explain the model’s estimate; they are not proof of cause.",
      },
      {
        kicker: "THE DECISION",
        title: "What if the port staffed five reviewers?",
        body: opt
          ? `The solver returned a ${opt.solver_status.toLowerCase()} plan for all ${opt.assignments.length} open calls. ${
              opt.changed_decisions.length
                ? `${opt.changed_decisions.length} assignments differ from today’s plan.`
                : "It keeps today’s berth sequence call for call — the difference is reviewer capacity."
            } Every hard constraint passed an independent check.`
          : "Today three reviewers work the queue. The solver (Google OR-Tools CP-SAT) assigns every open call a reviewer and a berth, respecting vessel size, terminal type, pilots and shifts.",
        action: opt
          ? undefined
          : {
              label: studio.busy === "optimize" ? "Solving…" : "Run the solver",
              busy: !!studio.busy,
              run: () => void studioControl.current?.optimize(),
            },
      },
      {
        kicker: "THE VERDICT",
        title: result ? result.headline : "Simulate both plans",
        body: result
          ? result.lines.slice(0, 3).join(" ")
          : "Twenty simulated runs replay the open calls twice — today’s plan and yours — with identical random delays, so the only difference is the decision.",
        action: result
          ? undefined
          : {
              label: studio.busy === "simulate" ? "Simulating…" : "Simulate both plans",
              busy: !!studio.busy || !opt,
              run: () => void studioControl.current?.simulate(),
            },
      },
      {
        kicker: "YOUR TURN",
        title: "Now try your own decision",
        body: "Change the staffing, protect a berth for a priority ship, or close one for maintenance. Every number keeps its label: observed, predicted, optimized or simulated.",
      },
    ];
  }, [moment, hero, heroJourney, topRisk, studio]);

  useEffect(() => {
    if (story === null || !data) return;
    // Each chapter puts the console where its sentence points.
    if (story === 0) {
      setView("port");
      setSelected(null);
      setBerth(null);
      setSpeed(360);
      setClock(Date.parse(data.clock_start));
      setPlaying(true);
    } else if (story === 1) {
      setView("port");
      setPlaying(false);
      setSelected(null);
      if (moment) setClock(moment.time);
    } else if (story === 2) {
      setView("port");
      setPlaying(false);
      if (hero) {
        setSelected(hero.id);
        setClock(hero.at);
      }
    } else if (story === 3) {
      setView("process");
      setProcessFocus("Authority review");
    } else if (story === 4) {
      setView("risk");
      setClock(Date.parse(data.clock_end));
      if (topRisk) setSelected(topRisk.case_id);
    } else {
      setView("studio");
      setSelected(null);
    }
  }, [story, data, moment, hero, topRisk]);
  useEffect(() => {
    if (story === 6 && studio.simulation)
      document.querySelector('[data-testid="verdict"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (story === 5 && studio.optimization)
      document.querySelector(".result-summary")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [story, studio.simulation, studio.optimization]);

  const meta = VIEWS[view];
  const onRail = (id: View) => view === id || (id === "port" && view === "events");
  const phaseClass = (phase: string) => `phase-${phase.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <main className={`harbor ${focus ? "focus-mode" : ""} ${story !== null ? "story-on" : ""}`}>
      <a className="skip-link" href="#workspace-heading">
        Skip to workspace
      </a>
      <nav className="rail" aria-label="Workspace navigation">
        <Link href="/" className="brand-mark" aria-label="BerthIQ home">
          <QFlagMark size={28} />
        </Link>
        {(
          [
            ["port", Compass, "Harbor"],
            ["process", GitBranch, "Process"],
            ["risk", Activity, "Risk"],
            ["studio", FlaskConical, "Decide"],
            ["data", Database, "Data"],
          ] as const
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            aria-current={onRail(id) ? "page" : undefined}
            className={onRail(id) ? "active" : ""}
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
          <Link href="/" className="wordmark">
            Berth<span>IQ</span>
          </Link>
          <label className="dataset-select">
            <span>DATASET</span>
            <select aria-label="Select dataset" value={dataset} onChange={(e) => setDataset(e.target.value)}>
              {datasets.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.port_config === "khalifa" ? "Khalifa reference · synthetic" : d.name}
                </option>
              ))}
            </select>
          </label>
          <div className="clock-readout">
            <i className={playing ? "live" : ""} />
            REPLAY CLOCK
            <strong>
              {clock ? portTime(clock) : "Connecting…"}
              <small> GST</small>
            </strong>
          </div>
          <button className="story-trigger tour-trigger" aria-label="Start guided investigation" onClick={() => setStory(0)}>
            <span className="q-flag" aria-hidden="true" />
            <span>Guided investigation</span>
          </button>
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
        </header>
        <div className="workspace-title">
          <div>
            <span className="eyebrow">{meta.eyebrow}</span>
            <h1 id="workspace-heading" tabIndex={-1}>
              {meta.title}
              <span className="status-pill">{synthetic ? "Synthetic dataset" : "Private event log"}</span>
            </h1>
          </div>
          <p>{meta.lede}</p>
        </div>
        {story !== null && (
          <StoryGuide
            chapters={chapters}
            index={story}
            onBack={() => setStory((s) => Math.max(0, (s ?? 0) - 1))}
            onNext={() => setStory((s) => (s === null || s >= chapters.length - 1 ? null : s + 1))}
            onClose={() => setStory(null)}
          />
        )}
        {offline ? (
          <EngineOffline onRetry={() => setAttempt((a) => a + 1)} />
        ) : error ? (
          <section className="connection-state" role="alert">
            <Anchor size={40} />
            <h2>Waiting for the harbor</h2>
            <p>{error}</p>
            <button className="primary" onClick={() => setAttempt((a) => a + 1)}>
              Retry connection
            </button>
          </section>
        ) : !data ? (
          <section className="connection-state" role="status">
            <Waves size={40} />
            <h2>Preparing the workspace</h2>
            <p>Loading recorded port events and model predictions…</p>
          </section>
        ) : (
          <>
            <section
              hidden={view === "studio" || view === "process" || view === "data"}
              className="telemetry"
              aria-label="Operational indicators"
            >
              {[
                {
                  label: "Waiting at anchor",
                  value: count("At anchor"),
                  suffix: count("At anchor") === 1 ? "ship" : "ships",
                  detail: "At the replay clock",
                  provenance: "observed" as const,
                  tone: "signal",
                },
                {
                  label: "Berths in use",
                  value: `${busyBerths}/${data.berths.length}`,
                  suffix: "berths",
                  detail: `Cargo start + ${Math.round(occupancyAt / 60)} h occupancy assumption`,
                  provenance: "simulated" as const,
                  tone: "",
                },
                {
                  label: "Awaiting clearance",
                  value: count("Awaiting clearance"),
                  suffix: "calls",
                  detail: "Paperwork under way, not yet arrived",
                  provenance: "observed" as const,
                  tone: "",
                },
                {
                  label: "Likely to miss window",
                  value: risk?.cases.filter((c) => c.miss_probability > 0.66).length ?? "—",
                  suffix: `of ${risk?.cases.length ?? "—"} open`,
                  detail: "Model estimate above 66% · latest events",
                  provenance: "predicted" as const,
                  tone: "coral",
                },
              ].map((k) => (
                <article key={k.label} className={k.tone}>
                  <div className="metric-label">
                    {k.label}
                    <ProvenanceBadge provenance={k.provenance} />
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
              <ProcessExplorer key={dataset} dataset={dataset} enabled={view === "process"} focus={processFocus} />
            </div>
            <div hidden={view !== "studio"}>
              <ScenarioStudio
                key={dataset}
                data={data}
                enabled={view === "studio"}
                selected={selected}
                onSelect={selectVessel}
                control={studioControl}
                onState={setStudio}
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
                      <button className={view === "port" ? "active" : ""} onClick={() => setView("port")}>
                        Harbor map
                      </button>
                      <button className={view === "risk" ? "active" : ""} onClick={() => setView("risk")}>
                        Risk board
                      </button>
                      <button className={view === "events" ? "active" : ""} onClick={() => setView("events")}>
                        Event log
                      </button>
                    </div>
                    <label className="risk-toggle">
                      <input type="checkbox" checked={showRisk} onChange={(e) => setShowRisk(e.target.checked)} />
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
                          placeholder="Search call or vessel type"
                          aria-label="Search vessels"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                      {view === "risk" ? (
                        <>
                          <p className="board-caption">
                            Chance each open call starts cargo work after its service window, from the steps recorded
                            so far. Fixed during replay · model{" "}
                            {risk?.model_version ?? (riskError ? "unavailable" : "loading")}.
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
                              <span className="risk-meter" aria-hidden="true">
                                <i
                                  style={{ width: `${Math.round(c.miss_probability * 100)}%` }}
                                  className={c.miss_probability > 0.66 ? "high" : ""}
                                />
                              </span>
                              <div>
                                <strong className={c.miss_probability > 0.66 ? "coral-text" : "seafoam"}>
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
                          .filter((e) => e.case_id.toLowerCase().includes(query))
                          .map((e, i) => (
                            <button
                              className={`event-row ${e.status === "rejected" ? "rejected" : ""}`}
                              key={`${e.case_id}-${i}`}
                              onClick={() => selectVessel(e.case_id)}
                            >
                              <time>{portTime(e.end)}</time>
                              <span>
                                <strong>{e.activity}</strong>
                                <small>
                                  {e.case_id} · {e.status === "rejected" ? "returned" : e.status}
                                  {e.resource ? ` · ${e.resource}` : ""}
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
                        if (clock >= Date.parse(data.clock_end)) setClock(Date.parse(data.clock_start));
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
                        <span>
                          {Math.round((Date.parse(data.clock_end) - Date.parse(data.clock_start)) / 86_400_000)}-DAY
                          EVENT REPLAY
                        </span>
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
                    <select aria-label="Playback speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                      <option value={60}>1 h/s</option>
                      <option value={180}>3 h/s</option>
                      <option value={360}>6 h/s</option>
                    </select>
                  </div>
                </section>
                <aside className={`context-panel ${vessel || chosenBerth ? "detail-open" : ""}`}>
                  {vessel ? (
                    <>
                      <div className="panel-heading">
                        <span className="eyebrow">SELECTED PORT CALL</span>
                        <button
                          className="icon-button"
                          aria-label="Close vessel details"
                          ref={detailClose}
                          onClick={closeDetails}
                        >
                          <X size={18} />
                        </button>
                      </div>
                      <h2 className="call-title">{vessel.case_id}</h2>
                      <p className="call-meta">
                        {vessel.vessel_type} · {vessel.loa ?? "—"} m long · {vessel.draft ?? "—"} m draft{" "}
                        <b className={`phase-chip ${phaseClass(states.get(vessel.case_id)!.phase)}`}>
                          {states.get(vessel.case_id)!.phase}
                        </b>
                      </p>
                      {path && (
                        <section className="why" aria-label="Why this call is waiting">
                          <p className="why-headline">{path.headline}</p>
                          <JourneyStrip journey={path} />
                          {path.detail.length > 0 && (
                            <ul className="why-detail">
                              {path.detail.map((d) => (
                                <li key={d}>{d}</li>
                              ))}
                            </ul>
                          )}
                        </section>
                      )}
                      {score ? (
                        <section className="risk-detail">
                          <div className="metric-label">
                            Chance of missing its window
                            <ProvenanceBadge provenance="predicted" />
                          </div>
                          <strong>
                            {Math.round(score.miss_probability * 100)}
                            <small>%</small>
                          </strong>
                          <p>{GLOSSARY.missRisk}</p>
                          {score.top_factors.map((f) => (
                            <div className="factor" key={f.feature}>
                              <span>{featureLabel(f.feature)}</span>
                              <i
                                className={f.contribution > 0 ? "up" : "down"}
                                style={{ width: `${Math.min(100, Math.abs(f.contribution) * 40)}%` }}
                                aria-hidden="true"
                              />
                              <b className={f.contribution > 0 ? "coral-text" : "seafoam"}>
                                {f.contribution > 0 ? "raises" : "lowers"}
                              </b>
                            </div>
                          ))}
                          <small>What moved the model’s estimate (signed SHAP). Not proof of cause.</small>
                        </section>
                      ) : (
                        <p className="muted">
                          {!risk && !riskError
                            ? "Loading model prediction…"
                            : riskError
                              ? "Prediction unavailable."
                              : "No risk score: scores cover calls still in progress."}
                        </p>
                      )}
                      <dl className="detail-grid">
                        <div>
                          <dt>Berth at this time</dt>
                          <dd>{states.get(vessel.case_id)!.berth ?? "Not assigned yet"}</dd>
                        </div>
                        <div>
                          <dt title={GLOSSARY.serviceWindow}>Service window ends</dt>
                          <dd>{vessel.service_window_end ? portTime(vessel.service_window_end) : "Not recorded yet"}</dd>
                        </div>
                      </dl>
                      <h3>Supporting events</h3>
                      {states
                        .get(vessel.case_id)!
                        .seen.slice(-5)
                        .reverse()
                        .map((e, i) => (
                          <div className={`mini-event ${e.status === "rejected" ? "rejected" : ""}`} key={i}>
                            <i />
                            <span>
                              {e.activity}
                              {e.status === "rejected" ? " · returned" : ""}
                              <small>
                                {portTime(e.end)}
                                {e.resource ? ` · ${e.resource}` : ""}
                              </small>
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
                          ref={detailClose}
                          onClick={closeDetails}
                        >
                          <X size={18} />
                        </button>
                      </div>
                      <Anchor size={44} className="seafoam" />
                      <h2>{chosenBerth.id}</h2>
                      <p>{chosenBerth.name}</p>
                      <dl className="detail-grid">
                        <div>
                          <dt>Longest ship</dt>
                          <dd>{chosenBerth.length_m} m</dd>
                        </div>
                        <div>
                          <dt>Deepest draft</dt>
                          <dd>{chosenBerth.draft_m} m</dd>
                        </div>
                        <div>
                          <dt>Terminal</dt>
                          <dd>{chosenBerth.terminal_type}</dd>
                        </div>
                      </dl>
                      <p className="muted">
                        A ship may berth here only if it fits all three. The solver treats them as hard rules. Position
                        is approximate.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="panel-heading">
                        <span className="eyebrow">PORT CALLS</span>
                        <Ship size={17} />
                      </div>
                      <h2>On the radar</h2>
                      <p className="muted">Each call is one ship’s visit: paperwork, anchorage, pilot, berth.</p>
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
                        {visible.map((v) => {
                          const phase = states.get(v.case_id)!.phase;
                          return (
                            <button key={v.case_id} onClick={() => selectVessel(v.case_id)}>
                              <span className={`ship-icon ${phaseClass(phase)}`}>
                                <Ship size={19} />
                              </span>
                              <span>
                                <strong>{v.case_id}</strong>
                                <small>
                                  {v.vessel_type} · {phase}
                                </small>
                              </span>
                              <ChevronRight size={15} />
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </aside>
              </div>
            )}
            <footer className="console-footer">
              <span>
                <i />
                {synthetic ? "Synthetic operations." : "Uploaded events."} Illustrative vessel paths. No live AIS.
              </span>
              <span>Berth occupancy after cargo start uses a {occupancyAt}-minute assumption.</span>
              <Link href="/case-study">How it works ↗</Link>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}

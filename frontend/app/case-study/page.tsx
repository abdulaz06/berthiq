import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Play } from "lucide-react";
import { ProvenanceBadge } from "@/components/provenance/ProvenanceBadge";
import { QFlagMark } from "@/components/brand/QFlagMark";
import story from "@/lib/fixtures/landing_story.json";
import simulation from "@/lib/fixtures/simulation_result.example.json";
import optimization from "@/lib/fixtures/optimization_result.example.json";
import { verdict } from "@/lib/verdict";
import type { OptimizationResult, SimulationResult } from "@/lib/api/contracts";
import shots from "@/public/images/steps.json";
import evaluation from "../../../DOCS/REFERENCE_EVALUATION.json";
import "../site.css";

export const metadata = {
  title: "Engineering story | BerthIQ",
  description:
    "How BerthIQ explains why ships wait at anchor: event-log analytics, a leakage-safe risk model, a CP-SAT planner and matched SimPy simulation — each owning its own numbers, with explicit limits.",
};

const hero = story.hero!;
const result = verdict(simulation as unknown as SimulationResult, optimization as unknown as OptimizationResult);

export default function CaseStudy() {
  return (
    <main className="site case">
      <a className="skip-link" href="#case-study-content">
        Skip to case study
      </a>
      <header className="site-header">
        <Link href="/" className="site-brand" aria-label="BerthIQ home">
          <QFlagMark size={26} />
          <span>
            Berth<b>IQ</b>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/">
            <ArrowLeft size={14} /> The product
          </Link>
          <a href="#limitations">Limits</a>
          <a href="https://github.com/abdulaz06/berthiq" target="_blank" rel="noreferrer">
            Source <ArrowUpRight size={13} />
          </a>
        </nav>
        <Link href="/console?story=1" className="site-button small">
          Start the investigation
        </Link>
      </header>

      <article id="case-study-content" tabIndex={-1}>
        <section className="case-hero">
          <span className="kicker">
            <i className="q-flag" aria-hidden="true" /> ENGINEERING STORY
          </span>
          <h1>
            A ship waited {Math.round(hero.anchor_hours ?? 0)} hours <em>with an empty berth in sight.</em>
          </h1>
          <p className="lede">
            This is how BerthIQ works out why, who is next, and what a port could change — using four different
            methods, none of which is allowed to invent another’s numbers.
          </p>
          <div className="case-meta">
            <span>Next.js · TypeScript · MapLibre</span>
            <span>FastAPI · PostgreSQL</span>
            <span>PM4Py · scikit-learn · SHAP · OR-Tools · SimPy</span>
          </div>
        </section>

        <section className="chapter">
          <span className="kicker">01 · THE QUESTION</span>
          <h2>Delays start long before the berth.</h2>
          <div className="two">
            <div>
              <p>
                A port call is a chain. The shipping agent requests the call and submits documents; the system checks
                they are complete; customs, health and port authorities review them and can send them back. Only an
                approved call gets an arrival plan, a berth, a pilot and, finally, a start to cargo work — ideally
                inside the service window the line booked.
              </p>
              <p>
                Optimizing the berth schedule alone misses most of that chain. In BerthIQ’s reference week,{" "}
                {hero.id} spent {Math.round(hero.anchor_hours ?? 0)} hours at anchor. Its documents were returned{" "}
                {hero.rejections} times and sat {Math.round(hero.queue_hours)} hours waiting for a reviewer, while a
                berth that fit it stood idle for {Math.round((hero.idle_berth_share ?? 0) * 100)}% of that wait.
              </p>
              <p>
                The product question followed directly: <b>why is this ship waiting, and what should the port do
                about it?</b>
              </p>
            </div>
            <figure className="portrait-shot">
              <Image
                src="/images/step-why.png"
                alt={`${hero.id}'s two-lane timeline: paperwork returned three times above a long anchorage wait`}
                width={shots["step-why.png"].width}
                height={shots["step-why.png"].height}
                sizes="380px"
              />
              <figcaption>
                Every call’s wait, explained from its own events. <ProvenanceBadge provenance="observed" />
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="chapter">
          <span className="kicker">02 · THE DATA</span>
          <h2>Synthetic, deliberately — with the answer hidden.</h2>
          <p>
            Real port-call logs are confidential, so BerthIQ ships with a deterministic generator for Khalifa Port:{" "}
            {evaluation.event_count.toLocaleString()} events across six months, seeded so every run is identical. It
            has causal levers — reviewer shifts, document rework, weather, berth compatibility — and it records the
            true outcome of each call as hidden ground truth.
          </p>
          <p>
            That hidden truth never reaches the application. Features, schedules and simulations read only the
            observed event prefix at a cutoff; a leakage test deletes every future event and checks that nothing
            changes. Process discovery then has to <i>find</i> the designed bottleneck from the log. It does:{" "}
            {story.discovery.notes[0]?.replace(/ - /g, " — ")}.
          </p>
        </section>

        <section className="chapter">
          <span className="kicker">03 · THE ARCHITECTURE</span>
          <h2>Four methods. Four owners.</h2>
          <div className="owners">
            {[
              ["Analytics owns facts", "observed", "Event normalization, validation and PM4Py process discovery: variants, rework loops, queue times."],
              ["The model owns probabilities", "predicted", "Prefix-only HistGradientBoosting risk with signed SHAP factors. Trained offline, never during a request."],
              ["The solver owns assignments", "optimized", "OR-Tools CP-SAT schedules reviewers, compatible berths and pilots; an independent checker re-verifies every hard rule."],
              ["The simulator owns counterfactuals", "simulated", "SimPy replays open calls under two plans with matched, case-keyed random streams and fixed seeds."],
            ].map(([title, provenance, body]) => (
              <article key={title}>
                <ProvenanceBadge provenance={provenance as "observed"} />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
          <p>
            A FastAPI modular monolith sits over PostgreSQL; Pydantic schemas are the contracts and generate the
            frontend’s TypeScript types. Optimization and simulation run in two bounded subprocess slots with hard
            deadlines, so a runaway solve can be killed without taking the API down. Every KPI travels with its
            provenance, and a CI lint fails if a component renders a KPI without its badge.
          </p>
          <p>
            There is no language model in the decision path. The sentences on screen — “returned 3 times”, “shorter
            waits, paid for in reviewer hours” — are templates over computed numbers, with unit tests that pin them
            to the evidence.
          </p>
        </section>

        <section className="chapter">
          <span className="kicker">04 · THE FORECAST</span>
          <h2>Predict only from what was known.</h2>
          <p>
            Risk is evaluated chronologically on {evaluation.test_prefixes.toLocaleString()} held-out event prefixes:
            the model sees each call as it stood at that moment, never its future. SHAP factors explain the model’s
            estimate; they are not causal claims, and the interface says so wherever they appear.
          </p>
          <div className="metrics">
            {[
              ["PR-AUC", evaluation.model.pr_auc.toFixed(4)],
              ["AUROC", evaluation.model.auroc.toFixed(4)],
              ["Brier score", evaluation.model.brier.toFixed(4)],
            ].map(([label, value]) => (
              <div key={label}>
                <span>
                  {label} <ProvenanceBadge provenance="observed" />
                </span>
                <strong>{value}</strong>
                <small>Held-out synthetic evaluation</small>
              </div>
            ))}
          </div>
          <p className="note">These scores describe performance inside the synthetic environment, not at an operating port.</p>
        </section>

        <section className="chapter">
          <span className="kicker">05 · THE DECISION</span>
          <h2>Less waiting has a price. Say it.</h2>
          <p>
            The reference experiment asks what five authority reviewers would do instead of three. CP-SAT builds a
            feasible plan; twenty matched replications compare it with the no-change plan under identical random
            delays, so the only difference is the decision.
          </p>
          <figure className="wide-shot">
            <Image
              src="/images/step-verdict.png"
              alt="The scenario verdict: average wait falls, reviewer hours rise, on-time starts unchanged"
              width={shots["step-verdict.png"].width}
              height={shots["step-verdict.png"].height}
              sizes="(max-width: 900px) 100vw, 1000px"
            />
          </figure>
          <ul className="verdict-lines">
            {result.lines.map((line) => (
              <li key={line}>
                {line} <ProvenanceBadge provenance={line.startsWith("With the same staffing") ? "optimized" : "simulated"} />
              </li>
            ))}
          </ul>
          <p>
            Two of those lines are the honest part. No open call starts inside its window in either plan — the cohort
            was already late at the cutoff. And with equal staffing, the solver’s schedule ties first-come-first-served:
            the improvement is capacity, not clever sequencing. A tool that hid either would be less useful, not more.
          </p>
        </section>

        <section className="chapter">
          <span className="kicker">06 · MAKING IT LEGIBLE</span>
          <h2>Motion is evidence. Words are templates.</h2>
          <div className="principles">
            <div>
              <h3>Ships move when the log says so</h3>
              <p>
                A ship appears when its arrival event starts, holds a fixed anchorage slot, is piloted in over the
                recorded interval to “Berthed, cargo start”, and leaves after the disclosed occupancy assumption.
                Calls without a recorded arrival are listed as awaiting clearance rather than parked on the map. The
                paths are drawn; the timing is data.
              </p>
            </div>
            <div>
              <h3>Two lanes explain a wait</h3>
              <p>
                Each call’s paperwork and its ship share one clock. A yellow anchorage bar under a coral loop of
                returned documents makes the bottleneck obvious to someone who has never seen a port.
              </p>
            </div>
            <div>
              <h3>The tour drives the real thing</h3>
              <p>
                The guided investigation doesn’t play a video. It moves the replay clock, selects the ship, opens
                the process graph, runs the solver and the simulator, and quotes their results back.
              </p>
            </div>
          </div>
        </section>

        <section className="chapter" id="limitations">
          <span className="kicker">07 · THE BOUNDARIES</span>
          <h2>What this cannot establish.</h2>
          <ul className="limits">
            <li>
              <b>Synthetic operations.</b> No live AIS feed or proprietary data. Geography comes from
              OpenFreeMap/OpenStreetMap; berth markers and vessel paths are approximate and illustrative.
            </li>
            <li>
              <b>Controlled assumptions.</b> Missing arrival and service information uses configured means. An
              eight-cutoff historical backtest produced seven forecastable windows and one incompatible historical
              berth assignment; timing error ranged from 0.02 to 9.30 hours with inconsistent interval coverage. The
              simulator supports controlled comparisons, not calibrated arrival forecasts.{" "}
              <a href="https://github.com/abdulaz06/berthiq/blob/main/DOCS/SIMULATOR_VALIDATION.md">
                Read the validation.
              </a>
            </li>
            <li>
              <b>Feasible is not optimal.</b> A bounded solve may return a feasible incumbent. UNKNOWN means no plan
              was found within the budget, not proof of infeasibility. Every returned plan passes an independent
              constraint checker.
            </li>
            <li>
              <b>Separate baselines.</b> Deterministic FIFO comparisons use the candidate staffing; the simulated
              no-change baseline keeps the original staffing. One replication illustrates the schedule; all
              replications determine the statistics.
            </li>
            <li>
              <b>Demo scope.</b> Private studies use browser-tab session tokens and expire; uploads are off by
              default. This is not an authenticated operations system, a live tracking service or autonomous control.
            </li>
          </ul>
        </section>

        <section className="chapter">
          <span className="kicker">08 · VERIFICATION & CREDITS</span>
          <h2>Built to be reproduced.</h2>
          <p>
            Same dataset and seed, same output. CI runs Ruff, mypy and the PostgreSQL-backed pytest suite; ESLint,
            TypeScript, Vitest and the provenance lint; a production build; and a real Playwright journey against a
            migrated, seeded database — including the guided investigation end to end, replay continuity, an
            infeasible constraint, private uploads, and axe accessibility scans at desktop and phone sizes.
          </p>
          <p>
            BerthIQ began as a collaboration between Abdul and Shravani. Their implementations, committed risk model
            and contribution history are preserved; later work is recorded in reviewed milestone pull requests.
          </p>
          <div className="case-links">
            <Link className="site-button" href="/console?story=1">
              <Play size={16} /> Start the investigation
            </Link>
            <a className="text-link" href="https://github.com/abdulaz06/berthiq">
              Inspect the source <ArrowRight size={16} />
            </a>
          </div>
        </section>
      </article>

      <footer className="site-footer">
        <Link href="/" className="site-brand">
          <QFlagMark size={22} />
          <span>
            Berth<b>IQ</b>
          </span>
        </Link>
        <p>Synthetic data. Explicit assumptions. Inspectable decisions.</p>
        <nav aria-label="Footer">
          <a href="https://github.com/abdulaz06/berthiq/blob/main/DOCS/DECISION_ENGINE.md">Decision engine docs ↗</a>
        </nav>
      </footer>
    </main>
  );
}

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Play } from "lucide-react";
import story from "@/lib/fixtures/landing_story.json";
import simulation from "@/lib/fixtures/simulation_result.example.json";
import optimization from "@/lib/fixtures/optimization_result.example.json";
import evaluation from "../../DOCS/REFERENCE_EVALUATION.json";
import { verdict } from "@/lib/verdict";
import type { OptimizationResult, SimulationResult } from "@/lib/api/contracts";
import { ProvenanceBadge } from "@/components/provenance/ProvenanceBadge";
import { QFlagMark } from "@/components/brand/QFlagMark";
import { HeroCase } from "@/components/landing/HeroCase";
import shots from "@/public/images/steps.json";
import "./site.css";

const result = verdict(simulation as unknown as SimulationResult, optimization as unknown as OptimizationResult);
const staffed = (simulation as unknown as SimulationResult).tradeoffs.reviewer_staffed_hours;
const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", ...options }).format(story.moment!.time);
const when = `${fmt({ hour: "2-digit", minute: "2-digit" })} on ${fmt({ day: "numeric", month: "long" })}`;

const steps = [
  {
    n: "01",
    verb: "Replay",
    title: "See the harbor as the log recorded it.",
    body: "A week of port calls rebuilt from events: ships arrive, wait at anchor, take a pilot and berth on the times the log records.",
    proof: `${story.discovery.steps.toLocaleString()} recorded steps`,
    provenance: "observed" as const,
    image: "step-harbor.png",
    alt: "BerthIQ harbor replay with ships waiting at anchor and empty berths",
  },
  {
    n: "02",
    verb: "Explain",
    title: "Trace every wait to its cause.",
    body: "Each ship gets a two-lane timeline: its paperwork above, the ship below. Process discovery shows the same loop across six months of calls.",
    proof: `${story.discovery.bottleneck}: ${story.discovery.mean_wait_hours?.toFixed(1)} h mean wait to start`,
    provenance: "observed" as const,
    image: "step-why.png",
    alt: "A call's timeline showing returned documents above a long anchorage wait",
  },
  {
    n: "03",
    verb: "Forecast",
    title: "Flag who will be late next.",
    body: "A gradient-boosting model scores every call still in progress from its steps so far, and shows which factors moved the estimate.",
    proof: `${story.risk.likely_late} of ${story.risk.open} open calls above 66%`,
    provenance: "predicted" as const,
    image: "step-risk.png",
    alt: "Risk board ranking open calls by chance of missing their service window",
  },
  {
    n: "04",
    verb: "Decide",
    title: "Test a change before making it.",
    body: "A constraint solver builds a plan that breaks no hard rule. A simulator replays the open calls under today’s plan and yours, with identical random delays.",
    proof: `Average wait ${result.waiting!.before.toFixed(1)} h → ${result.waiting!.after.toFixed(1)} h`,
    provenance: "simulated" as const,
    image: "step-verdict.png",
    alt: "Scenario verdict comparing today's plan with five reviewers",
  },
];

export default function Home() {
  return (
    <main className="site">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <Link href="/" className="site-brand" aria-label="BerthIQ home">
          <QFlagMark size={26} />
          <span>
            Berth<b>IQ</b>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#problem">The problem</a>
          <a href="#how">How it works</a>
          <Link href="/case-study">Engineering story</Link>
          <a href="https://github.com/abdulaz06/berthiq" target="_blank" rel="noreferrer">
            Source <ArrowUpRight size={13} />
          </a>
        </nav>
        <Link href="/console" className="site-button small">
          Open the console
        </Link>
      </header>

      <section className="hero" id="main-content" tabIndex={-1}>
        <div className="hero-copy">
          <span className="kicker">
            <i className="q-flag" aria-hidden="true" />
            PORT-CALL DECISION SUPPORT · KHALIFA PORT, ABU DHABI
          </span>
          <h1>
            Why is this ship <em>waiting?</em>
          </h1>
          <p className="lede">
            Ships can ride at anchor for days while berths stand empty. BerthIQ reads a port’s event log to find
            out why, flags which calls will be late next, and tests what the port could change — before anyone
            changes it.
          </p>
          <div className="hero-actions">
            <Link className="site-button" href="/console?story=1">
              <Play size={17} /> Start the investigation
            </Link>
            <Link className="text-link" href="/console">
              Explore the console <ArrowRight size={16} />
            </Link>
          </div>
          <p className="fine">Three-minute guided walkthrough · no sign-up · synthetic operations, real decision models</p>
        </div>
        <HeroCase />
      </section>

      <section className="puzzle" id="problem">
        <div className="puzzle-copy">
          <span className="kicker">THE PUZZLE</span>
          <h2>
            {story.moment!.anchored} ships at anchor.
            <br />
            <em>
              {story.moment!.idle === story.moment!.berths ? "Every" : `${story.moment!.idle} of ${story.moment!.berths}`}{" "}
              berth empty.
            </em>
          </h2>
          <p>
            At {when} in the reference week, {story.moment!.anchored} ships were waiting outside Khalifa Port and{" "}
            {story.moment!.idle} of its {story.moment!.berths} berths were free. Space alongside was not the problem.
          </p>
          <p>
            A ship can’t come in until customs, health and port authorities clear its documents. When a reviewer
            sends them back, the agent fixes them, they rejoin the queue — and the ship keeps waiting, burning time
            its owners booked against a service window.
          </p>
        </div>
        <figure className="puzzle-figure" aria-label={`${story.moment!.anchored} ships at anchor and ${story.moment!.idle} empty berths`}>
          <svg viewBox="0 0 520 360" aria-hidden="true">
            <defs>
              <pattern id="chart" width="26" height="26" patternUnits="userSpaceOnUse">
                <path d="M26 0H0V26" fill="none" stroke="#17303d" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="520" height="360" fill="url(#chart)" />
            <ellipse cx="170" cy="150" rx="150" ry="104" className="anchorage" />
            <text x="58" y="56" className="label">ANCHORAGE</text>
            {Array.from({ length: story.moment!.anchored }, (_, i) => {
              const a = i * 2.39996;
              const r = 76 * Math.sqrt((i + 0.6) / story.moment!.anchored);
              return (
                <g key={i} transform={`translate(${170 + Math.cos(a) * r * 1.4} ${150 + Math.sin(a) * r}) rotate(-40)`} className="ship">
                  <path d="M0-17 7-7v20l-3 5h-8l-3-5V-7Z" />
                  <path d="M0-17v-11" className="mast" />
                  <rect x="1" y="-29" width="9" height="6" className="flag" />
                </g>
              );
            })}
            <path d="M330 340 456 64h40v276Z" className="land" />
            {Array.from({ length: story.moment!.berths }, (_, i) => (
              <g key={i} transform={`translate(${447 - i * 14.4} ${84 + i * 31.5}) rotate(-24)`}>
                <rect x="-40" y="-9" width="34" height="18" rx="3" className="berth" />
              </g>
            ))}
            <text x="478" y="56" className="label" textAnchor="end">BERTHS</text>
          </svg>
          <figcaption>
            Illustration of the recorded moment. <ProvenanceBadge provenance="observed" />
          </figcaption>
        </figure>
      </section>

      <section className="how" id="how">
        <div className="section-head">
          <span className="kicker">HOW BERTHIQ ANSWERS IT</span>
          <h2>An investigation in four moves.</h2>
          <p>
            Every number on screen carries its lineage — observed, predicted, optimized or simulated — so you always
            know whether you are looking at a fact, an estimate or a what-if.
          </p>
        </div>
        <ol className="steps">
          {steps.map((s) => (
            <li key={s.n}>
              <div className="step-copy">
                <span className="step-n">
                  {s.n} <b>{s.verb}</b>
                </span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                <span className="proof">
                  {s.proof} <ProvenanceBadge provenance={s.provenance} />
                </span>
              </div>
              <div
                className={`step-shot ${
                  shots[s.image as keyof typeof shots].height > shots[s.image as keyof typeof shots].width ? "portrait" : ""
                }`}
              >
                <Image
                  src={`/images/${s.image}`}
                  alt={s.alt}
                  width={shots[s.image as keyof typeof shots].width}
                  height={shots[s.image as keyof typeof shots].height}
                  sizes="(max-width: 900px) 100vw, 58vw"
                />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="verdict-band">
        <div>
          <span className="kicker">THE REFERENCE EXPERIMENT · 20 MATCHED SIMULATIONS</span>
          <h2>What if the port staffed five reviewers instead of three?</h2>
          <div className="verdict-numbers">
            <div>
              <span>Average wait per open call</span>
              <strong>
                {result.waiting!.before.toFixed(1)}
                <small>h</small>
                <ArrowRight size={28} />
                <em>{result.waiting!.after.toFixed(1)}</em>
                <small>h</small>
              </strong>
              <ProvenanceBadge provenance="simulated" />
            </div>
            <div>
              <span>The cost: reviewer time staffed</span>
              <strong>
                {staffed[0].value}
                <small>h</small>
                <ArrowRight size={28} />
                <em className="cost">{staffed[1].value}</em>
                <small>h</small>
              </strong>
              <ProvenanceBadge provenance="simulated" />
            </div>
            <div>
              <span>Open calls started inside their window</span>
              <strong>
                {(simulation as unknown as SimulationResult).headline.window_compliance[0].value}
                <small>%</small>
                <ArrowRight size={28} />
                <em className="flat">{(simulation as unknown as SimulationResult).headline.window_compliance[1].value}</em>
                <small>%</small>
              </strong>
              <ProvenanceBadge provenance="simulated" />
            </div>
          </div>
          <p>
            Shorter waits, paid for in reviewer hours — and no call that was already late is rescued. Under the same
            staffing, the solver’s schedule ties first-come-first-served: the gain comes from capacity, not clever
            sequencing. A decision tool should tell you that, too.
          </p>
          <Link className="site-button" href="/console?story=1">
            Run it yourself <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <section className="engine">
        <div className="section-head">
          <span className="kicker">UNDER THE HOOD</span>
          <h2>Each number has exactly one owner.</h2>
        </div>
        <div className="engine-grid">
          {[
            ["Analytics", "observed", "PM4Py process discovery and event-log analytics own the facts."],
            [
              "Model",
              "predicted",
              `scikit-learn gradient boosting with SHAP owns the probabilities. PR-AUC ${evaluation.model.pr_auc.toFixed(3)} on ${evaluation.test_prefixes.toLocaleString()} chronologically held-out prefixes.`,
            ],
            ["Solver", "optimized", "OR-Tools CP-SAT owns the assignments; an independent checker re-verifies every hard constraint."],
            ["Simulator", "simulated", "SimPy owns the counterfactuals: matched random streams, p10–p90 spreads, deterministic seeds."],
          ].map(([name, provenance, body]) => (
            <article key={name}>
              <ProvenanceBadge provenance={provenance as "observed"} />
              <h3>{name}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <p className="engine-foot">
          FastAPI · PostgreSQL · Next.js · TypeScript · MapLibre. No language model anywhere in the decision path:
          sentences on screen are templates over computed numbers.{" "}
          <Link href="/case-study">Read the engineering story →</Link>
        </p>
      </section>

      <section className="honesty" id="limits">
        <span className="kicker">WHAT THIS IS — AND ISN’T</span>
        <ul>
          <li>
            <b>Synthetic operations, real geography.</b> The port calls are generated; Khalifa Port’s layout comes
            from public OpenStreetMap data. Berth positions are approximate.
          </li>
          <li>
            <b>Illustrative paths, recorded timing.</b> Ships move when the log says they moved. The tracks between
            are drawn, not live AIS.
          </li>
          <li>
            <b>Simulated, not measured.</b> Outcomes compare plans under stated assumptions. They are not savings
            any real port has achieved.
          </li>
        </ul>
        <Link href="/case-study#limitations" className="text-link">
          Read every limitation <ArrowRight size={16} />
        </Link>
      </section>

      <section className="final">
        <QFlagMark size={44} />
        <h2>Follow one ship from anchor to berth.</h2>
        <Link className="site-button" href="/console?story=1">
          <Play size={17} /> Start the investigation
        </Link>
      </section>

      <footer className="site-footer">
        <Link href="/" className="site-brand">
          <QFlagMark size={22} />
          <span>
            Berth<b>IQ</b>
          </span>
        </Link>
        <p>
          A maritime decision-support study by Abdul and Shravani.
          <br />
          Synthetic operational data on real port geography.
        </p>
        <nav aria-label="Footer">
          <Link href="/case-study">Engineering story</Link>
          <Link href="/console">Console</Link>
          <a href="https://github.com/abdulaz06/berthiq">GitHub ↗</a>
        </nav>
      </footer>
    </main>
  );
}

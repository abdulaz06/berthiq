import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowUpRight, Waves } from "lucide-react";
import { ProvenanceBadge } from "@/components/provenance/ProvenanceBadge";
import evaluation from "../../../DOCS/REFERENCE_EVALUATION.json";
import "../public.css";
import "./story.css";
export const metadata = {
  title: "Inside the decision engine | BerthIQ",
  description:
    "How BerthIQ connects event data, risk prediction, constrained scheduling and matched simulation—with explicit limits.",
};
export default function CaseStudy() {
  return (
    <main className="public-site story">
      <header className="public-header">
        <Link className="public-brand" href="/">
          <Waves />
          <span>
            Berth<b>IQ</b>
          </span>
        </Link>
        <Link className="text-button story-back" href="/">
          <ArrowLeft size={15} /> Back to the platform
        </Link>
        <Link className="public-button small" href="/console">
          Enter console
          <ArrowUpRight size={16} />
        </Link>
      </header>
      <article>
        <section className="story-hero">
          <span className="public-eyebrow">
            ENGINEERING CASE STUDY / BERTHIQ
          </span>
          <h1>
            A decision is only as useful
            <br />
            as the evidence behind it.
          </h1>
          <p>
            Building a port-call intelligence system that makes its assumptions,
            constraints and tradeoffs inspectable.
          </p>
          <div className="story-meta">
            <span>NEXT.JS + FASTAPI + POSTGRESQL</span>
            <span>PM4PY / SCIKIT-LEARN / OR-TOOLS / SIMPY</span>
          </div>
        </section>
        <section className="story-section">
          <span className="public-eyebrow">01 / THE PROBLEM</span>
          <h2>
            A berth delay can begin
            <br />
            long before the berth.
          </h2>
          <p>
            Documents are submitted, checked and sometimes returned. Review
            capacity affects approval readiness. Arrival, pilot availability and
            berth compatibility constrain the schedule that follows. Optimizing
            the last step alone misses that chain.
          </p>
          <p>
            BerthIQ treats these stages as one inspectable decision loop. The
            reference environment is a deterministically generated Khalifa Port
            event log. Its designed bottleneck is authority review; process
            discovery identifies that bottleneck from the observable log.
          </p>
        </section>
        <section className="story-section">
          <span className="public-eyebrow">02 / THE ARCHITECTURE</span>
          <h2>
            Different methods.
            <br />
            Clear responsibilities.
          </h2>
          <div className="story-pipeline">
            {[
              [
                "Canonical events",
                "CSV/XLSX normalization, versioned validation and PostgreSQL persistence",
              ],
              [
                "Observe & predict",
                "PM4Py directly-follows graph; prefix-only HGB risk with signed SHAP factors",
              ],
              [
                "Propose",
                "CP-SAT jointly schedules reviewers, compatible berths and limited pilot capacity",
              ],
              [
                "Test & explain",
                "SimPy compares matched per-case draws; evidence templates phrase the computed result",
              ],
            ].map(([t, p], i) => (
              <div key={t}>
                <span>0{i + 1}</span>
                <h3>{t}</h3>
                <p>{p}</p>
              </div>
            ))}
          </div>
          <p>
            Next.js renders a responsive workspace over a FastAPI modular
            monolith. Schemas define the API contracts; SQLAlchemy stores
            events, scenario snapshots and immutable result payloads. Training
            stays offline. Two bounded in-process workers handle compute jobs;
            deployment requires one backend process.
          </p>
          <p>
            There is no runtime language model generating plans, probabilities
            or KPI claims. Each numerical method owns its own output, and
            provenance follows that output into the interface.
          </p>
        </section>
        <section className="story-section">
          <span className="public-eyebrow">03 / MODEL EVALUATION</span>
          <h2>
            Predict only from
            <br />
            what was known.
          </h2>
          <p>
            The committed HistGradientBoosting model uses chronological
            evaluation and observed event prefixes. Future completion data and
            the generator’s hidden ground truth are excluded from inference and
            planning. SHAP contributions explain the model’s local estimate;
            they are not causal claims.
          </p>
          <div className="story-metrics">
            {[
              ["PR-AUC", evaluation.model.pr_auc.toFixed(4)],
              ["AUROC", evaluation.model.auroc.toFixed(4)],
              ["Brier score", evaluation.model.brier.toFixed(4)],
            ].map(([label, value]) => (
              <div key={label}>
                <span>
                  {label}
                  <ProvenanceBadge provenance="observed" />
                </span>
                <strong>{value}</strong>
                <small>Held-out synthetic evaluation</small>
              </div>
            ))}
          </div>
          <p className="story-note">
            {evaluation.test_prefixes.toLocaleString()} held-out prefixes. These
            scores measure performance within the synthetic environment; they do
            not establish accuracy at an operating port.
          </p>
        </section>
        <section className="story-section">
          <span className="public-eyebrow">
            04 / A REPRODUCIBLE COUNTERFACTUAL
          </span>
          <h2>Less waiting has a cost.</h2>
          <p>
            The reference study increases reviewer capacity to five. Twenty
            matched replications share the same case-keyed random draws,
            isolating the scheduling and staffing change from different sampled
            workloads.
          </p>
          <div className="story-outcome">
            <div>
              <span>
                Average waiting time <ProvenanceBadge provenance="simulated" />
              </span>
              <strong>
                {evaluation.simulation.avg_waiting_time[0].value.toFixed(2)}{" "}
                <small>→</small>{" "}
                {evaluation.simulation.avg_waiting_time[1].value.toFixed(2)}
                <small> hours</small>
              </strong>
            </div>
            <p>
              Window compliance stays at 0% because the active cohort is already
              late at the cutoff. Conflicts remain zero under resource queues.
              The extra reviewers consume more staffed hours. No artificial gain
              is added to any metric.
            </p>
          </div>
          <Image
            src="/images/decision-evidence.png"
            alt="Simulation comparison displaying reduced waiting, unchanged compliance and conflicts, higher staffing costs and replication uncertainty"
            width={1920}
            height={1080}
            sizes="(max-width:760px) 100vw, 1000px"
          />
          <p className="story-note">
            Screenshot of a computed reference run. p10–p90 bands describe
            replication variability, not confidence in real-world savings.
          </p>
        </section>
        <section className="story-section" id="limitations">
          <span className="public-eyebrow">05 / THE BOUNDARIES</span>
          <h2>
            A useful demo is honest
            <br />
            about what it cannot establish.
          </h2>
          <ul className="story-limits">
            <li>
              <strong>Synthetic operations.</strong> No live AIS feed or
              proprietary employer data is included. Geographic context comes
              from OpenFreeMap/OpenStreetMap; operational berth markers and
              vessel positions are approximate.
            </li>
            <li>
              <strong>Controlled assumptions.</strong> Missing arrival and
              service information uses configured assumptions. Resource rules,
              demand, rework and weather are simplified. An eight-cutoff
              synthetic historical backtest produced seven forecastable windows
              and one incompatible historical berth assignment. Timing error
              ranged from 0.02 to 9.30 hours; interval coverage was
              inconsistent. The simulator supports controlled comparisons, not
              calibrated arrival forecasts.{" "}
              <a href="https://github.com/abdulaz06/berthiq/blob/main/DOCS/SIMULATOR_VALIDATION.md">
                Read the complete validation and limitations.
              </a>
            </li>
            <li>
              <strong>Feasible is not optimal.</strong> A bounded solve may
              return a feasible incumbent. UNKNOWN means no feasible plan was
              found within the budget, not proof of infeasibility. Every
              returned plan passes an independent constraint checker.
            </li>
            <li>
              <strong>Separate baselines.</strong> Deterministic FIFO
              comparisons use candidate staffing. Simulation’s no-change
              baseline preserves original staffing, with shared external
              closures. One replication illustrates the schedule; all
              replications determine the outcome statistics.
            </li>
            <li>
              <strong>Demo scope.</strong> Private studies use browser-tab
              session tokens and expire. Uploads are disabled by default. This
              is not an authenticated enterprise operations system, live vessel
              tracking service or autonomous control product.
            </li>
          </ul>
        </section>
        <section className="story-section">
          <span className="public-eyebrow">
            06 / VERIFICATION & CONTRIBUTIONS
          </span>
          <h2>Built to be reproduced.</h2>
          <p>
            CI checks the backend, generated contracts, frontend and production
            build, then provisions PostgreSQL for an integrated Playwright
            journey. It discovers the process, solves and simulates a real
            scenario, checks private export and reload, exercises an infeasible
            constraint, and tests desktop/mobile interaction.
          </p>
          <p>
            The original project was a collaboration by Abdul and Shravani.
            Existing backend implementations, the committed risk model and
            contribution history are preserved. The launch sprint adds the
            decision engine and responsive maritime workspace, with work
            recorded in milestone pull requests.
          </p>
          <div className="story-links">
            <a
              className="public-button"
              href="https://github.com/abdulaz06/berthiq"
            >
              Inspect the source
              <ArrowUpRight size={16} />
            </a>
            <Link className="text-button" href="/console?tour=1">
              Take the guided demo
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </section>
      </article>
      <footer className="public-footer">
        <Link href="/" className="public-brand">
          <Waves />
          <span>
            Berth<b>IQ</b>
          </span>
        </Link>
        <p>Synthetic data. Explicit assumptions. Inspectable decisions.</p>
        <a href="https://github.com/abdulaz06/berthiq/blob/main/DOCS/DECISION_ENGINE.md">
          Technical documentation ↗
        </a>
      </footer>
    </main>
  );
}

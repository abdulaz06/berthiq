import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Compass,
  GitBranch,
  Layers3,
  Play,
  ShieldCheck,
  Waves,
} from "lucide-react";
import "./public.css";

export default function Home() {
  return (
    <main className="public-site">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="public-header">
        <Link href="/" className="public-brand" aria-label="BerthIQ home">
          <Waves size={28} />
          <span>
            Berth<b>IQ</b>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#product">The platform</a>
          <Link href="/case-study">Engineering story</Link>
          <a
            href="https://github.com/abdulaz06/berthiq"
            target="_blank"
            rel="noreferrer"
          >
            Source <ArrowUpRight size={13} />
          </a>
        </nav>
        <Link href="/console" className="public-button small">
          Enter console <ArrowUpRight size={16} />
        </Link>
      </header>
      <section className="public-hero" id="main-content">
        <div className="hero-grid">
          <div>
            <div className="public-eyebrow">
              <i />
              PORT-CALL INTELLIGENCE / KHALIFA, UAE
            </div>
            <h1>
              Every port call.
              <br />A clearer <em>decision.</em>
            </h1>
            <p className="hero-description">
              See the pressure building. Understand what drives it. Test the
              next move before it reaches the berth.
            </p>
            <div className="hero-actions">
              <Link className="public-button" href="/console">
                Explore the control room <ArrowUpRight size={19} />
              </Link>
              <Link className="text-button" href="/console?tour=1">
                <Play size={15} /> Take the guided demo
              </Link>
            </div>
            <p className="hero-disclosure">
              No account required. Synthetic operations. Real decision models.
            </p>
          </div>
          <div className="hero-coordinate">
            <svg viewBox="0 0 320 320" aria-hidden="true">
              <circle cx="160" cy="160" r="125" />
              <circle cx="160" cy="160" r="93" />
              <circle cx="160" cy="160" r="35" />
              <path d="M160 8v304M8 160h304M52 52l216 216M52 268 268 52" />
              <path
                className="compass-needle"
                d="m160 55 18 123-18-18-18 18Z"
              />
              <text x="160" y="27" textAnchor="middle">
                N
              </text>
            </svg>
            <div>
              <span>24.81° N / 54.65° E</span>
              <strong>Khalifa Port</strong>
              <small>Abu Dhabi · Arabian Gulf</small>
            </div>
          </div>
        </div>
        <div className="console-showcase">
          <div className="showcase-bar">
            <span>
              <i />
              BERTHIQ / OPERATIONS CONSOLE
            </span>
            <span>REFERENCE DATASET · JULY 2026</span>
            <Compass size={16} />
          </div>
          <Image
            src="/images/control-room.png"
            alt="BerthIQ dark maritime console showing Khalifa Port geography, vessels, risk evidence and replay controls"
            width={1920}
            height={1080}
            priority
            sizes="(max-width: 760px) 100vw, 90vw"
          />
          <div className="showcase-caption">
            <span>Observe. Explain. Re-plan.</span>
            <Link href="/console">
              Open the interactive workspace <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
        <div className="hero-bottom">
          <span>BUILT TO MAKE COMPLEX OPERATIONS LEGIBLE</span>
          <a href="#product">
            Follow the decision <ArrowDown size={14} />
          </a>
        </div>
      </section>
      <section id="product" className="public-section product-section">
        <div className="section-intro">
          <span className="public-eyebrow">01 / THE CONNECTED WORKSPACE</span>
          <h2>
            From a delayed call
            <br />
            to a defensible next move.
          </h2>
          <p>
            Port operations are a chain of decisions. BerthIQ connects the event
            log, the risk signal and the proposed schedule, so every
            recommendation keeps its evidence.
          </p>
        </div>
        <div className="product-cards">
          {[
            {
              n: "01",
              icon: Compass,
              title: "Read the harbor",
              body: "A geographic port view, selectable calls and event-driven replay put the operational picture in context.",
              link: "Explore operations",
              url: "/console",
            },
            {
              n: "02",
              icon: GitBranch,
              title: "Find the friction",
              body: "Discover process variants, follow rework loops and inspect the model factors behind a call’s predicted risk.",
              link: "Follow the guided demo",
              url: "/console?tour=1",
            },
            {
              n: "03",
              icon: Layers3,
              title: "Test the tradeoff",
              body: "Change staffing or berth constraints. Compare a feasible plan with matched simulation outcomes and the resources it consumes.",
              link: "Read the engineering story",
              url: "/case-study",
            },
          ].map(({ n, icon: Icon, title, body, link, url }) => (
            <article key={n}>
              <div>
                <Icon size={28} strokeWidth={1} />
                <span>{n}</span>
              </div>
              <h3>{title}</h3>
              <p>{body}</p>
              <Link href={url}>
                {link}
                <ArrowUpRight size={15} />
              </Link>
            </article>
          ))}
        </div>
      </section>
      <section className="public-section method-section">
        <div>
          <span className="public-eyebrow">
            02 / EVIDENCE BEFORE CONFIDENCE
          </span>
          <h2>
            Every number
            <br />
            has a role.
          </h2>
          <p>
            Observed events describe what happened. Predictions estimate risk.
            Optimization proposes a feasible plan. Simulation tests that plan
            under explicit assumptions.
          </p>
          <Link className="text-button" href="/case-study">
            Go inside the decision engine <ArrowRight size={17} />
          </Link>
        </div>
        <div className="method-ledger">
          {[
            ["Observed", "Canonical events & process discovery", "01"],
            ["Predicted", "Prefix-only risk & signed SHAP factors", "02"],
            ["Optimized", "Reviewer and berth constraints / CP-SAT", "03"],
            ["Simulated", "Matched random draws / SimPy", "04"],
          ].map(([title, desc, index]) => (
            <div key={title}>
              <span>{index}</span>
              <div>
                <strong>{title}</strong>
                <p>{desc}</p>
              </div>
              <i className={title.toLowerCase()} />
            </div>
          ))}
        </div>
      </section>
      <section className="public-section honesty-section">
        <ShieldCheck size={34} strokeWidth={1} />
        <div>
          <span className="public-eyebrow">A TRANSPARENT ENGINEERING DEMO</span>
          <h2>Designed to be questioned.</h2>
          <p>
            Operational data is synthetic. Vessel positions and berth locations
            are approximate. Reported changes are simulated outcomes, not
            measured port savings. The models, constraints and limitations are
            open for inspection.
          </p>
        </div>
        <Link href="/case-study#limitations" className="text-button">
          Read the boundaries <ArrowUpRight size={16} />
        </Link>
      </section>
      <section className="public-section final-cta">
        <span className="public-eyebrow">
          YOUR NEXT DECISION STARTS WITH CONTEXT
        </span>
        <h2>Step into the control room.</h2>
        <Link className="public-button" href="/console">
          Launch BerthIQ <ArrowUpRight size={19} />
        </Link>
      </section>
      <footer className="public-footer">
        <Link href="/" className="public-brand">
          <Waves size={23} />
          <span>
            Berth<b>IQ</b>
          </span>
        </Link>
        <p>
          A maritime operations engineering study.
          <br />
          Original collaboration by Abdul and Shravani.
        </p>
        <Link href="/case-study">Methodology & limitations</Link>
        <a href="https://github.com/abdulaz06/berthiq">GitHub ↗</a>
      </footer>
    </main>
  );
}

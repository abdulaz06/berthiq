"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import story from "@/lib/fixtures/landing_story.json";
import { ProvenanceBadge } from "@/components/provenance/ProvenanceBadge";

const hero = story.hero;
const W = 600;
const X0 = 84;
const DURATION = 7000;
const HOUR = 3_600_000;
const span = hero.to - hero.from;
const x = (t: number) => X0 + ((t - hero.from) / span) * (W - X0 - 6);
const anchor = hero.ship.find((s) => s.kind === "anchor")!;
const day = (t: number) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(t);

/**
 * The landing page's opening exhibit: one real call from the reference
 * dataset, replayed. The paperwork loops on the top lane while the ship sits
 * at anchor on the bottom lane, and the hour counter keeps climbing.
 */
export function HeroCase() {
  const [progress, setProgress] = useState(0);
  const [run, setRun] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const done = requestAnimationFrame(() => setProgress(1));
      return () => cancelAnimationFrame(done);
    }
    let frame = 0;
    let start = 0;
    const tick = (now: number) => {
      start ||= now;
      const p = Math.min((now - start) / DURATION, 1);
      setProgress(p);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      frame = requestAnimationFrame(tick);
    });
    if (host.current) observer.observe(host.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [run]);
  // Ease the sweep so the long anchorage stretch reads as long.
  const now = hero.from + span * (1 - (1 - progress) ** 1.6);
  const anchored = Math.max(0, Math.min(now, anchor.end) - anchor.start) / HOUR;
  const returned = hero.desk.filter((s) => s.kind === "rejected" && s.end <= now).length;
  const queued = hero.desk
    .filter((s) => s.kind === "queue")
    .reduce((h, s) => h + Math.max(0, Math.min(now, s.end) - s.start), 0) / HOUR;
  const done = progress >= 1;
  return (
    <div className="hero-case" ref={host}>
      <header>
        <div>
          <span className="kicker">
            <i className="q-flag" aria-hidden="true" /> A REAL CALL FROM THE REFERENCE WEEK
          </span>
          <strong>
            {hero.id} · {hero.vessel_type} ship · {Math.round(hero.loa ?? 0)} m
          </strong>
        </div>
        <ProvenanceBadge provenance="observed" />
      </header>
      <div className="hero-counter" aria-hidden="true">
        <b>{anchored.toFixed(0)}</b>
        <span>
          hours
          <br />
          at anchor
        </span>
      </div>
      <svg viewBox={`0 0 ${W} 132`} role="img" aria-label={`${hero.headline} ${hero.detail.join(" ")}`}>
        <defs>
          <clipPath id="sweep">
            <rect x="0" y="0" width={x(now)} height="132" />
          </clipPath>
        </defs>
        <text x="0" y="32" className="lane-label">PAPERWORK</text>
        <text x="0" y="84" className="lane-label">THE SHIP</text>
        <rect x={X0} y="14" width={W - X0 - 6} height="28" rx="4" className="lane" />
        <rect x={X0} y="66" width={W - X0 - 6} height="28" rx="4" className="lane" />
        <g clipPath="url(#sweep)">
          {hero.desk.map((s, i) => (
            <rect key={i} x={x(s.start)} y="18" width={Math.max(x(s.end) - x(s.start), 2)} height="20" rx="2.5" className={`desk-${s.kind}`} />
          ))}
          {hero.ship
            .filter((s) => s.kind !== "alongside")
            .map((s, i) => (
              <rect key={i} x={x(s.start)} y="70" width={Math.max(x(s.end) - x(s.start), 2)} height="20" rx="2.5" className={`ship-${s.kind}`} />
            ))}
          {hero.desk
            .filter((s) => s.kind === "rejected")
            .map((s, i) => (
              <text key={i} x={x(s.end)} y="56" className="mark" textAnchor="middle">
                ✕
              </text>
            ))}
        </g>
        {!done && <line x1={x(now)} x2={x(now)} y1="8" y2="100" className="playhead" />}
        {done && (
          <g className="berthed">
            <rect x={x(hero.to) - 4} y="66" width="8" height="28" rx="2" />
          </g>
        )}
        <text x={X0} y="122" className="tick">{day(hero.from)}</text>
        <text x={W - 6} y="122" className="tick" textAnchor="end">
          {done ? `Berthed at ${hero.berth} · ${day(hero.to)}` : day(now)}
        </text>
      </svg>
      <dl className="hero-facts">
        <div className={returned ? "on" : ""}>
          <dt>Documents returned</dt>
          <dd>{returned}×</dd>
        </div>
        <div className={queued >= 1 ? "on" : ""}>
          <dt>In the review queue</dt>
          <dd>{queued.toFixed(0)} h</dd>
        </div>
        <div className={done ? "on" : ""}>
          <dt>Compatible berth idle</dt>
          <dd>{done ? `${Math.round((hero.idle_berth_share ?? 0) * 100)}%` : "—"}</dd>
        </div>
      </dl>
      <footer>
        <ul className="hero-key" aria-hidden="true">
          <li><i className="desk-documents" />Agent paperwork</li>
          <li><i className="desk-queue" />Review queue</li>
          <li><i className="desk-rejected" />Returned</li>
          <li><i className="desk-review" />Approved</li>
          <li><i className="ship-anchor" />At anchor</li>
          <li><i className="ship-pilotage" />Pilot to berth</li>
        </ul>
        <button
          className="replay"
          onClick={() => {
            setProgress(0);
            setRun((r) => r + 1);
          }}
          aria-label="Replay the timeline"
        >
          <RotateCcw size={14} />
        </button>
      </footer>
    </div>
  );
}

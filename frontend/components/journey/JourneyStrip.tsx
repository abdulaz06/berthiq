import type { Journey } from "@/lib/journey";
import { portTime } from "@/lib/operations";
import { ProvenanceBadge } from "@/components/provenance/ProvenanceBadge";

const W = 320;
const LANE = 20;
const X0 = 46;

const deskLegend: [string, string][] = [
  ["documents", "Agent paperwork"],
  ["queue", "Review queue"],
  ["rejected", "Returned"],
  ["review", "Approved"],
];

/**
 * Two lanes on one clock: what the paperwork was doing, and what the ship was
 * doing meanwhile. A yellow bar under a coral desk loop is the whole story.
 */
export function JourneyStrip({ journey, compact = false }: { journey: Journey; compact?: boolean }) {
  const span = journey.to - journey.from || 1;
  const x = (t: number) => X0 + ((Math.min(Math.max(t, journey.from), journey.to) - journey.from) / span) * (W - X0 - 4);
  const width = (a: number, b: number) => Math.max(x(b) - x(a), 1.5);
  const deskY = 10;
  const shipY = deskY + LANE + 10;
  const days = Math.max(1, Math.round(span / 86_400_000));
  return (
    <figure className={`journey ${compact ? "compact" : ""}`}>
      <figcaption>
        <span className="eyebrow">Call timeline · {days > 1 ? `${days} days` : "under a day"}</span>
        <ProvenanceBadge provenance="observed" />
      </figcaption>
      <svg viewBox={`0 0 ${W} ${shipY + LANE + 22}`} role="img" aria-label={`${journey.headline} ${journey.detail.join(" ")}`}>
        <text x="0" y={deskY + 14} className="lane-label">Desk</text>
        <text x="0" y={shipY + 14} className="lane-label">Ship</text>
        <rect x={X0} y={deskY} width={W - X0 - 4} height={LANE} className="lane" rx="3" />
        <rect x={X0} y={shipY} width={W - X0 - 4} height={LANE} className="lane" rx="3" />
        {journey.desk.map((s, i) => (
          <rect key={i} x={x(s.start)} y={deskY + 3} width={width(s.start, s.end)} height={LANE - 6} rx="2" className={`seg desk-${s.kind}`}>
            <title>{`${s.label}${s.resource ? ` · ${s.resource}` : ""} · ${portTime(s.start)} → ${portTime(s.end)}`}</title>
          </rect>
        ))}
        {journey.ship.map((s, i) =>
          s.kind === "alongside" ? (
            <g key={i} className="seg ship-alongside">
              <rect x={x(s.start) - 3} y={shipY + 2} width={6} height={LANE - 4} rx="1.5" />
              <title>{`${s.label} · ${portTime(s.start)}`}</title>
            </g>
          ) : (
            <rect key={i} x={x(s.start)} y={shipY + 3} width={width(s.start, s.end)} height={LANE - 6} rx="2" className={`seg ship-${s.kind}`}>
              <title>{`${s.label} · ${portTime(s.start)} → ${portTime(s.end)}`}</title>
            </rect>
          ),
        )}
        {!journey.berthed && (
          <line x1={x(journey.to)} x2={x(journey.to)} y1={deskY - 4} y2={shipY + LANE + 4} className="now" />
        )}
        <text x={X0} y={shipY + LANE + 16} className="tick">{portTime(journey.from)}</text>
        <text x={W - 4} y={shipY + LANE + 16} className="tick" textAnchor="end">
          {journey.berthed ? "Berthed " : "Now "}
          {portTime(journey.to)}
        </text>
      </svg>
      {!compact && (
        <ul className="journey-legend">
          {deskLegend.map(([kind, text]) => (
            <li key={kind}><i className={`desk-${kind}`} />{text}</li>
          ))}
          <li><i className="ship-anchor" />At anchor</li>
          <li><i className="ship-pilotage" />Pilotage</li>
        </ul>
      )}
    </figure>
  );
}

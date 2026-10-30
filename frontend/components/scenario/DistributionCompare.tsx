import type { components } from "@/lib/types/api";
import { ProvenanceBadge } from "@/components/provenance/ProvenanceBadge";
type Distribution = components["schemas"]["KpiDistribution"];

export default function DistributionCompare({
  before,
  after,
}: {
  before: Distribution;
  after: Distribution;
}) {
  const max =
    Math.max(before.p90, after.p90, before.mean, after.mean, 1) * 1.12;
  const x = (v: number) => 90 + (v / max) * 205;
  return (
    <article className="distribution-chart">
      <div className="metric-label">
        {before.name.replaceAll("_", " ")}
        <ProvenanceBadge provenance="simulated" />
      </div>
      <svg
        viewBox="0 0 320 110"
        role="img"
        aria-label={`${before.name}: no-change mean ${before.mean.toFixed(2)}, proposed mean ${after.mean.toFixed(2)} ${before.unit}. Lines show p10 to p90.`}
      >
        {[before, after].map((d, i) => {
          const y = 30 + i * 39;
          const color = i ? "#71d6c4" : "#8cabbc";
          return (
            <g key={i}>
              <text x="0" y={y + 4} fill="#b1c2cd" fontSize="14">
                {i ? "Proposed" : "No change"}
              </text>
              <line x1="90" x2="295" y1={y} y2={y} stroke="#2a3e49" />
              <line
                x1={x(d.p10)}
                x2={x(d.p90)}
                y1={y}
                y2={y}
                stroke={color}
                strokeWidth="3"
              />
              <line
                x1={x(d.p10)}
                x2={x(d.p10)}
                y1={y - 5}
                y2={y + 5}
                stroke={color}
              />
              <line
                x1={x(d.p90)}
                x2={x(d.p90)}
                y1={y - 5}
                y2={y + 5}
                stroke={color}
              />
              <circle cx={x(d.mean)} cy={y} r="5" fill={color} />
              <text
                x={Math.min(280, x(d.mean) + 7)}
                y={y - 10}
                fill={color}
                fontSize="14"
              >
                {d.mean.toFixed(1)}
              </text>
            </g>
          );
        })}
        <text x="90" y="106" fill="#9cb2be" fontSize="12">
          0
        </text>
        <text x="295" y="106" textAnchor="end" fill="#9cb2be" fontSize="12">
          {max.toFixed(1)} {before.unit}
        </text>
      </svg>
    </article>
  );
}

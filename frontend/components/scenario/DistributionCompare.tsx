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
  const x = (v: number) => 100 + (v / max) * 290;
  return (
    <article className="distribution-chart">
      <div className="metric-label">
        {before.name.replaceAll("_", " ")}
        <ProvenanceBadge provenance="simulated" />
      </div>
      <svg
        viewBox="0 0 430 100"
        role="img"
        aria-label={`${before.name}: no-change mean ${before.mean.toFixed(2)}, proposed mean ${after.mean.toFixed(2)} ${before.unit}. Lines show p10 to p90.`}
      >
        {[before, after].map((d, i) => {
          const y = 30 + i * 39;
          const color = i ? "#71d6c4" : "#8cabbc";
          return (
            <g key={i}>
              <text x="0" y={y + 4} fill="#99aebc" fontSize="11">
                {i ? "Proposed" : "No change"}
              </text>
              <line x1="100" x2="390" y1={y} y2={y} stroke="#2a3e49" />
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
                x={Math.min(390, x(d.mean) + 10)}
                y={y - 10}
                fill={color}
                fontSize="11"
              >
                {d.mean.toFixed(1)}
              </text>
            </g>
          );
        })}
        <text x="100" y="98" fill="#78929e" fontSize="9">
          0
        </text>
        <text x="390" y="98" textAnchor="end" fill="#78929e" fontSize="9">
          {max.toFixed(1)} {before.unit}
        </text>
      </svg>
    </article>
  );
}

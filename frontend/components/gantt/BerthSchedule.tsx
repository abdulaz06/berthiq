"use client";
import { useMemo } from "react";
import type { components } from "@/lib/types/api";
import { portTime } from "@/lib/operations";
import { ProvenanceBadge } from "@/components/provenance/ProvenanceBadge";
type Assignment = components["schemas"]["Assignment"];

export default function BerthSchedule({
  assignments,
  comparison,
  selected,
  onSelect,
  simulated,
}: {
  assignments: Assignment[];
  comparison: Assignment[];
  simulated?: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const { start, end, berths } = useMemo(() => {
    const all = [...assignments, ...comparison];
    return {
      start: Math.min(...all.map((a) => Date.parse(a.start))),
      end: Math.max(...all.map((a) => Date.parse(a.end ?? a.start))),
      berths: [...new Set(all.map((a) => a.berth))].sort(),
    };
  }, [assignments, comparison]);
  if (!assignments.length) return <p>No feasible assignments to display.</p>;
  const duration = Math.max(1, end - start);
  return (
    <section className="schedule-section">
      <div className="section-heading">
        <div>
          <h3>Berth schedule</h3>
          <p>
            {simulated
              ? "No-change baseline above · proposal below. First matched replication."
              : "FIFO baseline above · CP-SAT below. Both use candidate staffing."}{" "}
            Select a call for its timing.
          </p>
        </div>
        <ProvenanceBadge provenance={simulated ? "simulated" : "optimized"} />
      </div>
      <div className="schedule-scroll">
        <div className="schedule">
          <div className="schedule-scale">
            <span>BERTH / GST</span>
            <div className="schedule-ticks">
              {Array.from({ length: 5 }, (_, i) => (
                <time key={i} style={{ left: `${i * 25}%` }}>
                  {portTime(start + (duration * i) / 4)}
                </time>
              ))}
            </div>
          </div>
          {berths.map((b) => (
            <div className="schedule-row" key={b}>
              <strong>{b}</strong>
              <div className="schedule-track">
                {[comparison, assignments].map((list, index) =>
                  list
                    .filter((a) => a.berth === b)
                    .map((a) => (
                      <button
                        key={`${index}-${a.vessel}`}
                        aria-label={`${index ? "Proposed" : simulated ? "No change" : "FIFO"} ${a.vessel} on ${b}`}
                        className={`schedule-block ${index ? "proposed" : "baseline"} ${selected === a.vessel ? "schedule-selected" : ""}`}
                        style={{
                          left: `${((Date.parse(a.start) - start) / duration) * 100}%`,
                          width: `${Math.max(0.4, ((Date.parse(a.end ?? a.start) - Date.parse(a.start)) / duration) * 100)}%`,
                          top: index ? 37 : 5,
                        }}
                        onClick={() => onSelect(a.vessel)}
                        title={`${a.vessel} · ${portTime(a.start)} → ${portTime(a.end ?? a.start)}`}
                      >
                        {a.vessel.replace("KHL-", "")}
                      </button>
                    )),
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

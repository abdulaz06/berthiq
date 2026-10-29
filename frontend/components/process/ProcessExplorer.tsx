"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { JobStatus, ProcessModel } from "@/lib/api/contracts";
import { sessionRequest } from "@/lib/api/session";
import { ProvenanceBadge } from "@/components/provenance/ProvenanceBadge";

const stages = [
  "Port call request submitted",
  "Documents submitted",
  "Completeness check",
  "Authority review",
  "Arrival plan confirmed",
  "Berth planning",
  "Berth assigned",
  "Vessel arrives / anchorage wait",
  "Berthed, cargo start",
];
export default function ProcessExplorer({
  dataset,
  enabled,
}: {
  dataset: string;
  enabled: boolean;
}) {
  const [model, setModel] = useState<ProcessModel | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [threshold, setThreshold] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || model) return;
    const controller = new AbortController();
    async function load() {
      setError("");
      try {
        await sessionRequest<JobStatus>(
          `/api/datasets/${dataset}/discover`,
          "POST",
          undefined,
          controller.signal,
        );
        const result = await sessionRequest<ProcessModel>(
          `/api/discovery/${dataset}`,
          "GET",
          undefined,
          controller.signal,
        );
        setModel(result);
        setSelected(result.bottlenecks[0]?.activity ?? null);
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
    }
    void load();
    return () => controller.abort();
  }, [dataset, enabled, attempt, model]);
  const nodes: Node[] = useMemo(
    () =>
      (model?.nodes ?? []).map((n) => {
        const index = stages.indexOf(n.activity);
        return {
          id: n.activity,
          position: { x: (index % 3) * 310, y: Math.floor(index / 3) * 185 },
          data: {
            label: (
              <>
                <strong>{n.activity}</strong>
                <span>
                  {n.frequency.toLocaleString()} events ·{" "}
                  {n.median_duration_min.toFixed(0)} min median duration
                </span>
              </>
            ),
          },
          className:
            selected === n.activity ? "process-node chosen" : "process-node",
        };
      }),
    [model, selected],
  );
  const edges: Edge[] = useMemo(
    () =>
      (model?.edges ?? [])
        .filter((e) => e.frequency >= threshold)
        .map((e, i) => ({
          id: String(i),
          source: e.source,
          target: e.target,
          label: `${e.frequency} transitions`,
          type: "smoothstep",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color:
              stages.indexOf(e.target) <= stages.indexOf(e.source)
                ? "#e99080"
                : "#527b87",
          },
          style: {
            stroke:
              stages.indexOf(e.target) <= stages.indexOf(e.source)
                ? "#e99080"
                : "#527b87",
            strokeWidth: 1.5,
          },
          labelStyle: { fill: "#b8cbd3", fontSize: 10 },
          labelBgStyle: { fill: "#15242e" },
          data: e,
        })),
    [model, threshold],
  );
  const node = model?.nodes.find((n) => n.activity === selected);
  if (error)
    return (
      <section className="analysis-empty" role="alert">
        <h2>Discovery could not finish</h2>
        <p>{error}</p>
        <button className="primary" onClick={() => setAttempt((a) => a + 1)}>
          Retry discovery
        </button>
      </section>
    );
  if (!model)
    return (
      <section className="analysis-empty" role="status">
        <h2>Discovering the process</h2>
        <p>
          Building the directly-follows graph from canonical event sequences…
        </p>
      </section>
    );
  return (
    <section className="process-workspace">
      <div className="analysis-header">
        <div>
          <span className="eyebrow">FROM EVENT LOG TO EVIDENCE</span>
          <h2>Where the process slows</h2>
          <p>Pan, zoom and select a stage. Coral edges expose rework paths.</p>
        </div>
        <ProvenanceBadge provenance="observed" />
      </div>
      <div className="process-layout">
        <div className="analysis-card">
          <div className="graph-toolbar">
            <label>
              Minimum transition count{" "}
              <input
                aria-label="Minimum transition count"
                type="number"
                min="0"
                max="10000"
                value={threshold}
                onChange={(e) =>
                  setThreshold(Math.max(0, Number(e.target.value)))
                }
              />
            </label>
            <span>Observed synthetic events</span>
          </div>
          <div className="process-graph" aria-label="Interactive process graph">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodeClick={(_, n) => setSelected(n.id)}
              onEdgeClick={(_, e) => setSelected(e.source)}
              fitView
              minZoom={0.25}
              maxZoom={1.8}
              nodesDraggable={false}
              colorMode="dark"
            >
              <Background color="#304450" gap={24} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
        </div>
        <aside className="analysis-card process-evidence">
          <span className="eyebrow">STAGE EVIDENCE</span>
          <h3>{selected}</h3>
          {node && (
            <dl>
              <dt>
                Observed frequency <ProvenanceBadge provenance="observed" />
              </dt>
              <dd>{node.frequency.toLocaleString()} events</dd>
              <dt>
                Median activity duration{" "}
                <ProvenanceBadge provenance="observed" />
              </dt>
              <dd>{node.median_duration_min.toFixed(1)} min</dd>
            </dl>
          )}
          <h4>Outgoing transitions</h4>
          {model.edges
            .filter((e) => e.source === selected)
            .map((e) => (
              <div className="transition-detail" key={e.target}>
                <strong>{e.target}</strong>
                <span>{e.frequency} transitions</span>
                <small>
                  Median wait {e.median_wait_min.toFixed(1)} min · p90{" "}
                  {e.p90_wait_min.toFixed(1)} min
                </small>
                <ProvenanceBadge provenance="observed" />
              </div>
            ))}
        </aside>
      </div>
      <div className="process-bottom">
        <section className="analysis-card">
          <h3>Bottleneck ranking</h3>
          {model.bottlenecks.map((b) => (
            <button
              key={`${b.activity}-${b.metric}`}
              className="bottleneck-row"
              onClick={() => setSelected(b.activity)}
            >
              <span className="rank">0{b.rank}</span>
              <span>
                <strong>{b.activity}</strong>
                <small>{b.metric.replaceAll("_", " ")}</small>
              </span>
              <span>
                {b.value.value.toFixed(1)} {b.value.unit}
                <ProvenanceBadge provenance={b.value.provenance} />
              </span>
            </button>
          ))}
        </section>
        <section className="analysis-card">
          <h3>Frequent process variants</h3>
          {model.variants.slice(0, 5).map((v, i) => (
            <details className="variant" key={i}>
              <summary>
                Variant {i + 1} · {v.count} calls{" "}
                <ProvenanceBadge provenance="observed" />
              </summary>
              <p>{v.sequence.join(" → ")}</p>
              <small>
                Median elapsed time: {v.median_total_min.toFixed(0)} min
              </small>
            </details>
          ))}
        </section>
      </div>
    </section>
  );
}

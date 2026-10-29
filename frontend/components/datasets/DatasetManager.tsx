"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, Database, FileUp, ShieldCheck } from "lucide-react";
import type { components } from "@/lib/types/api";
import type { DatasetSummary, DataQualityReport } from "@/lib/api/contracts";
import { sessionRequest } from "@/lib/api/session";
import { ProvenanceBadge } from "@/components/provenance/ProvenanceBadge";
type Capabilities = components["schemas"]["DemoCapabilities"];
type Preview = components["schemas"]["MappingPreview"];
type Mapping = components["schemas"]["ColumnMapping"];
const fields = [
  "case_id",
  "activity",
  "end_ts",
  "start_ts",
  "resource_id",
  "status",
] as const;
const attributes = [
  "vessel_type",
  "loa",
  "draft",
  "cargo_type",
  "berth",
  "eta",
  "ata",
  "service_window_start",
  "service_window_end",
  "missing_doc_count",
  "weather_severity",
  "attributes",
];

export default function DatasetManager({
  enabled,
  onUse,
}: {
  enabled: boolean;
  onUse: (dataset: DatasetSummary) => void;
}) {
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [selected, setSelected] = useState<DatasetSummary | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [report, setReport] = useState<DataQualityReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const c = new AbortController();
    Promise.all([
      sessionRequest<DatasetSummary[]>(
        "/api/datasets",
        "GET",
        undefined,
        c.signal,
      ),
      sessionRequest<Capabilities>(
        "/api/demo/capabilities",
        "GET",
        undefined,
        c.signal,
      ),
    ])
      .then(([rows, cap]) => {
        setDatasets(rows);
        setCapabilities(cap);
        setError("");
      })
      .catch((e) => !c.signal.aborted && setError(e.message));
    return () => c.abort();
  }, [enabled, attempt]);
  async function inspect(dataset: DatasetSummary) {
    setSelected(dataset);
    setPreview(null);
    setMapping(null);
    setReport(null);
    setError("");
    setBusy(true);
    try {
      if (dataset.status !== "ready" && dataset.source === "uploaded") {
        const result = await sessionRequest<Preview>(
          `/api/datasets/${dataset.id}/suggested-mapping`,
        );
        setPreview(result);
        setMapping(result.suggested);
      }
      setReport(
        await sessionRequest<DataQualityReport>(
          `/api/datasets/${dataset.id}/validation`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    if (!capabilities?.uploads_enabled) return;
    setError("");
    if (file.size > capabilities.max_upload_bytes) {
      setError("Choose a file smaller than 5 MiB.");
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const dataset = await sessionRequest<DatasetSummary>(
        "/api/datasets",
        "POST",
        form,
      );
      setDatasets((ds) => [dataset, ...ds]);
      await inspect(dataset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function validate() {
    if (!selected || !mapping) return;
    setBusy(true);
    setError("");
    try {
      setReport(
        await sessionRequest<DataQualityReport>(
          `/api/datasets/${selected.id}/mapping`,
          "POST",
          mapping,
        ),
      );
      const dataset = await sessionRequest<DatasetSummary>(
        `/api/datasets/${selected.id}`,
      );
      setSelected(dataset);
      setDatasets((rows) =>
        rows.map((d) => (d.id === dataset.id ? dataset : d)),
      );
      if (dataset.status === "ready") {
        setMapping(null);
        setPreview(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="dataset-workspace">
      <div className="analysis-header">
        <div>
          <span className="eyebrow">KNOW WHAT YOU ARE WORKING WITH</span>
          <h2>Data workspace</h2>
          <p>Inspect the reference dataset or validate a private event log.</p>
        </div>
        <ProvenanceBadge provenance="observed" />
      </div>
      {error && (
        <div className="notice" role="alert">
          {error}
          <button
            className="secondary"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Refresh
          </button>
        </div>
      )}
      <div className="data-layout">
        <div>
          <section className="analysis-card">
            <h3>
              <Database size={18} /> Available datasets
            </h3>
            <div className="dataset-list">
              {datasets.map((d) => (
                <button
                  disabled={busy}
                  key={d.id}
                  className={selected?.id === d.id ? "selected-row" : ""}
                  onClick={() => void inspect(d)}
                >
                  <span>
                    <strong>{d.name}</strong>
                    <small>
                      {d.source} · {d.status} · {d.event_count.toLocaleString()}{" "}
                      events
                    </small>
                  </span>
                  <ArrowUpRight size={17} />
                </button>
              ))}
            </div>
          </section>
          <section className="analysis-card upload-card">
            <FileUp size={28} />
            <h3>Bring an event log</h3>
            <p>
              CSV or XLSX · up to 5 MiB and 50,000 events. Files stay private to
              this browser session.
            </p>
            {capabilities?.uploads_enabled ? (
              <label className="upload-target">
                Choose a CSV or XLSX
                <input
                  aria-label="Upload event log"
                  type="file"
                  accept=".csv,.xlsx"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file);
                    e.target.value = "";
                  }}
                />
              </label>
            ) : (
              <p className="form-hint">
                Uploads are disabled on this server. The Khalifa reference
                dataset supports the complete demo.
              </p>
            )}
            <p className="form-hint">
              Timestamps should include a timezone. A valid log can be explored
              even when it lacks the maritime dimensions required for
              scheduling.
            </p>
          </section>
        </div>
        <div>
          {selected ? (
            <section className="analysis-card dataset-detail">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">IMMUTABLE DATASET VERSION</span>
                  <h3>{selected.name}</h3>
                </div>
                <ShieldCheck size={24} className="seafoam" />
              </div>
              <code>{selected.id}</code>
              <div className="result-metrics">
                {[
                  ["Events", selected.event_count],
                  ["Calls", selected.case_count],
                  ["Active calls", selected.active_case_count],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value.toLocaleString()}</strong>
                    <ProvenanceBadge provenance="observed" />
                  </div>
                ))}
              </div>
              {selected.source !== "uploaded" && (
                <p className="form-hint">
                  Deterministically generated Khalifa operations. No live AIS or
                  proprietary port records.
                </p>
              )}
              {preview && mapping && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void validate();
                  }}
                >
                  <h4>Confirm column mapping</h4>
                  <p className="form-hint">
                    The first three fields are required. Review the suggested
                    mappings before committing this version.
                  </p>
                  <fieldset disabled={busy} className="mapping-grid">
                    {fields.map((key, i) => (
                      <label key={key}>
                        {key.replaceAll("_", " ")}
                        {i < 3 ? " *" : ""}
                        <select
                          aria-label={`Map ${key}`}
                          required={i < 3}
                          value={mapping[key] ?? ""}
                          onChange={(e) =>
                            setMapping((m) =>
                              m ? { ...m, [key]: e.target.value || null } : m,
                            )
                          }
                        >
                          <option value="">Not mapped</option>
                          {preview.columns.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </fieldset>
                  <details>
                    <summary>Maritime attributes</summary>
                    <div className="mapping-grid">
                      {preview.columns.map((column) => (
                        <label key={column}>
                          {column}
                          <select
                            value={mapping.attribute_map?.[column] ?? ""}
                            onChange={(e) =>
                              setMapping((m) => {
                                if (!m) return m;
                                const next = { ...m.attribute_map };
                                if (e.target.value)
                                  next[column] = e.target.value;
                                else delete next[column];
                                return { ...m, attribute_map: next };
                              })
                            }
                          >
                            <option value="">Ignore as attribute</option>
                            {attributes.map((a) => (
                              <option key={a}>{a}</option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </details>
                  <details>
                    <summary>Source preview · first five rows</summary>
                    <div className="data-preview">
                      <table>
                        <thead>
                          <tr>
                            {preview.columns.map((c) => (
                              <th key={c}>{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.sample_rows.map((row, i) => (
                            <tr key={i}>
                              {preview.columns.map((c) => (
                                <td key={c}>{row[c]}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                  <button className="primary" disabled={busy} type="submit">
                    Validate & save mapping
                  </button>
                </form>
              )}
              {busy && (
                <p className="form-hint" role="status">
                  Checking dataset…
                </p>
              )}
              {report && (
                <section className="validation-report">
                  <h4>
                    {report.is_blocking
                      ? "Validation needs attention"
                      : "Ready for exploration"}
                  </h4>
                  {!report.issues.length && (
                    <p>No data-quality issues found.</p>
                  )}
                  {report.issues.map((issue) => (
                    <article
                      key={issue.code}
                      className={`quality-issue ${issue.severity}`}
                    >
                      <span>
                        {issue.severity.toUpperCase()} · {issue.count} rows{" "}
                        <ProvenanceBadge provenance="observed" />
                      </span>
                      <strong>{issue.message}</strong>
                      <small>
                        Source rows: {issue.sample_rows.join(", ") || "—"}
                      </small>
                    </article>
                  ))}
                </section>
              )}
              {selected.status === "ready" && (
                <button className="primary" onClick={() => onUse(selected)}>
                  Use in operations console <ArrowUpRight size={16} />
                </button>
              )}
            </section>
          ) : (
            <section className="analysis-card data-empty">
              <Database size={42} strokeWidth={1} />
              <h3>Start with the evidence.</h3>
              <p>
                Select a dataset to inspect its event counts, quality checks and
                provenance before entering the console.
              </p>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSourceSpecification, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Operations, Risk } from "@/lib/operations";
import { approachTo, fairwaySpot, fromMeters, harbor, route, toMeters } from "@/lib/harbor";
import {
  callTimes,
  motionContext,
  observedPose,
  plannedPose,
  type Pose,
} from "@/lib/motion";
import type { components } from "@/lib/types/api";

const TILES = "https://tiles.openfreemap.org/styles/dark";

const fallback: StyleSpecification = {
  version: 8,
  sources: {
    land: {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [54.6377, 24.8048],
                  [54.6358, 24.8075],
                  [54.6535, 24.8264],
                  [54.6607, 24.8331],
                  [54.6708, 24.8252],
                  [54.6553, 24.8089],
                  [54.663, 24.7962],
                  [54.6595, 24.7917],
                  [54.6493, 24.792],
                  [54.6472, 24.7935],
                  [54.6377, 24.8048],
                ],
              ],
            },
          },
        ],
      },
    },
  },
  layers: [
    { id: "water", type: "background", paint: { "background-color": "#0a1724" } },
    { id: "land", type: "fill", source: "land", paint: { "fill-color": "#1b2d38" } },
    { id: "quay", type: "line", source: "land", paint: { "line-color": "#46606c", "line-width": 1.5 } },
  ],
};

const SHIP =
  '<svg viewBox="0 0 20 46" aria-hidden="true"><path class="hull" d="M10 1 17.5 13 17.5 40 14.5 45 5.5 45 2.5 40 2.5 13Z"/><path class="deck" d="M6 16h8v5H6zM6 23h8v5H6zM6 30h8v5H6z"/><path class="bridge" d="M5 38h10v3H5z"/></svg>';

/** Overlays that explain the motion: anchorage, fairway, and the chosen ship's route. */
function overlay(data: Operations, selectedRoute: [number, number][] | null) {
  const ctx = motionContext(data.vessels, data.berths);
  const [cx, cy] = toMeters(harbor.anchorage.center);
  const ring = Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2;
    return fromMeters([
      cx + Math.cos(a) * harbor.anchorage.rx * 1.12,
      cy + Math.sin(a) * harbor.anchorage.ry * 1.12,
    ]);
  });
  const last = data.berths.at(-1);
  const fairway = last
    ? route([harbor.sea, harbor.entrance, harbor.corner, fairwaySpot(last, ctx.berths)], 3).points
    : [];
  return {
    type: "FeatureCollection" as const,
    features: [
      { type: "Feature" as const, properties: { kind: "anchorage" }, geometry: { type: "Polygon" as const, coordinates: [ring] } },
      { type: "Feature" as const, properties: { kind: "fairway" }, geometry: { type: "LineString" as const, coordinates: fairway } },
      ...(selectedRoute
        ? [{ type: "Feature" as const, properties: { kind: "selected" }, geometry: { type: "LineString" as const, coordinates: selectedRoute } }]
        : []),
    ],
  };
}

function addOverlay(instance: maplibregl.Map, data: GeoJSONSourceSpecification["data"]) {
  if (instance.getSource("harbor-overlay")) return;
  instance.addSource("harbor-overlay", { type: "geojson", data });
  instance.addLayer({
    id: "anchorage-fill",
    type: "fill",
    source: "harbor-overlay",
    filter: ["==", ["get", "kind"], "anchorage"],
    paint: { "fill-color": "#f2c230", "fill-opacity": 0.045 },
  });
  instance.addLayer({
    id: "anchorage-edge",
    type: "line",
    source: "harbor-overlay",
    filter: ["==", ["get", "kind"], "anchorage"],
    paint: { "line-color": "#f2c230", "line-opacity": 0.45, "line-width": 1, "line-dasharray": [3, 3] },
  });
  instance.addLayer({
    id: "fairway",
    type: "line",
    source: "harbor-overlay",
    filter: ["==", ["get", "kind"], "fairway"],
    paint: { "line-color": "#7fd8c6", "line-opacity": 0.28, "line-width": 1.2, "line-dasharray": [1, 3] },
  });
  instance.addLayer({
    id: "selected-route",
    type: "line",
    source: "harbor-overlay",
    filter: ["==", ["get", "kind"], "selected"],
    layout: { "line-cap": "round" },
    paint: { "line-color": "#f2c230", "line-opacity": 0.85, "line-width": 2, "line-dasharray": [2, 2] },
  });
}

export default function PortMap({
  data,
  clock,
  risk,
  selected,
  onSelect,
  onBerth,
  showRisk,
  plan,
  simulatedPlan,
  planStart,
}: {
  data: Operations;
  clock: number;
  risk: Risk | null;
  selected: string | null;
  onSelect: (id: string) => void;
  onBerth: (id: string) => void;
  showRisk: boolean;
  plan?: components["schemas"]["Assignment"][];
  simulatedPlan?: boolean;
  /** Plan replay: when the plan's ships are first shown at anchor. */
  planStart?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef(new Map<string, { marker: maplibregl.Marker; el: HTMLButtonElement }>());
  const berthMarkers = useRef<maplibregl.Marker[]>([]);
  const [schematic, setSchematic] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [ready, setReady] = useState(false);
  const ctx = useMemo(() => motionContext(data.vessels, data.berths), [data]);
  const handlers = useRef({ onSelect, onBerth });
  useEffect(() => {
    handlers.current = { onSelect, onBerth };
  }, [onSelect, onBerth]);

  // The chosen ship's whole illustrative route, from anchorage to its berth.
  const selectedRoute = useMemo(() => {
    if (!selected) return null;
    const vessel = data.vessels.find((v) => v.case_id === selected);
    const assignment = plan?.find((a) => a.vessel === selected);
    const berthId = assignment?.berth ?? (vessel ? callTimes(vessel, data.occupancy_assumption_minutes).berth : null);
    const berth = data.berths.find((b) => b.id === berthId);
    const slot = ctx.slots.get(selected);
    if (!berth || !slot) return null;
    return route([slot, ...approachTo(berth, ctx.berths)]).points;
  }, [selected, data, plan, ctx]);
  const overlayData = useMemo(() => overlay(data, selectedRoute), [data, selectedRoute]);
  const overlayRef = useRef(overlayData);
  useEffect(() => {
    overlayRef.current = overlayData;
    const source = map.current?.getSource("harbor-overlay") as maplibregl.GeoJSONSource | undefined;
    source?.setData(overlayData);
  }, [overlayData]);

  useEffect(() => {
    if (!host.current) return;
    let instance: maplibregl.Map;
    try {
      maplibregl.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
      instance = new maplibregl.Map({
        container: host.current,
        style: TILES,
        center: [54.6372, 24.8048],
        zoom: host.current.clientWidth < 600 ? 12.3 : 13.35,
        bearing: -20,
        attributionControl: false,
        fadeDuration: 0,
      });
    } catch {
      setUnavailable(true);
      return;
    }
    map.current = instance;
    let loaded = false;
    instance.once("load", () => {
      loaded = true;
      host.current?.setAttribute("data-map-ready", "true");
      setReady(true);
    });
    instance.on("style.load", () => {
      for (const layer of instance.getStyle().layers) {
        if (layer.id.startsWith("anchorage") || layer.id === "fairway" || layer.id === "selected-route") continue;
        if (layer.type === "background")
          instance.setPaintProperty(layer.id, "background-color", layer.id === "water" ? "#0a1724" : "#1d2f3a");
        if (layer.type === "fill")
          instance.setPaintProperty(
            layer.id,
            "fill-color",
            layer.id === "water" ? "#0a1724" : layer.id === "building" ? "#2b4250" : "#1d2f3a",
          );
        if (layer.type === "line")
          instance.setPaintProperty(layer.id, "line-color", layer.id === "waterway" ? "#0a1724" : "#344d5a");
        if (layer.type === "symbol" && layer.layout?.["text-field"]) {
          instance.setPaintProperty(layer.id, "text-color", "#8ea6b1");
          instance.setPaintProperty(layer.id, "text-halo-color", "#0f1d27");
        }
      }
      addOverlay(instance, overlayRef.current);
    });
    const localFallback = () => {
      if (!loaded) {
        instance.setStyle(fallback);
        setSchematic(true);
      }
    };
    instance.once("error", localFallback);
    const timeout = setTimeout(localFallback, 8000);
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    instance.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: "Operational layer: illustrative",
      }),
    );
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(host.current);
    const vesselMarkers = markers.current;
    return () => {
      clearTimeout(timeout);
      observer.disconnect();
      vesselMarkers.clear();
      berthMarkers.current = [];
      instance.remove();
      map.current = null;
    };
  }, []);

  // Berth labels: created once per dataset.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const created = data.berths.map((b) => {
      const el = document.createElement("button");
      el.className = "berth-marker";
      el.textContent = b.id;
      el.setAttribute("aria-label", `Inspect berth ${b.id}`);
      el.onclick = () => handlers.current.onBerth(b.id);
      return new maplibregl.Marker({ element: el, anchor: "left" })
        .setLngLat([b.longitude, b.latitude])
        .addTo(instance);
    });
    berthMarkers.current = created;
    return () => created.forEach((m) => m.remove());
  }, [data]);

  // Vessels: one persistent marker per call, moved in place on every clock change.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const live = markers.current;
    const poses = new Map<string, Pose>();
    if (plan) {
      for (const a of plan) poses.set(a.vessel, plannedPose(a, clock, planStart ?? Date.parse(data.clock_end), ctx));
    } else {
      for (const v of data.vessels)
        poses.set(v.case_id, observedPose(v, clock, data.occupancy_assumption_minutes, ctx));
    }
    for (const [id, pose] of poses) {
      let entry = live.get(id);
      if (!pose.visible) {
        if (entry) {
          if (entry.el === document.activeElement) instance.getCanvas().focus({ preventScroll: true });
          entry.marker.remove();
          live.delete(id);
        }
        continue;
      }
      if (!entry) {
        const el = document.createElement("button");
        el.innerHTML = SHIP;
        el.setAttribute("aria-label", `Select vessel ${id}`);
        el.onclick = () => handlers.current.onSelect(id);
        const marker = new maplibregl.Marker({ element: el, rotationAlignment: "map" })
          .setLngLat(pose.lngLat)
          .addTo(instance);
        entry = { marker, el };
        live.set(id, entry);
      }
      const score = risk?.cases.find((c) => c.case_id === id)?.miss_probability;
      const phase = pose.phase.toLowerCase().replace(/\s+/g, "-");
      entry.el.className = [
        "vessel-marker",
        `phase-${phase}`,
        selected === id ? "selected" : "",
        showRisk && score !== undefined && score > 0.66 ? "danger" : "",
      ].join(" ");
      entry.el.title = `${id} · ${plan ? (simulatedPlan ? "Simulated" : "Planned") : pose.phase}`;
      entry.el.style.opacity = String(pose.opacity);
      entry.marker.setLngLat(pose.lngLat);
      entry.marker.setRotation(pose.heading);
    }
    for (const [id, entry] of live)
      if (!poses.has(id)) {
        entry.marker.remove();
        live.delete(id);
      }
  }, [data, clock, risk, selected, showRisk, plan, simulatedPlan, planStart, ctx, ready]);

  // Calls with paperwork under way but no recorded arrival: no position to draw.
  const awaiting = useMemo(() => {
    if (plan) return [];
    return data.vessels
      .filter((v) => {
        const seen = v.events.some((e) => Date.parse(e.end) <= clock);
        return seen && observedPose(v, clock, data.occupancy_assumption_minutes, ctx).phase === "Inbound";
      })
      .map((v) => ({
        id: v.case_id,
        risk: risk?.cases.find((c) => c.case_id === v.case_id)?.miss_probability,
      }))
      .sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0));
  }, [data, clock, ctx, plan, risk]);

  function toggleContext() {
    const instance = map.current;
    if (!instance) return;
    if (!schematic) {
      instance.setStyle(fallback);
      setSchematic(true);
      return;
    }
    instance.setStyle(TILES);
    setSchematic(false);
    instance.once("error", () => {
      instance.setStyle(fallback);
      setSchematic(true);
    });
  }
  return (
    <div className="port-map">
      <div ref={host} className="map-canvas" role="region" aria-label="Interactive Khalifa Port map" />
      {unavailable && (
        <div className="map-unavailable">Map graphics unavailable. Select vessels from the operations list.</div>
      )}
      <div className="map-heading">
        <span className="eyebrow">24.81° N / 54.65° E</span>
        <h2>Khalifa Port</h2>
        <p>Abu Dhabi · Arabian Gulf</p>
      </div>
      <button className="map-context" onClick={toggleContext}>
        {schematic ? "Load geographic basemap" : "Use local schematic"}
      </button>
      {!plan && awaiting.length > 0 && (
        <section className="awaiting-queue" aria-label="Calls awaiting clearance">
          <header>
            <span className="q-flag" aria-hidden="true" />
            <div>
              <strong>{awaiting.length} awaiting clearance</strong>
              <small>Paperwork under way · no arrival recorded yet</small>
            </div>
          </header>
          <div>
            {awaiting.map((a) => (
              <button
                key={a.id}
                aria-label={`Select awaiting call ${a.id}`}
                className={`${selected === a.id ? "selected" : ""} ${showRisk && a.risk !== undefined && a.risk > 0.66 ? "danger" : ""}`}
                onClick={() => handlers.current.onSelect(a.id)}
                title={a.risk === undefined ? a.id : `${a.id} · ${Math.round(a.risk * 100)}% predicted miss risk`}
              >
                {a.id.replace(/^\D+-?/, "")}
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="map-legend">
        {plan ? (
          <span>
            <i className="moving" />
            {simulatedPlan ? "Simulated berth occupancy · first replication" : "Planned berth occupancy · illustrative paths"}
          </span>
        ) : (
          <>
            <span><i className="waiting" />At anchor</span>
            <span><i className="moving" />Under way</span>
            <span><i className="berthed" />Alongside</span>
            {showRisk && <span><i className="coral" />High predicted risk</span>}
          </>
        )}
        <small>
          Timing from the event log · paths illustrative ·{" "}
          {schematic ? "local schematic, approximate berths" : "© OpenStreetMap · OpenFreeMap · approximate berths"}
        </small>
      </div>
    </div>
  );
}

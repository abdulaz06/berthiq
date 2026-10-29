"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  position,
  vesselState,
  type Operations,
  type Risk,
} from "@/lib/operations";
import type { components } from "@/lib/types/api";

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
                  [54.638, 24.803],
                  [54.648, 24.814],
                  [54.665, 24.8],
                  [54.654, 24.788],
                  [54.638, 24.803],
                ],
              ],
            },
          },
        ],
      },
    },
  },
  layers: [
    {
      id: "water",
      type: "background",
      paint: { "background-color": "#0a1a26" },
    },
    {
      id: "land",
      type: "fill",
      source: "land",
      paint: { "fill-color": "#1d333e" },
    },
    {
      id: "quay",
      type: "line",
      source: "land",
      paint: { "line-color": "#49636d", "line-width": 2 },
    },
  ],
};

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
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [schematic, setSchematic] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    let instance: maplibregl.Map;
    try {
      maplibregl.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
      instance = new maplibregl.Map({
        container: host.current,
        style: "https://tiles.openfreemap.org/styles/dark",
        center: [54.642, 24.805],
        zoom: host.current.clientWidth < 600 ? 12.5 : 13.0,
        bearing: -20,
        attributionControl: false,
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
    });
    instance.on("style.load", () => {
      for (const layer of instance.getStyle().layers) {
        if (layer.type === "background")
          instance.setPaintProperty(
            layer.id,
            "background-color",
            layer.id === "water" ? "#0a1a26" : "#23343e",
          );
        if (layer.type === "fill")
          instance.setPaintProperty(
            layer.id,
            "fill-color",
            layer.id === "water"
              ? "#0a1a26"
              : layer.id === "building"
                ? "#304650"
                : "#243943",
          );
        if (layer.type === "line")
          instance.setPaintProperty(
            layer.id,
            "line-color",
            layer.id === "waterway" ? "#0a1a26" : "#3b535f",
          );
        if (layer.type === "symbol" && layer.layout?.["text-field"]) {
          instance.setPaintProperty(layer.id, "text-color", "#94aab4");
          instance.setPaintProperty(layer.id, "text-halo-color", "#15232b");
        }
      }
    });
    const localFallback = () => {
      if (!loaded) {
        instance.setStyle(fallback);
        setSchematic(true);
      }
    };
    instance.once("error", localFallback);
    const timeout = setTimeout(localFallback, 8000);
    instance.addControl(new maplibregl.NavigationControl(), "bottom-right");
    instance.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: "Operational layer: schematic",
      }),
    );
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(host.current);
    return () => {
      clearTimeout(timeout);
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const markers: maplibregl.Marker[] = [];
    data.berths.forEach((b) => {
      const el = document.createElement("button");
      el.className = "berth-marker";
      el.textContent = b.id;
      el.setAttribute("aria-label", `Inspect berth ${b.id}`);
      el.onclick = () => onBerth(b.id);
      markers.push(
        new maplibregl.Marker({ element: el, anchor: "left" })
          .setLngLat([b.longitude, b.latitude])
          .addTo(instance),
      );
    });
    data.vessels.forEach((v, i) => {
      const state = vesselState(v, clock, data.occupancy_assumption_minutes);
      const assignment = plan?.find((a) => a.vessel === v.case_id);
      if (
        plan
          ? !assignment ||
            clock > Date.parse(assignment.end ?? assignment.start)
          : ["Expected", "Released"].includes(state.phase)
      )
        return;
      const score = risk?.cases.find(
        (c) => c.case_id === v.case_id,
      )?.miss_probability;
      const el = document.createElement("button");
      el.className = `vessel-marker ${selected === v.case_id ? "selected" : ""} ${showRisk && score !== undefined && score > 0.66 ? "danger" : ""}`;
      el.setAttribute("aria-label", `Select vessel ${v.case_id}`);
      el.title = `${v.case_id} · ${plan ? "Planned position" : state.phase}`;
      el.innerHTML =
        '<svg viewBox="0 0 20 42" aria-hidden="true"><path d="M10 1 18 12 18 36 14 41 6 41 2 36 2 12Z" fill="currentColor"/><path d="M6 15h8v16H6z" fill="#10232c"/><path d="M7 19h6M7 24h6M7 29h6" stroke="currentColor"/></svg>';
      el.onclick = () => onSelect(v.case_id);
      const assignedBerth = data.berths.find((b) => b.id === assignment?.berth);
      const point: [number, number] =
        assignment && assignedBerth && clock >= Date.parse(assignment.start)
          ? [assignedBerth.longitude - 0.0007, assignedBerth.latitude + 0.0005]
          : plan
            ? [54.617 + (i % 7) * 0.0032, 24.819 - Math.floor(i / 7) * 0.0033]
            : position(v, i, data, clock);
      markers.push(
        new maplibregl.Marker({ element: el }).setLngLat(point).addTo(instance),
      );
    });
    return () => markers.forEach((m) => m.remove());
  }, [data, clock, risk, selected, onSelect, onBerth, showRisk, plan]);
  function toggleContext() {
    const instance = map.current;
    if (!instance) return;
    if (!schematic) {
      instance.setStyle(fallback);
      setSchematic(true);
      return;
    }
    instance.setStyle("https://tiles.openfreemap.org/styles/dark");
    setSchematic(false);
    instance.once("error", () => {
      instance.setStyle(fallback);
      setSchematic(true);
    });
  }
  return (
    <div className="port-map">
      <div
        ref={host}
        className="map-canvas"
        role="region"
        aria-label="Interactive Khalifa Port map"
      />
      {unavailable && (
        <div className="map-unavailable">
          Map graphics unavailable. Select vessels from the operations list.
        </div>
      )}
      <div className="map-heading">
        <span className="eyebrow">24.81° N / 54.65° E</span>
        <h2>Khalifa Port</h2>
        <p>Abu Dhabi · Arabian Gulf</p>
      </div>
      <button className="map-context" onClick={toggleContext}>
        {schematic ? "Load geographic basemap" : "Use local schematic"}
      </button>
      <div className="map-legend">
        <span>
          <i />
          {plan
            ? simulatedPlan
              ? "Simulated berth occupancy · first replication"
              : "Planned berth occupancy · not a simulated trajectory"
            : data.operations_disclosure.startsWith("Uploaded") ? "Uploaded port call" : "Synthetic vessel"}
        </span>
        {showRisk && (
          <span>
            <i className="coral" />
            Latest-prefix high risk
          </span>
        )}
        <small>
          {schematic
            ? "Local schematic · approximate coastline and berths"
            : "© OpenStreetMap · OpenFreeMap · approximate operational berths"}
        </small>
      </div>
    </div>
  );
}

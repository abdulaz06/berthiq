// Illustrative harbor geometry for replay motion. None of this is surveyed:
// the anchorage, fairway and sea approach are drawn to make the event log's
// timing legible on the map, not to reproduce real vessel tracks.
import type { Berth } from "./operations";

export type LngLat = [number, number];

const LAT0 = 24.805;
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LNG = 111_320 * Math.cos((LAT0 * Math.PI) / 180);

/** Local metric plane (x east, y north), adequate over a few kilometres. */
export const toMeters = ([lng, lat]: LngLat): [number, number] => [
  lng * M_PER_DEG_LNG,
  lat * M_PER_DEG_LAT,
];
export const fromMeters = ([x, y]: [number, number]): LngLat => [
  x / M_PER_DEG_LNG,
  y / M_PER_DEG_LAT,
];

export const harbor = {
  /** Where inbound ships come over the horizon. */
  sea: [54.578, 24.848] as LngLat,
  /** Centre and radii (metres) of the illustrative anchorage. */
  anchorage: { center: [54.6262, 24.8128] as LngLat, rx: 1150, ry: 720 },
  /** Fairway mouth, west of the island's north-west corner. */
  entrance: [54.6318, 24.8052] as LngLat,
  /** Turning point off the island's south-west corner, for the south face. */
  corner: [54.6418, 24.7884] as LngLat,
  /** Ships lie this far off the quay line; the fairway runs further out. */
  berthOffset: 95,
  fairwayOffset: 560,
  /** The shamal blows from the north-west: ships at anchor head into it. */
  anchorHeading: 318,
};

/** Container berths face open water to the west; the rest face south. */
const face = (b: Berth) => (b.terminal_type === "container" ? "west" : "south");

/** Unit direction along a berth's own quay face, in face order. */
function quayDirection(berth: Berth, berths: Berth[]): [number, number] {
  const same = berths.filter((b) => face(b) === face(berth));
  const i = same.indexOf(berth);
  const from = same[Math.max(i - 1, 0)];
  const to = same[Math.min(i + 1, same.length - 1)];
  if (from === to) return face(berth) === "west" ? [0.63, -0.78] : [1, 0];
  const [ax, ay] = toMeters([from.longitude, from.latitude]);
  const [bx, by] = toMeters([to.longitude, to.latitude]);
  const len = Math.hypot(bx - ax, by - ay) || 1;
  return [(bx - ax) / len, (by - ay) / len];
}

/** Perpendicular on the water side: clockwise of the face's direction. */
function quayNormal(berth: Berth, berths: Berth[]): [number, number] {
  const [dx, dy] = quayDirection(berth, berths);
  return [dy, -dx];
}

function offset(point: LngLat, normal: [number, number], meters: number): LngLat {
  const [x, y] = toMeters(point);
  return fromMeters([x + normal[0] * meters, y + normal[1] * meters]);
}

/** The bearing a ship alongside lies at: parallel to its quay face. */
export function quayHeading(berth: Berth, berths: Berth[]): number {
  const [dx, dy] = quayDirection(berth, berths);
  return (bearing([0, 0], [-dx, -dy]) + 360) % 360;
}

export function berthSpot(berth: Berth, berths: Berth[]): LngLat {
  return offset([berth.longitude, berth.latitude], quayNormal(berth, berths), harbor.berthOffset);
}

export function fairwaySpot(berth: Berth, berths: Berth[]): LngLat {
  return offset([berth.longitude, berth.latitude], quayNormal(berth, berths), harbor.fairwayOffset);
}

/** Waypoints from the fairway mouth to a berth, rounding the island if needed. */
export function approachTo(berth: Berth, berths: Berth[]): LngLat[] {
  return [
    harbor.entrance,
    ...(face(berth) === "south" ? [harbor.corner] : []),
    fairwaySpot(berth, berths),
    berthSpot(berth, berths),
  ];
}

/**
 * A deterministic anchorage slot: a sunflower spiral inside the anchorage
 * ellipse, so neighbouring indices never share a spot and nothing reads as a grid.
 */
export function anchorageSlot(index: number, count: number): LngLat {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const r = Math.sqrt((index + 0.6) / Math.max(count, 1));
  const a = index * golden;
  const [cx, cy] = toMeters(harbor.anchorage.center);
  return fromMeters([
    cx + Math.cos(a) * r * harbor.anchorage.rx,
    cy + Math.sin(a) * r * harbor.anchorage.ry,
  ]);
}

/** Compass bearing in degrees (0 = north, clockwise) from a to b. */
export function bearing(a: [number, number], b: [number, number]): number {
  return (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
}

/** A polyline with corners rounded (Chaikin), measured for arc-length lookup. */
export function route(points: LngLat[], rounds = 3) {
  let pts = points.map(toMeters);
  for (let k = 0; k < rounds; k++) {
    const next: [number, number][] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
      next.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    next.push(pts.at(-1)!);
    pts = next;
  }
  const lengths = [0];
  for (let i = 1; i < pts.length; i++)
    lengths.push(lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = lengths.at(-1)!;
  return {
    total,
    points: pts.map(fromMeters),
    /** Position and heading at fraction f ∈ [0, 1] of the distance. */
    at(f: number): { lngLat: LngLat; heading: number } {
      const d = Math.min(Math.max(f, 0), 1) * total;
      let i = 1;
      while (i < lengths.length - 1 && lengths[i] < d) i++;
      const seg = lengths[i] - lengths[i - 1] || 1;
      const t = (d - lengths[i - 1]) / seg;
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      return {
        lngLat: fromMeters([ax + (bx - ax) * t, ay + (by - ay) * t]),
        heading: (bearing([ax, ay], [bx, by]) + 360) % 360,
      };
    },
  };
}

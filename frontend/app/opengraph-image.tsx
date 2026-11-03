import { ImageResponse } from "next/og";
import story from "@/lib/fixtures/landing_story.json";

export const alt = "BerthIQ — Why is this ship waiting?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  const hero = story.hero!;
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "60px 72px",
          background: "#0a1219",
          color: "#edf2f4",
          borderBottom: "14px solid #f2c230",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 40, fontWeight: 800 }}>
          <div style={{ display: "flex", width: 34, height: 24, background: "#f2c230", borderRadius: 2 }} />
          <span>
            Berth<span style={{ color: "#f2c230" }}>IQ</span>
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 92, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }}>
          <span>WHY IS THIS SHIP</span>
          <span style={{ color: "#f2c230" }}>WAITING?</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#c3d0d7" }}>
          <span>
            {Math.round(hero.anchor_hours ?? 0)} h at anchor · documents returned {hero.rejections}× · berth idle{" "}
            {Math.round((hero.idle_berth_share ?? 0) * 100)}%
          </span>
          <span style={{ color: "#8ea2ae" }}>Synthetic operations · real decision models</span>
        </div>
      </div>
    ),
    size,
  );
}

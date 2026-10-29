import { ImageResponse } from "next/og";
export const alt = "BerthIQ — Every port call. A clearer decision.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "65px 75px",
          background: "#0b141c",
          color: "#e4edf0",
          borderBottom: "12px solid #74d8c6",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 40 }}>
            Berth<span style={{ color: "#74d8c6" }}>IQ</span>
          </span>
          <span style={{ color: "#8fa6b1", fontSize: 16 }}>
            PORT-CALL INTELLIGENCE / KHALIFA, UAE
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 76,
            letterSpacing: -3,
            lineHeight: 1.15,
          }}
        >
          <span>Every port call.</span>
          <span style={{ color: "#74d8c6" }}>A clearer decision.</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 20,
            color: "#8fa6b1",
          }}
        >
          <span>Observe. Explain. Re-plan.</span>
          <span>Synthetic operations. Real decision models.</span>
        </div>
      </div>
    ),
    size,
  );
}

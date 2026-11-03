import type { Metadata } from "next";
import { Big_Shoulders, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

// Port-signage display face, a sober industrial sans, and a mono for readings.
const display = Big_Shoulders({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["opsz"],
  adjustFontFallback: false,
  display: "swap",
});
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: "BerthIQ | Why is this ship waiting?",
  description:
    "Ships wait days at anchor while berths stand idle. BerthIQ traces why from the event log, predicts which calls will miss their window, and tests a staffing or berth decision with a solver and a simulator. Synthetic operations, real decision models.",
  openGraph: { type: "website", siteName: "BerthIQ" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

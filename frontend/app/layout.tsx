import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: "BerthIQ | Maritime operations intelligence",
  description: "Explore the harbor, explain operational risk and test a better berth plan. A transparent maritime decision workspace built on synthetic data.",
  openGraph: { type: "website", siteName: "BerthIQ" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

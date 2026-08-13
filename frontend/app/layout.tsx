import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BerthIQ",
  description: "Maritime port-call operations — reconstruct, predict, recommend.",
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

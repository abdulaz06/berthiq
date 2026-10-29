"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getHealth, type Health } from "../lib/api/health";

type Status = "loading" | "ok" | "error";

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let active = true;
    getHealth()
      .then((h) => {
        if (!active) return;
        setHealth(h);
        setStatus(h.status === "ok" ? "ok" : "error");
      })
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">BerthIQ</h1>
        <p className="text-slate-600">
          Maritime port-call operations — reconstruct, predict, recommend.
        </p>
      </header>
      <Link href="/console" className="rounded-xl bg-slate-900 px-6 py-4 text-center font-medium text-white">Open operations console →</Link>

      <section
        aria-label="Backend health"
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-slate-500">
          Backend health
        </h2>

        <div className="flex items-center gap-3" data-testid="health-status">
          <span
            className={
              "inline-block h-3 w-3 rounded-full " +
              (status === "ok"
                ? "bg-emerald-500"
                : status === "error"
                  ? "bg-red-500"
                  : "bg-slate-300 animate-pulse")
            }
            aria-hidden
          />
          <span className="text-lg font-medium">
            {status === "loading"
              ? "Checking…"
              : status === "ok"
                ? "Online"
                : "Unreachable"}
          </span>
        </div>

        {health && (
          <dl className="mt-4 grid grid-cols-[auto,1fr] gap-x-6 gap-y-1 text-sm text-slate-700">
            <dt className="text-slate-500">status</dt>
            <dd className="font-mono">{health.status}</dd>
            <dt className="text-slate-500">app</dt>
            <dd className="font-mono">{health.app_name}</dd>
            <dt className="text-slate-500">version</dt>
            <dd className="font-mono">{health.version}</dd>
          </dl>
        )}

        {status === "error" && (
          <p className="mt-4 text-sm text-slate-500">
            The backend isn&apos;t responding. Start it with{" "}
            <code className="font-mono">just dev</code>, or set{" "}
            <code className="font-mono">NEXT_PUBLIC_USE_FIXTURES=true</code> to
            render fixtures.
          </p>
        )}
      </section>
    </main>
  );
}

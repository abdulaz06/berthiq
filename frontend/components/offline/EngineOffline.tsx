"use client";

import Link from "next/link";
import { ArrowUpRight, Play, RotateCw } from "lucide-react";
import { QFlagMark } from "@/components/brand/QFlagMark";

export const FILM_URL = "https://github.com/abdulaz06/berthiq/blob/main/media/berthiq-showcase.mp4";

/** Shown when the API cannot be reached: the story stays available without it. */
export function EngineOffline({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="connection-state engine-offline" role="alert" aria-labelledby="engine-offline-title">
      <QFlagMark size={40} />
      <h2 id="engine-offline-title">The live engine is offline right now</h2>
      <p>
        The solver, simulator and risk model run on a small server that isn’t answering at the moment. The
        whole investigation is still here to watch or read.
      </p>
      <div className="engine-offline-actions">
        <a className="primary" href={FILM_URL} target="_blank" rel="noreferrer">
          <Play size={15} /> Watch the 60-second film <ArrowUpRight size={13} />
        </a>
        <Link className="secondary" href="/case-study">
          Read the engineering story
        </Link>
        <button type="button" className="text-button" onClick={onRetry}>
          <RotateCw size={14} /> Try the engine again
        </button>
      </div>
    </section>
  );
}

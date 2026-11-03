"use client";

import Link from "next/link";
import { RotateCw } from "lucide-react";
import { QFlagMark } from "@/components/brand/QFlagMark";

export const TOUR_PREVIEW = "/media/tour-preview.webp";
export const TOUR_STILL = "/media/tour-preview-still.webp";

/** Shown when the API cannot be reached: the story stays available without it. */
export function EngineOffline({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="connection-state engine-offline" role="alert" aria-labelledby="engine-offline-title">
      <QFlagMark size={40} />
      <h2 id="engine-offline-title">The live engine is offline right now</h2>
      <p>
        The solver, simulator and risk model run on a small server that isn’t answering at the moment. Here is
        the start of the tour, and the whole investigation is still here to read.
      </p>
      <picture className="engine-offline-preview">
        {/* Reduced motion gets the first frame, not the loop. */}
        <source media="(prefers-reduced-motion: reduce)" srcSet={TOUR_STILL} />
        <img
          src={TOUR_PREVIEW}
          width={1280}
          height={720}
          loading="lazy"
          decoding="async"
          alt="The BerthIQ tour: one ship waited 43 hours at anchor while its paperwork was sent back three times."
        />
      </picture>
      <div className="engine-offline-actions">
        <Link className="primary" href="/case-study">
          Read the engineering story
        </Link>
        <button type="button" className="text-button" onClick={onRetry}>
          <RotateCw size={14} /> Try the engine again
        </button>
      </div>
    </section>
  );
}

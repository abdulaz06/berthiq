"use client";

import { ArrowLeft, ArrowRight, Loader2, X } from "lucide-react";

export type StoryChapter = {
  kicker: string;
  title: string;
  body: string;
  /** Optional evidence line shown under the body (already phrased from data). */
  note?: string;
  action?: { label: string; run: () => void; busy?: boolean };
};

/** The docked narrator for the guided investigation. Purely presentational. */
export function StoryGuide({
  chapters,
  index,
  onBack,
  onNext,
  onClose,
}: {
  chapters: StoryChapter[];
  index: number;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const chapter = chapters[index];
  const last = index === chapters.length - 1;
  return (
    <section className="story-guide" aria-label="Guided investigation" aria-live="polite">
      <header>
        <span className="eyebrow">
          <i className="q-flag" aria-hidden="true" />
          {chapter.kicker} · {index + 1} / {chapters.length}
        </span>
        <button className="icon-button" aria-label="Close guided investigation" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <ol className="story-progress" aria-hidden="true">
        {chapters.map((c, i) => (
          <li key={c.title} className={i < index ? "done" : i === index ? "current" : ""} />
        ))}
      </ol>
      <h2>{chapter.title}</h2>
      <p>{chapter.body}</p>
      {chapter.note && <p className="story-note">{chapter.note}</p>}
      <footer>
        <button className="secondary" onClick={onBack} disabled={index === 0} aria-label="Previous step">
          <ArrowLeft size={15} />
        </button>
        {chapter.action ? (
          <button className="primary" onClick={chapter.action.run} disabled={chapter.action.busy}>
            {chapter.action.busy && <Loader2 size={15} className="spin" />}
            {chapter.action.label}
          </button>
        ) : (
          <button className="primary" onClick={onNext}>
            {last ? "Finish" : "Next"}
            {!last && <ArrowRight size={15} />}
          </button>
        )}
      </footer>
    </section>
  );
}

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PROVENANCE_STYLES, PROVENANCE_VALUES } from "@/lib/provenance";

import { ProvenanceBadge } from "./ProvenanceBadge";

describe("ProvenanceBadge", () => {
  it("renders every provenance value with its label and data hook", () => {
    for (const p of PROVENANCE_VALUES) {
      const { unmount } = render(<ProvenanceBadge provenance={p} />);
      const badge = screen.getByText(PROVENANCE_STYLES[p].label);
      expect(badge).toBeInTheDocument();
      expect(badge.closest("[data-provenance]")).toHaveAttribute("data-provenance", p);
      unmount();
    }
  });

  it("distinguishes the four states (distinct labels and colours)", () => {
    const labels = new Set(PROVENANCE_VALUES.map((p) => PROVENANCE_STYLES[p].label));
    const dots = new Set(PROVENANCE_VALUES.map((p) => PROVENANCE_STYLES[p].dot));
    const classNames = new Set(PROVENANCE_VALUES.map((p) => PROVENANCE_STYLES[p].className));
    expect(labels.size).toBe(4);
    expect(dots.size).toBe(4);
    expect(classNames.size).toBe(4);
  });

  it("exposes the meaning as a tooltip", () => {
    render(<ProvenanceBadge provenance="optimized" />);
    expect(screen.getByText("Optimized")).toHaveAttribute(
      "title",
      PROVENANCE_STYLES.optimized.description,
    );
  });
});

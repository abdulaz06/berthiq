import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EngineOffline, TOUR_PREVIEW, TOUR_STILL } from "./EngineOffline";

describe("EngineOffline", () => {
  it("shows the tour preview and the case study instead of a bare error", () => {
    const onRetry = vi.fn();
    const { container } = render(<EngineOffline onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveAccessibleName("The live engine is offline right now");
    const preview = screen.getByRole("img", { name: /43 hours at anchor/ });
    expect(preview).toHaveAttribute("src", TOUR_PREVIEW);
    expect(preview).toHaveAttribute("loading", "lazy");
    const still = container.querySelector("picture source");
    expect(still).toHaveAttribute("media", "(prefers-reduced-motion: reduce)");
    expect(still).toHaveAttribute("srcset", TOUR_STILL);
    expect(screen.queryByRole("link", { name: /film/i })).toBeNull();
    expect(screen.getByRole("link", { name: /engineering story/i })).toHaveAttribute("href", "/case-study");

    fireEvent.click(screen.getByRole("button", { name: /try the engine again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EngineOffline, FILM_URL } from "./EngineOffline";

describe("EngineOffline", () => {
  it("offers the film and the case study instead of a bare error", () => {
    const onRetry = vi.fn();
    render(<EngineOffline onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveAccessibleName("The live engine is offline right now");
    expect(screen.getByRole("link", { name: /watch the 60-second film/i })).toHaveAttribute("href", FILM_URL);
    expect(screen.getByRole("link", { name: /engineering story/i })).toHaveAttribute("href", "/case-study");

    fireEvent.click(screen.getByRole("button", { name: /try the engine again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

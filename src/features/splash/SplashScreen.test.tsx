import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPLASH_MIN_MS, SplashScreen } from "./SplashScreen";

describe("SplashScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the Mimer picture and the version", () => {
    render(<SplashScreen ready={false} onDone={vi.fn()} />);
    expect(screen.getByRole("img", { name: /Mimer/ })).toBeInTheDocument();
    expect(screen.getByText(/Version \d+\.\d+\.\d+/)).toBeInTheDocument();
  });

  it("stays for the minimum time even when the app is ready at once", () => {
    const onDone = vi.fn();
    render(<SplashScreen ready onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(SPLASH_MIN_MS - 100);
    });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    // The time is up: the screen fades out, then leaves.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("waits for the app even after the time is up", () => {
    const onDone = vi.fn();
    const { rerender } = render(<SplashScreen ready={false} onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(SPLASH_MIN_MS + 5000);
    });
    expect(onDone).not.toHaveBeenCalled();
    rerender(<SplashScreen ready onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("a click skips the wait", () => {
    const onDone = vi.fn();
    render(<SplashScreen ready onDone={onDone} />);
    fireEvent.click(screen.getByRole("dialog"));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("any key skips the wait", () => {
    const onDone = vi.fn();
    render(<SplashScreen ready onDone={onDone} />);
    fireEvent.keyDown(window, { key: " " });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

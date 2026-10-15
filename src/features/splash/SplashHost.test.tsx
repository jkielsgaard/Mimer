import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPLASH_MIN_MS } from "./SplashScreen";

vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { SplashHost } from "./SplashHost";
import { useSettingsStore } from "@/stores/settingsStore";

describe("SplashHost", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSettingsStore.setState({ settings: null, error: null });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays until the settings have loaded, then goes away for good", () => {
    render(<SplashHost />);
    act(() => {
      vi.advanceTimersByTime(SPLASH_MIN_MS + 3000);
    });
    expect(screen.getByRole("dialog", { name: "Mimer is starting" })).toBeInTheDocument();

    act(() => {
      useSettingsStore.setState({ error: "bad file" });
    });
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

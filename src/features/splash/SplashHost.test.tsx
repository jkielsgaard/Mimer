import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({ splashDone: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ message: String(e) }),
}));

import { SplashHost, SPLASH_MIN_MS } from "./SplashHost";
import { useSettingsStore } from "@/stores/settingsStore";

describe("SplashHost", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiMock.splashDone.mockReset().mockResolvedValue(undefined);
    useSettingsStore.setState({ settings: null, error: null });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for the settings, then asks the backend to show the window once", () => {
    render(<SplashHost />);
    act(() => {
      vi.advanceTimersByTime(SPLASH_MIN_MS + 3000);
    });
    expect(apiMock.splashDone).not.toHaveBeenCalled();
    act(() => {
      useSettingsStore.setState({ error: "bad file" });
    });
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(apiMock.splashDone).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(apiMock.splashDone).toHaveBeenCalledTimes(1);
  });
});

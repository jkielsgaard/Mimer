import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ openExternal: vi.fn() }));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { openLink } from "./openLink";
import { useUiStore } from "@/stores/uiStore";

describe("openLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ notice: null });
  });

  it("opens the address and shows nothing when it works", async () => {
    api.openExternal.mockResolvedValue(undefined);
    await openLink("https://example.com/a");
    expect(api.openExternal).toHaveBeenCalledWith("https://example.com/a");
    expect(useUiStore.getState().notice).toBeNull();
  });

  it("shows a dialog with the address when it cannot be opened", async () => {
    api.openExternal.mockRejectedValue(new Error("no browser"));
    await openLink("https://example.com/a");
    const notice = useUiStore.getState().notice;
    expect(notice?.title).toBe("The link could not be opened");
    expect(notice?.details).toContain("https://example.com/a");
  });
});

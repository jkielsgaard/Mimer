import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoundryStatus } from "@/bindings/FoundryStatus";

import { LoadAi } from "./LoadAi";
import { useEngineStore } from "@/stores/engineStore";
import { useFoundryStore } from "@/stores/foundryStore";

const status = (state: FoundryStatus["state"]): FoundryStatus =>
  ({ state }) as unknown as FoundryStatus;

describe("LoadAi", () => {
  const wake = vi.fn().mockResolvedValue(undefined);
  const sleep = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useFoundryStore.setState({ status: status("asleep"), wake, sleep });
    useEngineStore.setState({ status: null });
  });

  it("offers Load AI while the AI is not loaded, and loads it", async () => {
    render(<LoadAi which="foundry" />);
    expect(screen.getByText("The AI is not loaded.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Load AI" }));
    expect(wake).toHaveBeenCalledTimes(1);
  });

  it("offers Unload AI while it is loaded, and unloads it", async () => {
    useFoundryStore.setState({ status: status("awake") });
    render(<LoadAi which="foundry" />);
    expect(screen.getByText("The AI is loaded.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Unload AI" }));
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("is greyed out while it loads or unloads, and not shown before the AI is set up", () => {
    useFoundryStore.setState({ status: status("waking") });
    const { rerender } = render(<LoadAi which="foundry" />);
    expect(screen.getByRole("button", { name: "Loading the AI…" })).toBeDisabled();
    useFoundryStore.setState({ status: status("notInstalled") });
    rerender(<LoadAi which="foundry" />);
    expect(screen.queryByRole("button")).toBeNull();
    // The other built-in AI has its own state.
    rerender(<LoadAi which="builtin" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

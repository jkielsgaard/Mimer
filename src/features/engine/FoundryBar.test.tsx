import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoundryStatus } from "@/bindings/FoundryStatus";

vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { FoundryBar } from "./FoundryBar";
import { useFoundryStore } from "@/stores/foundryStore";

function status(over: Partial<FoundryStatus>): FoundryStatus {
  return {
    state: "asleep",
    message: "",
    problem: null,
    install: null,
    installed: [{ alias: "qwen3-4b", name: "Qwen 3 4B", sizeMb: 2763 }],
    activeModel: null,
    available: true,
    unavailableReason: null,
    note: null,
    folder: "/f",
    diskBytes: 0,
    restartNeeded: false,
    log: [],
    ...over,
  };
}

describe("FoundryBar", () => {
  const wake = vi.fn().mockResolvedValue(undefined);
  const sleep = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useFoundryStore.setState({ wake, sleep });
  });

  it("asleep: says so and wakes Mimer", async () => {
    useFoundryStore.setState({ status: status({}) });
    render(<FoundryBar />);
    expect(screen.getByTestId("foundry-bar")).toHaveAttribute("data-state", "asleep");
    await userEvent.setup().click(screen.getByRole("button", { name: /Wake Mimer/ }));
    expect(wake).toHaveBeenCalled();
  });

  it("awake: offers sleep, and says when another model was chosen", async () => {
    useFoundryStore.setState({ status: status({ state: "awake", restartNeeded: true }) });
    render(<FoundryBar />);
    expect(screen.getByText(/Another model was chosen/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /Sleep Mimer/ }));
    expect(sleep).toHaveBeenCalled();
  });

  it("not downloaded: says to set up, or why it cannot be used", () => {
    useFoundryStore.setState({ status: status({ state: "notInstalled", installed: [] }) });
    const { rerender } = render(<FoundryBar />);
    expect(screen.getByRole("button", { name: "Set up" })).toBeInTheDocument();
    useFoundryStore.setState({
      status: status({ state: "notInstalled", unavailableReason: "Missing library." }),
    });
    rerender(<FoundryBar />);
    expect(screen.getByText("Missing library.")).toBeInTheDocument();
  });

  it("a problem shows what to do and a way to try again", () => {
    useFoundryStore.setState({
      status: status({
        state: "error",
        problem: { title: "Mimer stopped unexpectedly", steps: ["Try again."], details: "" },
      }),
    });
    render(<FoundryBar />);
    expect(screen.getByTestId("engine-problem")).toHaveTextContent("stopped unexpectedly");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

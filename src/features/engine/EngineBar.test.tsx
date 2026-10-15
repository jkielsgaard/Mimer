import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { engineStatus } from "@/test/engineFixtures";

vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { EngineBar } from "./EngineBar";
import { useEngineStore } from "@/stores/engineStore";
import { useUiStore } from "@/stores/uiStore";

describe("EngineBar", () => {
  const wake = vi.fn().mockResolvedValue(undefined);
  const sleep = vi.fn().mockResolvedValue(undefined);
  const cancelInstall = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useEngineStore.setState({ status: engineStatus(), wake, sleep, cancelInstall });
    useUiStore.setState({ settingsOpen: false, settingsTab: null });
  });

  it("an asleep Mimer has a Wake Mimer button", async () => {
    render(<EngineBar />);
    expect(screen.getByTestId("engine-bar")).toHaveAttribute("data-state", "asleep");
    await userEvent.setup().click(screen.getByRole("button", { name: /Wake Mimer/ }));
    expect(wake).toHaveBeenCalledTimes(1);
  });

  it("an awake Mimer has a Sleep Mimer button", async () => {
    useEngineStore.setState({ status: engineStatus({ state: "awake" }) });
    render(<EngineBar />);
    expect(screen.getByText(/Mimer is awake/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /Sleep Mimer/ }));
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Wake Mimer/ })).toBeNull();
  });

  it("says when the settings changed after waking", () => {
    useEngineStore.setState({ status: engineStatus({ state: "awake", restartNeeded: true }) });
    render(<EngineBar />);
    expect(screen.getByText(/put Mimer to sleep and wake him/)).toBeInTheDocument();
  });

  it("shows the time while the model loads, and lets you cancel", async () => {
    useEngineStore.setState({
      status: engineStatus({ state: "waking", message: "Loading the model into memory… 12 s" }),
    });
    render(<EngineBar />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading the model into memory… 12 s");
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancel" }));
    expect(sleep).toHaveBeenCalled();
  });

  it("not downloaded: offers Set up, which opens Settings → Built-in AI", async () => {
    useEngineStore.setState({
      status: engineStatus({ state: "notInstalled", engine: null, models: [] }),
    });
    render(<EngineBar />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Set up" }));
    expect(useUiStore.getState().settingsOpen).toBe(true);
    expect(useUiStore.getState().settingsTab).toBe("builtin");
  });

  it("downloading shows the percentage and Cancel", async () => {
    useEngineStore.setState({
      status: engineStatus({
        state: "installing",
        message: "Downloading the engine…",
        install: { phase: "engine", file: "x.tar.gz", done: 5_000_000, total: 20_000_000 },
      }),
    });
    render(<EngineBar />);
    expect(screen.getByText(/25% of 20\.0 MB/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancelInstall).toHaveBeenCalled();
  });

  it("a problem shows what happened, the steps to take, and a way to try again", async () => {
    useEngineStore.setState({
      status: engineStatus({
        state: "error",
        message: "Not enough memory to load the model",
        problem: {
          title: "Not enough memory to load the model",
          steps: ["Close other programs.", "Lower the context size."],
          details: "Exit code: 137\nout of memory",
        },
      }),
    });
    render(<EngineBar />);
    const box = screen.getByTestId("engine-problem");
    expect(box).toHaveTextContent("Not enough memory to load the model");
    expect(box).toHaveTextContent("Close other programs.");
    expect(box).toHaveTextContent("Lower the context size.");
    expect(box).toHaveTextContent("Exit code: 137");
    await userEvent.setup().click(screen.getByRole("button", { name: /Try again/ }));
    expect(wake).toHaveBeenCalled();
  });
});

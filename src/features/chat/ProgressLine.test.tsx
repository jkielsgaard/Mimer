import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatProgress } from "@/stores/chatStore";
import { phaseText, ProgressLine, STALL_SECONDS, timeLeft } from "./ProgressLine";

const START = new Date("2026-10-13T10:00:00Z").getTime();

function progress(patch: Partial<ChatProgress> = {}): ChatProgress {
  return {
    phase: "waiting",
    step: null,
    max: null,
    detail: "",
    startedAt: START,
    lastEventAt: START,
    words: 0,
    ...patch,
  };
}

describe("ProgressLine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says what Mimer is doing in each phase", () => {
    expect(phaseText(progress({ phase: "connecting" }))).toBe("Mimer is contacting the model…");
    expect(phaseText(progress({ phase: "waiting" }))).toBe("Mimer is waiting for the model…");
    expect(phaseText(progress({ phase: "writing" }))).toBe("Mimer is writing…");
    expect(phaseText(progress({ phase: "tool", detail: "Reading Home.md" }))).toBe(
      "Reading Home.md…",
    );
    expect(phaseText(progress({ phase: "tool" }))).toBe("Mimer is working…");
  });

  it("counts seconds while it waits", () => {
    render(<ProgressLine progress={progress()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Mimer is waiting for the model…");
    expect(screen.getByText(/0 s/)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.getByText(/7 s/)).toBeInTheDocument();
  });

  it("shows the step only from the second model call, and the word count while writing", () => {
    const { rerender } = render(<ProgressLine progress={progress({ step: 1, max: 15 })} />);
    expect(screen.queryByText(/Step/)).toBeNull();
    rerender(<ProgressLine progress={progress({ step: 3, max: 15 })} />);
    expect(screen.getByText(/Step 3 of 15/)).toBeInTheDocument();
    rerender(<ProgressLine progress={progress({ phase: "writing", words: 42 })} />);
    expect(screen.getByText(/42 words/)).toBeInTheDocument();
  });

  it("suggests the model may be loading after a quiet spell, and hides the hint on news", () => {
    const { rerender } = render(<ProgressLine progress={progress()} />);
    expect(screen.queryByText(/Still waiting/)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(STALL_SECONDS * 1000);
    });
    expect(screen.getByText(/Still waiting for the model/)).toBeInTheDocument();
    expect(screen.getByText(/press Stop/)).toBeInTheDocument();
    rerender(<ProgressLine progress={progress({ lastEventAt: Date.now() })} />);
    expect(screen.queryByText(/Still waiting/)).toBeNull();
  });

  it("does not call a writing model stalled", () => {
    render(<ProgressLine progress={progress({ phase: "writing", words: 5 })} />);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.queryByText(/Still waiting/)).toBeNull();
  });
});

describe("timeLeft", () => {
  it("estimates from the finished steps and stays quiet at the start and the end", () => {
    expect(timeLeft(60_000, 4, 10)).toBe("about 2 min left");
    expect(timeLeft(10_000, 3, 5)).toBe("less than a minute left");
    expect(timeLeft(5_000, 2, 10)).toBeNull();
    expect(timeLeft(50_000, 10, 10)).toBeNull();
  });
});

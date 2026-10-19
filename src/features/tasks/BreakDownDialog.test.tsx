import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTask } from "@/test/taskFixtures";

const apiMock = vi.hoisted(() => ({ taskAddStep: vi.fn() }));
const askMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));
vi.mock("@/lib/askAi", () => ({ askAi: askMock }));

import { BreakDownDialog } from "./BreakDownDialog";
import { useTaskStore } from "@/stores/taskStore";

const task = makeTask({ title: "Document access control" });

describe("BreakDownDialog", () => {
  beforeEach(() => {
    apiMock.taskAddStep.mockReset().mockResolvedValue([task]);
    askMock.mockReset().mockReturnValue({
      promise: Promise.resolve(
        "- List who has access today\n- Ask Lene for the template\n- Write the rules",
      ),
      cancel: vi.fn(),
    });
    useTaskStore.setState({ tasks: [task] });
  });

  it("shows the steps the AI suggests, and adds only the ones that are kept", async () => {
    const onClose = vi.fn();
    render(<BreakDownDialog task={task} onClose={onClose} />);
    const user = userEvent.setup();
    expect(await screen.findByText("List who has access today")).toBeInTheDocument();
    expect(screen.getByText("Start here")).toBeInTheDocument();
    expect(apiMock.taskAddStep).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: /Ask Lene/ }));
    await user.click(screen.getByRole("button", { name: "Add 2 steps to the task" }));
    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(apiMock.taskAddStep.mock.calls.map((c: unknown[]) => c[3] as string)).toEqual([
      "List who has access today",
      "Write the rules",
    ]);
  });

  it("asks again for smaller steps", async () => {
    render(<BreakDownDialog task={task} onClose={vi.fn()} />);
    const user = userEvent.setup();
    await screen.findByText("Write the rules");
    await user.click(screen.getByRole("button", { name: "Make the steps smaller" }));
    expect(askMock).toHaveBeenCalledTimes(2);
    expect(askMock.mock.calls[1]?.[0]).toMatch(/VERY small/);
  });

  it("says what went wrong when there is no AI", async () => {
    askMock.mockImplementation(() => ({
      promise: Promise.reject(new Error("LM Studio is not reachable.")),
      cancel: vi.fn(),
    }));
    render(<BreakDownDialog task={task} onClose={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("LM Studio is not reachable.");
    expect(screen.getByRole("button", { name: /Add 0 steps/ })).toBeDisabled();
  });
});

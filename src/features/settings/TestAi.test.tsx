import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiTestResult } from "@/bindings/AiTestResult";
import type { ProviderConfig } from "@/bindings/ProviderConfig";

const apiMock = vi.hoisted(() => ({ aiTest: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ message: e instanceof Error ? e.message : String(e) }),
}));
const wake = vi.hoisted(() => ({ wakeIfNeeded: vi.fn() }));
vi.mock("@/lib/wake", () => wake);
const clip = vi.hoisted(() => ({ copyText: vi.fn() }));
vi.mock("@/lib/clipboard", () => clip);

import { TestAi, testReport } from "./TestAi";

const provider: ProviderConfig = {
  id: "foundry",
  kind: "foundry_local",
  name: "Built-in AI · Foundry Local",
  baseUrl: "http://127.0.0.1:5272/v1",
  model: "qwen3-4b",
  location: "local",
  supportsTools: true,
  contextTokens: 16000,
};

const answered: AiTestResult = {
  ok: true,
  provider: "Foundry · qwen3-4b",
  answer: "Hello!",
  error: "",
  millis: 1500,
};

describe("TestAi", () => {
  const persist = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    persist.mockResolvedValue(true);
    wake.wakeIfNeeded.mockResolvedValue(null);
  });

  it("saves, wakes the AI and shows what it answered", async () => {
    apiMock.aiTest.mockResolvedValue(answered);
    render(<TestAi provider={provider} persist={persist} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Test it" }));
    expect(await screen.findByText(/It answered/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("“Hello!”");
    expect(screen.getByRole("status")).toHaveTextContent("1.5 s");
    expect(persist).toHaveBeenCalled();
    expect(wake.wakeIfNeeded).toHaveBeenCalled();
    expect(apiMock.aiTest).toHaveBeenCalledWith("foundry");
    expect(screen.queryByRole("button", { name: "Copy for a bug report" })).toBeNull();
  });

  it("shows the error as it is and lets it be copied for a bug report", async () => {
    apiMock.aiTest.mockResolvedValue({
      ...answered,
      ok: false,
      answer: "",
      error: "HRESULT 0x8007",
    });
    render(<TestAi provider={provider} persist={persist} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Test it" }));
    expect(await screen.findByText(/It did not answer/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("HRESULT 0x8007");
    await user.click(screen.getByRole("button", { name: "Copy for a bug report" }));
    expect(clip.copyText).toHaveBeenCalledWith(expect.stringContaining("HRESULT 0x8007"));
  });

  it("says what is wrong when the AI cannot be woken, and asks nothing then", async () => {
    wake.wakeIfNeeded.mockResolvedValue("Built-in AI · Foundry Local is not set up.");
    render(<TestAi provider={provider} persist={persist} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Test it" }));
    expect(await screen.findByText(/is not set up/)).toBeInTheDocument();
    expect(apiMock.aiTest).not.toHaveBeenCalled();
  });

  it("does not test when the choices could not be saved", async () => {
    persist.mockResolvedValue(false);
    render(<TestAi provider={provider} persist={persist} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Test it" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Test it" })).toBeEnabled();
    });
    expect(apiMock.aiTest).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("writes a report with the name, the error and the time", () => {
    expect(testReport("X", { kind: "failed", message: "boom" })).toBe("Test of X\nFailed: boom");
    expect(
      testReport("X", { kind: "done", result: { ...answered, ok: false, error: "no" } }),
    ).toContain("Failed after 1500 ms: no");
  });
});

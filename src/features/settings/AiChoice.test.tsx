import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderConfig } from "@/bindings/ProviderConfig";
import type { Settings } from "@/bindings/Settings";
import { aiOrder } from "@/lib/aiChoice";

const apiMock = vi.hoisted(() => ({ appPlatform: vi.fn(), phiStatus: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ message: String(e) }),
}));

import { AiChoice } from "./AiChoice";

const lm: ProviderConfig = {
  id: "lmstudio-default",
  kind: "lmstudio",
  name: "LM Studio",
  baseUrl: "http://localhost:1234/v1",
  model: "m",
  location: "local",
  supportsTools: true,
  contextTokens: 16000,
};
const openai: ProviderConfig = {
  ...lm,
  id: "openai",
  kind: "openai_compatible",
  name: "OpenAI",
  baseUrl: "https://api.openai.com/v1",
  location: "cloud",
};

function settings(): Settings {
  return {
    ai: {
      defaultProviderId: "lmstudio-default",
      providers: [lm, openai],
      foundry: { model: "", tools: true },
      cloudConsent: null,
    },
  } as unknown as Settings;
}

describe("Settings → AI → Which AI Mimer uses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.appPlatform.mockResolvedValue({ os: "windows", store: false });
    apiMock.phiStatus.mockResolvedValue({ shown: false });
  });

  it("orders the choices for where Mimer runs, with cloud AI always last", () => {
    const base = { os: "windows", store: false, phiShown: false, copilot: false };
    expect(aiOrder(base)).toEqual(["llama", "foundry", "local", "cloud"]);
    expect(aiOrder({ ...base, os: "linux" })).toEqual(["llama", "local", "foundry", "cloud"]);
    expect(aiOrder({ ...base, store: true })).toEqual(["foundry", "local", "cloud"]);
    expect(aiOrder({ ...base, store: true, phiShown: true, copilot: true })).toEqual([
      "phi",
      "foundry",
      "local",
      "cloud",
    ]);
  });

  it("turns on a cloud AI only after the box is ticked, and records the agreement", async () => {
    const onChange = vi.fn();
    render(<AiChoice draft={settings()} onChange={onChange} onSetUp={vi.fn()} />);
    const user = userEvent.setup();
    const list = await screen.findByRole("radiogroup", { name: "AI for Mimer" });
    expect(within(list).getByRole("radio", { name: /LM Studio/ })).toHaveTextContent("In use");
    await user.click(within(list).getByRole("radio", { name: /Cloud AI/ }));
    const use = screen.getByRole("button", { name: "Use the cloud AI" });
    expect(use).toBeDisabled();
    expect(screen.getByText(/everything the AI works on leaves this computer/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /my notes are sent to OpenAI/ }));
    await user.click(use);
    const next = onChange.mock.calls[0]?.[0] as Settings;
    expect(next.ai.defaultProviderId).toBe("openai");
    expect(next.ai.cloudConsent).toMatchObject({
      providerId: "openai",
      baseUrl: "https://api.openai.com/v1",
    });
  });

  it("keeps the AI on this computer when the warning is closed", async () => {
    const onChange = vi.fn();
    render(<AiChoice draft={settings()} onChange={onChange} onSetUp={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: /Cloud AI/ }));
    await user.click(screen.getByRole("button", { name: "Keep the AI on this computer" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("sends an AI that is not set up to the place where it is set up", async () => {
    const onSetUp = vi.fn();
    const onChange = vi.fn();
    render(<AiChoice draft={settings()} onChange={onChange} onSetUp={onSetUp} />);
    const user = userEvent.setup();
    const foundry = await screen.findByRole("radio", { name: /Foundry Local/ });
    expect(foundry).toHaveTextContent("Not set up");
    await user.click(foundry);
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Set up the chosen AI" }));
    expect(onSetUp).toHaveBeenCalledWith("builtin");
  });
});

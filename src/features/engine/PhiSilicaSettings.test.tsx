import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PhiStatus } from "@/bindings/PhiStatus";
import type { Settings } from "@/bindings/Settings";
import { DEFAULT_BUILTIN } from "@/test/builtinDefaults";

const apiMock = vi.hoisted(() => ({
  phiStatus: vi.fn(),
  phiEnsureReady: vi.fn(),
  phiTest: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ message: String(e) }),
}));
vi.mock("@/lib/events", () => ({ onPhiProgress: () => Promise.resolve(() => undefined) }));

import { PHI_ID, PhiSilicaSettings, phiReport } from "./PhiSilicaSettings";

const ok = (text: string, code: string | null = null) => ({ state: "ok" as const, text, code });

const READY: PhiStatus = {
  shown: true,
  access: ok("Unlocked for Mimer", "Available"),
  device: ok("Copilot+ PC with a neural processor"),
  model: ok("Ready", "Ready"),
  canGetModel: false,
};

function settings(defaultProviderId = "lm"): Settings {
  return {
    schemaVersion: 1,
    recentVaults: [],
    lastVault: null,
    theme: "system",
    editor: {
      fontSize: 15,
      lineWidth: 760,
      spellcheck: true,
      recentNotes: 4,
      aiSpelling: false,
      traceWork: false,
      ownWords: [],
    },
    git: { authorName: "M", authorEmail: "m@l", idleCommitMinutes: 5 },
    ai: {
      defaultProviderId,
      checkAnswers: false,
      cloudConsent: null,
      builtin: { ...DEFAULT_BUILTIN },
      foundry: { model: "", tools: true },
      answerLanguage: "",
      globalInstructions: "",
      embeddings: { enabled: false, providerId: "lm", model: "" },
      providers: [],
    },
  };
}

describe("Settings → Built-in AI → Phi Silica", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows each check with Windows' own answer, tests, and is only used when chosen", async () => {
    apiMock.phiTest.mockResolvedValue({
      ok: true,
      prompt: "Fix the spelling: Teh meeting is on tuesday.",
      answer: "The meeting is on Tuesday.",
      millis: 1800,
      message: "",
    });
    const onChange = vi.fn();
    render(
      <PhiSilicaSettings
        draft={settings()}
        onChange={onChange}
        status={READY}
        onStatus={vi.fn()}
      />,
    );
    expect(screen.getByText("Unlocked for Mimer")).toBeInTheDocument();
    expect(screen.getByText(/· Available/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Test Phi Silica" }));
    expect(await screen.findByText("Answered in 1.8 s")).toBeInTheDocument();
    expect(screen.getByText(/The meeting is on Tuesday\./)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use Phi Silica for my notes" }));
    const next = onChange.mock.calls[0]?.[0] as Settings;
    expect(next.ai.defaultProviderId).toBe(PHI_ID);
    expect(next.ai.providers).toEqual([
      expect.objectContaining({ id: PHI_ID, kind: "phi_silica", supportsTools: false }),
    ]);
  });

  it("cannot be used or tested until every line is green, and can ask Windows for the model", async () => {
    const notReady: PhiStatus = {
      ...READY,
      model: { state: "warn", text: "Windows has not got it yet.", code: "NotReady" },
      canGetModel: true,
    };
    apiMock.phiEnsureReady.mockResolvedValue(READY);
    const onStatus = vi.fn();
    render(
      <PhiSilicaSettings
        draft={settings()}
        onChange={vi.fn()}
        status={notReady}
        onStatus={onStatus}
      />,
    );
    expect(screen.getByRole("button", { name: "Use Phi Silica for my notes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Test Phi Silica" })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Ask Windows to get it" }));
    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith(READY);
    });
  });

  it("says when Mimer already uses it", () => {
    render(
      <PhiSilicaSettings
        draft={settings(PHI_ID)}
        onChange={vi.fn()}
        status={READY}
        onStatus={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Mimer uses Phi Silica" })).toBeDisabled();
  });

  it("puts the checks in a short text for a bug report", () => {
    const text = phiReport(
      { ...READY, access: { state: "fail", text: "Not unlocked.", code: "Unavailable" } },
      null,
    );
    expect(text).toContain("Access from Microsoft: fail · Not unlocked. (Unavailable)");
    expect(text).toContain("The model: ok · Ready (Ready)");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/bindings/Settings";
import type { Skill } from "@/bindings/Skill";

const { sendMock, testMock } = vi.hoisted(() => ({ sendMock: vi.fn(), testMock: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: { testProvider: testMock },
  toApiError: (e: unknown) => ({ message: String(e) }),
}));

import { useChatStore } from "@/stores/chatStore";
import { useEngineStore } from "@/stores/engineStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { localAiProblem, runSkillOn, skillFits } from "./skills";

const skill = (appliesTo: Skill["appliesTo"]): Skill => ({
  id: "u1",
  name: "Tidy",
  description: "",
  kind: "rewrite",
  appliesTo,
  instruction: "Tidy.",
  builtin: false,
});

function useProvider(kind: string, location: "local" | "cloud" = "local"): void {
  const settings = {
    ai: {
      defaultProviderId: "p",
      providers: [{ id: "p", kind, name: "The AI", location }],
    },
  } as unknown as Settings;
  useSettingsStore.setState({ settings });
}

describe("skillFits", () => {
  it("offers note skills for notes, folder skills for folders and both for either", () => {
    expect(skillFits(skill("note"), false)).toBe(true);
    expect(skillFits(skill("note"), true)).toBe(false);
    expect(skillFits(skill("folder"), true)).toBe(true);
    expect(skillFits(skill("folder"), false)).toBe(false);
    expect(skillFits(skill("both"), true)).toBe(true);
    expect(skillFits(skill("both"), false)).toBe(true);
  });
});

describe("localAiProblem", () => {
  beforeEach(() => {
    testMock.mockReset();
    useEngineStore.setState({ status: null });
  });

  it("blocks when no AI is set up or the AI is not local", async () => {
    useSettingsStore.setState({ settings: null });
    expect(await localAiProblem()).toMatch(/No AI is set up/);
    useProvider("anthropic", "cloud");
    expect(await localAiProblem()).toMatch(/not local/);
  });

  it("blocks when the built-in AI is not running", async () => {
    useProvider("builtin");
    expect(await localAiProblem()).toMatch(/not running/);
  });

  it("allows the built-in AI once it is awake", async () => {
    useProvider("builtin");
    useEngineStore.setState({ status: { state: "awake" } } as never);
    expect(await localAiProblem()).toBeNull();
  });

  it("checks that LM Studio and other local servers answer", async () => {
    useProvider("lmstudio");
    testMock.mockResolvedValueOnce({ ok: false, message: "Connection refused", models: [] });
    expect(await localAiProblem()).toMatch(/not reachable: Connection refused/);
    testMock.mockResolvedValueOnce({ ok: true, message: "", models: ["m"] });
    expect(await localAiProblem()).toBeNull();
    testMock.mockRejectedValueOnce(new Error("down"));
    expect(await localAiProblem()).toMatch(/not reachable/);
  });
});

describe("runSkillOn", () => {
  beforeEach(() => {
    sendMock.mockReset();
    testMock.mockReset().mockResolvedValue({ ok: true, message: "", models: [] });
    useProvider("lmstudio");
    useChatStore.setState({
      streaming: false,
      draftMentions: [],
      draftSkill: null,
      send: sendMock,
    });
    useUiStore.setState({ rightTab: "history" });
  });

  it("attaches the items, chooses the skill, opens the assistant and sends", async () => {
    await runSkillOn(skill("both"), ["Notes/A.md", "Inbox"]);
    const s = useChatStore.getState();
    expect(s.draftMentions).toEqual(["Notes/A.md", "Inbox"]);
    expect(s.draftSkill?.id).toBe("u1");
    expect(useUiStore.getState().rightTab).toBe("assistant");
    expect(sendMock).toHaveBeenCalledWith("");
  });

  it("does nothing when no local AI is running", async () => {
    testMock.mockResolvedValue({ ok: false, message: "Connection refused", models: [] });
    await runSkillOn(skill("both"), ["A.md"]);
    expect(sendMock).not.toHaveBeenCalled();
    expect(useChatStore.getState().draftMentions).toEqual([]);
  });

  it("does nothing while the assistant is busy", async () => {
    useChatStore.setState({ streaming: true });
    await runSkillOn(skill("both"), ["A.md"]);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("refuses more items than can be attached", async () => {
    await runSkillOn(skill("both"), ["1.md", "2.md", "3.md", "4.md", "5.md", "6.md"]);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Settings } from "@/bindings/Settings";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVaultStore } from "@/stores/vaultStore";
import { PrivacyNote } from "./PrivacyNote";

const cloud = {
  id: "openai",
  kind: "openai_compatible" as const,
  name: "OpenAI",
  baseUrl: "https://api.openai.com/v1",
  model: "m",
  location: "cloud" as const,
  supportsTools: true,
  contextTokens: 100000,
};

function settings(agreed: boolean): Settings {
  return {
    ai: {
      defaultProviderId: "openai",
      providers: [cloud],
      cloudConsent: agreed ? { providerId: "openai", baseUrl: cloud.baseUrl, agreedAt: "" } : null,
    },
  } as unknown as Settings;
}

describe("PrivacyNote", () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null });
    useVaultStore.setState({ projects: [], activePath: null, selectedPath: null });
  });

  it("tells that the AI is local and the notes stay on this computer", () => {
    render(<PrivacyNote />);
    expect(screen.getByTestId("privacy-note")).toHaveTextContent(
      "Local AI · your notes stay on this computer",
    );
  });

  it("says in orange when the notes go to the cloud AI the user turned on", () => {
    useSettingsStore.setState({ settings: settings(true) });
    render(<PrivacyNote />);
    expect(screen.getByTestId("privacy-note")).toHaveTextContent(
      "Cloud AI · your notes go to OpenAI",
    );
  });
});

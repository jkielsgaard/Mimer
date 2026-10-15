import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VaultInfo } from "@/bindings/VaultInfo";

const api = vi.hoisted(() => ({ listTemplates: vi.fn(), createNoteFromTemplate: vi.fn() }));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { TemplatePicker } from "./TemplatePicker";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

const vault: VaultInfo = {
  name: "V",
  path: "/v",
  config: {
    schemaVersion: 1,
    attachmentsFolder: "attachments",
    newNoteFolder: "",
    dailyNotesFolder: "Daily",
    dailyNoteFormat: "%Y-%m-%d",
    dailyTemplate: "",
    meetingsFolder: "Meetings",
    quickNotesFolder: "Quick notes",
    imageLinkStyle: "markdown",
  },
};

describe("TemplatePicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listTemplates.mockResolvedValue([{ name: "Meeting", path: ".vault/templates/Meeting.md" }]);
    api.createNoteFromTemplate.mockResolvedValue("Work/Kickoff.md");
    useVaultStore.setState({ vault, files: [], tree: [], selectedPath: null, activePath: null });
    useUiStore.setState({ templatePickerOpen: true });
  });

  it("lists templates and creates a note from the chosen one", async () => {
    render(<TemplatePicker />);
    await screen.findByRole("radio", { name: "Meeting" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Meeting" }));
    await user.clear(screen.getByLabelText("Note name"));
    await user.type(screen.getByLabelText("Note name"), "Kickoff");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(api.createNoteFromTemplate).toHaveBeenCalled();
    });
    expect(api.createNoteFromTemplate.mock.calls[0]?.slice(1)).toEqual(["Kickoff", "Meeting"]);
  });

  it("a blank note passes no template", async () => {
    render(<TemplatePicker />);
    await screen.findByRole("radio", { name: "Meeting" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(api.createNoteFromTemplate).toHaveBeenCalled();
    });
    expect(api.createNoteFromTemplate.mock.calls[0]?.[2]).toBeNull();
  });
});

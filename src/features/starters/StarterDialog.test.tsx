import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  createNote: vi.fn(),
  writeNote: vi.fn(),
  getTree: vi.fn(),
  listProjects: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));

import { fileNameFrom, StarterDialog } from "./StarterDialog";
import { STARTERS } from "./starters";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

describe("starters", () => {
  const meeting = STARTERS[0];
  it("write a note from the answers, with blanks where nothing was written", () => {
    expect(meeting).toBeDefined();
    const note = meeting?.build("Meeting with Acme", "2026-10-19", {
      people: "Mette, Peter",
      decided: "40 users\nA discount is asked for",
      next: "Peter asks head office",
    });
    expect(note).toContain("# Meeting with Acme");
    expect(note).toContain("**People:** Mette, Peter");
    expect(note).toContain("- 40 users\n- A discount is asked for");
    expect(note).toContain("- [ ] Peter asks head office");
    const empty = meeting?.build("T", "2026-10-19", {});
    expect(empty).toContain("**People:** [who]");
    expect(empty).toContain("- [ ] [who does what by when]");
  });
  it("every starter makes a note with a title and at least one task or section", () => {
    for (const s of STARTERS) {
      const note = s.build(s.title("2026-10-19"), "2026-10-19", {});
      expect(note.startsWith("# ")).toBe(true);
      expect(note).toMatch(/## /);
    }
  });
  it("file names have no characters a file cannot have", () => {
    expect(fileNameFrom('Meeting: Acme / "Q4"?')).toBe("Meeting Acme Q4");
    expect(fileNameFrom("  ")).toBe("Untitled");
  });
});

describe("StarterDialog", () => {
  beforeEach(() => {
    for (const f of Object.values(apiMock)) f.mockReset();
    apiMock.createNote.mockResolvedValue("Meetings/Meeting 2026.md");
    apiMock.writeNote.mockResolvedValue(undefined);
    apiMock.getTree.mockResolvedValue([]);
    apiMock.listProjects.mockResolvedValue([]);
    useVaultStore.setState({
      vault: {
        name: "V",
        path: "/v",
        config: { meetingsFolder: "Meetings", quickNotesFolder: "Quick" },
      } as never,
      openNote: vi.fn().mockResolvedValue(undefined),
      refreshTree: vi.fn().mockResolvedValue(undefined),
    });
    useUiStore.setState({ starterOpen: true });
  });

  it("creates the note in the meetings folder from the answers and opens it", async () => {
    render(<StarterDialog />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Who was in the meeting?"), "Mette and Peter");
    expect(screen.getByLabelText("Preview of the note")).toHaveTextContent("Mette and Peter");
    await user.click(screen.getByRole("button", { name: "Create the note" }));
    await waitFor(() => {
      expect(apiMock.writeNote).toHaveBeenCalled();
    });
    expect(apiMock.createNote.mock.calls[0]?.[0]).toBe("Meetings");
    expect(apiMock.writeNote.mock.calls[0]?.[1] as string).toContain("**People:** Mette and Peter");
    expect(useVaultStore.getState().openNote).toHaveBeenCalledWith("Meetings/Meeting 2026.md");
    expect(useUiStore.getState().starterOpen).toBe(false);
  });

  it("uses the quick notes folder for the others", async () => {
    render(<StarterDialog />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /Status update/ }));
    expect(screen.getByLabelText("What is done?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create the note" }));
    await waitFor(() => {
      expect(apiMock.createNote).toHaveBeenCalled();
    });
    expect(apiMock.createNote.mock.calls[0]?.[0]).toBe("Quick");
  });
});

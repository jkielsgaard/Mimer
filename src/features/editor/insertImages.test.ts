import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VaultInfo } from "@/bindings/VaultInfo";
import { LinkResolver } from "@/lib/links";

const api = vi.hoisted(() => ({ addImages: vi.fn() }));
const dialogs = vi.hoisted(() => ({ pickImages: vi.fn() }));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/dialogs", () => dialogs);

import { insertImagesFromDialog, savedImageText } from "./insertImages";
import { useVaultStore } from "@/stores/vaultStore";

function vault(style: string): VaultInfo {
  return {
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
      imageLinkStyle: style,
    },
  };
}

function setup(style: string): void {
  const files = ["Work/Plan.md", "attachments/chart.png", "attachments/shot one.png"];
  useVaultStore.setState({
    vault: vault(style),
    files,
    resolver: new LinkResolver(files),
    refreshTree: vi.fn().mockResolvedValue(undefined),
  });
}

describe("inserting pictures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes a Markdown image with a path relative to the note", async () => {
    setup("markdown");
    expect(await savedImageText("Work/Plan.md", "../attachments/shot%20one.png", "shot one")).toBe(
      "![shot one](../attachments/shot%20one.png)",
    );
  });

  it("writes a short embed when the vault is set to that", async () => {
    setup("wiki");
    expect(await savedImageText("Work/Plan.md", "../attachments/chart.png", "chart")).toBe(
      "![[chart.png]]",
    );
  });

  it("copies the chosen files into the vault and inserts one line per picture at the cursor", async () => {
    setup("markdown");
    dialogs.pickImages.mockResolvedValue(["/home/me/a.png", "/home/me/b.png"]);
    api.addImages.mockResolvedValue(["../attachments/chart.png", "../attachments/shot%20one.png"]);
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc: "Intro\n", selection: { anchor: 6 } }),
    });
    await insertImagesFromDialog(view, "Work/Plan.md");
    expect(api.addImages).toHaveBeenCalledWith("Work/Plan.md", [
      "/home/me/a.png",
      "/home/me/b.png",
    ]);
    expect(view.state.doc.toString()).toBe(
      "Intro\n![chart](../attachments/chart.png)\n![shot one](../attachments/shot%20one.png)",
    );
    view.destroy();
  });

  it("does nothing when the file dialog is cancelled", async () => {
    setup("markdown");
    dialogs.pickImages.mockResolvedValue([]);
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc: "x" }),
    });
    await insertImagesFromDialog(view, "a.md");
    expect(api.addImages).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe("x");
    view.destroy();
  });
});

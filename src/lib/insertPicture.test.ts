import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { beforeEach, describe, expect, it } from "vitest";
import { LinkResolver } from "@/lib/links";
import { setActiveEditor } from "./activeEditor";
import { insertPictureIntoNote } from "./insertPicture";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

function editor(doc: string, anchor: number): EditorView {
  const parent = document.createElement("div");
  document.body.append(parent);
  return new EditorView({ state: EditorState.create({ doc, selection: { anchor } }), parent });
}

describe("insertPictureIntoNote", () => {
  beforeEach(() => {
    useUiStore.setState({ toasts: [] });
    const files = ["Work/Plan.md", "attachments/chart.png"];
    useVaultStore.setState({ files, resolver: new LinkResolver(files), vault: null });
  });

  it("writes the picture at the cursor, with a path relative to the note", () => {
    const view = editor("Hello world", 5);
    setActiveEditor(view, () => "Work/Plan.md");
    expect(insertPictureIntoNote("attachments/chart.png")).toBe(true);
    expect(view.state.doc.toString()).toBe("Hello![chart](../attachments/chart.png) world");
  });

  it("tells the user what to do when no note has been clicked in", () => {
    const view = editor("x", 0);
    setActiveEditor(view, () => null);
    expect(insertPictureIntoNote("attachments/chart.png")).toBe(false);
    expect(useUiStore.getState().toasts[0]?.message).toMatch(/Click in a note/);
  });
});

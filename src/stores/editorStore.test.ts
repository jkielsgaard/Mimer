import { beforeEach, describe, expect, it } from "vitest";
import { saveStatusLabel, useEditorStore } from "./editorStore";

describe("editor save status", () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
  });

  it("starts as saved", () => {
    expect(useEditorStore.getState().statuses.primary).toBe("saved");
  });

  it("goes unsaved → saving → saved", () => {
    const s = useEditorStore.getState();
    s.markUnsaved();
    expect(useEditorStore.getState().statuses.primary).toBe("unsaved");
    s.markSaving();
    expect(useEditorStore.getState().statuses.primary).toBe("saving");
    s.markSaved();
    expect(useEditorStore.getState().statuses.primary).toBe("saved");
  });

  it("stays unsaved when edits arrived during the write", () => {
    const s = useEditorStore.getState();
    s.markSaving();
    s.markSaved(true);
    expect(useEditorStore.getState().statuses.primary).toBe("unsaved");
  });

  it("keeps the two panes independent", () => {
    const s = useEditorStore.getState();
    s.markUnsaved("secondary");
    expect(useEditorStore.getState().statuses).toEqual({ primary: "saved", secondary: "unsaved" });
    s.markSaved(false, "secondary");
    expect(useEditorStore.getState().statuses.secondary).toBe("saved");
  });

  it("reset clears status and conflict of one pane or both", () => {
    const s = useEditorStore.getState();
    s.markUnsaved("primary");
    s.markUnsaved("secondary");
    s.setConflict({ path: "a.md", diskContent: "x" }, "primary");
    s.reset("primary");
    expect(useEditorStore.getState().statuses.primary).toBe("saved");
    expect(useEditorStore.getState().statuses.secondary).toBe("unsaved");
    expect(useEditorStore.getState().conflicts.primary).toBeNull();
    s.reset();
    expect(useEditorStore.getState().statuses.secondary).toBe("saved");
  });

  it("uses the labels from the spec", () => {
    expect(saveStatusLabel("saved")).toBe("Saved");
    expect(saveStatusLabel("saving")).toBe("Saving…");
    expect(saveStatusLabel("unsaved")).toBe("Unsaved changes");
  });
});

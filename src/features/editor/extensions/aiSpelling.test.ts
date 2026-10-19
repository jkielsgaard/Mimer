import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { clearSpelling, locate, paragraphAt, parseFixes, setMarks, spellField } from "./aiSpelling";

describe("spelling help", () => {
  it("reads the AI's answer and ignores anything else", () => {
    expect(parseFixes("NONE")).toEqual([]);
    expect(
      parseFixes("- sertificate => certificate\nconect -> connect\nSure, here you go"),
    ).toEqual([
      { wrong: "sertificate", right: "certificate" },
      { wrong: "conect", right: "connect" },
    ]);
  });

  it("marks whole words only, and never the user's own words", () => {
    const text = "The sertificate and the conect; reconect is fine. Mimer";
    const marks = locate(
      text,
      10,
      [
        { wrong: "conect", right: "connect" },
        { wrong: "sertificate", right: "certificate" },
        { wrong: "Mimer", right: "Mimir" },
      ],
      ["mimer"],
    );
    expect(marks.map((m) => m.wrong)).toEqual(["conect", "sertificate"]);
    expect(marks[0]?.from).toBe(10 + text.indexOf("conect"));
  });

  it("finds the paragraph around the cursor", () => {
    const state = EditorState.create({ doc: "# Title\n\nOne line\ntwo line\n\nOther" });
    expect(paragraphAt(state, 12).text).toBe("One line\ntwo line");
    expect(paragraphAt(state, 8).text).toBe("");
  });

  it("drops a mark when its word is edited and keeps the others in place", () => {
    const view = new EditorView({
      state: EditorState.create({ doc: "aa bb cc", extensions: [spellField] }),
    });
    const marks = locate(
      "aa bb cc",
      0,
      [
        { wrong: "aa", right: "a" },
        { wrong: "cc", right: "c" },
      ],
      [],
    );
    view.dispatch({ effects: setMarks.of({ from: 0, to: 8, marks }) });
    expect(view.state.field(spellField)).toHaveLength(2);
    view.dispatch({ changes: { from: 0, to: 1, insert: "x" } });
    expect(view.state.field(spellField).map((m) => [m.wrong, m.from])).toEqual([["cc", 6]]);
    view.dispatch({ changes: { from: 3, insert: "new " } });
    expect(view.state.field(spellField)[0]?.from).toBe(10);
    clearSpelling(view);
    expect(view.state.field(spellField)).toEqual([]);
  });
});

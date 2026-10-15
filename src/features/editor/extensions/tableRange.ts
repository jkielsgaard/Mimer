import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

export interface TableRange {
  from: number;
  to: number;
  text: string;
}

/** All Markdown table nodes of the document (document order). */
export function tableNodes(state: EditorState): TableRange[] {
  const out: TableRange[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "Table") {
        out.push({ from: node.from, to: node.to, text: state.sliceDoc(node.from, node.to) });
        return false;
      }
      return undefined;
    },
  });
  return out;
}

/** The table that contains `pos`, or null. */
export function tableAt(state: EditorState, pos: number): TableRange | null {
  let node = syntaxTree(state).resolveInner(pos, 1);
  while (node.name !== "Table") {
    if (!node.parent) return null;
    node = node.parent;
  }
  return { from: node.from, to: node.to, text: state.sliceDoc(node.from, node.to) };
}

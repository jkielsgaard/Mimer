import { afterEach, describe, expect, it } from "vitest";
import { aiField, fieldRange, replaceInField } from "./fieldText";

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("aiField", () => {
  it("accepts text boxes and refuses passwords, search boxes, read-only boxes and the editor", () => {
    mount(`
      <textarea id="a"></textarea>
      <input id="b" type="text" />
      <input id="c" type="password" />
      <input id="d" type="date" />
      <input id="e" type="text" readonly />
      <input id="f" type="text" data-no-ai />
      <div data-no-ai><input id="g" type="text" /></div>
      <div class="cm-editor"><textarea id="h"></textarea></div>
      <input id="i" role="searchbox" />
    `);
    const get = (id: string): HTMLElement | null => document.getElementById(id);
    expect(aiField(get("a"))).not.toBeNull();
    expect(aiField(get("b"))).not.toBeNull();
    for (const id of ["c", "d", "e", "f", "g", "h", "i"]) expect(aiField(get(id))).toBeNull();
    expect(aiField(document.body)).toBeNull();
    expect(aiField(null)).toBeNull();
  });
});

describe("fieldRange", () => {
  it("is the selection when there is one, else all the text, else nothing", () => {
    const el = document.createElement("textarea");
    el.value = "helo wrld";
    el.setSelectionRange(5, 9);
    expect(fieldRange(el)).toEqual({ from: 5, to: 9, whole: false });
    el.setSelectionRange(2, 2);
    expect(fieldRange(el)).toEqual({ from: 0, to: 9, whole: true });
    el.value = "   ";
    expect(fieldRange(el)).toBeNull();
  });
});

describe("replaceInField", () => {
  it("replaces the range and tells the form, as typing would", () => {
    const el = document.createElement("textarea");
    document.body.append(el);
    el.value = "helo wrld";
    let heard = "";
    el.addEventListener("input", () => {
      heard = el.value;
    });
    replaceInField(el, 0, 9, "hello world");
    expect(el.value).toBe("hello world");
    expect(heard).toBe("hello world");
    replaceInField(el, 6, 11, "there");
    expect(el.value).toBe("hello there");
  });
});

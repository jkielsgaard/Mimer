/** A plain text box: an `<input type="text">` or a `<textarea>`. */
export type TextField = HTMLInputElement | HTMLTextAreaElement;

/** Input types that hold ordinary text. Passwords, numbers, dates and the like are left alone. */
const TEXT_TYPES = new Set(["", "text"]);

/**
 * The text box an event happened in, when the AI may help with it. Not offered: the editor
 * (it has its own commands), read-only and disabled boxes, passwords and keys, search boxes, and
 * anything marked `data-no-ai` (names of files, paths and the like).
 */
export function aiField(target: EventTarget | null): TextField | null {
  if (!(target instanceof HTMLTextAreaElement) && !(target instanceof HTMLInputElement)) {
    return null;
  }
  if (target instanceof HTMLInputElement && !TEXT_TYPES.has(target.type)) return null;
  if (target.readOnly || target.disabled) return null;
  if (target.closest(".cm-editor") !== null || target.closest("[data-no-ai]") !== null) return null;
  if (target.getAttribute("role") === "searchbox" || target.getAttribute("role") === "combobox") {
    return null;
  }
  return target;
}

/**
 * The part of a box the AI works on: the selection when something is selected, else all of it.
 * Null when there is no text.
 */
export function fieldRange(el: TextField): { from: number; to: number; whole: boolean } | null {
  const a = el.selectionStart ?? 0;
  const b = el.selectionEnd ?? 0;
  if (b - a > 0 && el.value.slice(a, b).trim() !== "") return { from: a, to: b, whole: false };
  return el.value.trim() === "" ? null : { from: 0, to: el.value.length, whole: true };
}

/**
 * Puts `text` into a box in place of `from`..`to`, the way typing would: the box's `input` event
 * fires, so the form that owns the box (React or not) sees the new value.
 */
export function replaceInField(el: TextField, from: number, to: number, text: string): void {
  const next = el.value.slice(0, from) + text + el.value.slice(to);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  // The native setter is used so a React form sees the change as if it had been typed.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const set = Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set;
  if (set) set.call(el, next);
  else el.value = next;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
  el.setSelectionRange(from, from + text.length);
}

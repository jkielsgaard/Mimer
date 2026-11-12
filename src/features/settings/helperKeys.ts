/** The key of a key press as Mimer writes it in a combination (`N`, `7`, `F5`), or null. */
function keyOf(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
  return null;
}

/**
 * The key combination of a key press, written as `Ctrl+Alt+N`, or null when it is only a modifier
 * key being held down, has no modifier (it would swallow ordinary typing) or is a key the helper
 * does not use.
 */
export function combinationFromEvent(e: {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  const key = keyOf(e.code);
  if (key === null) return null;
  const parts = [
    e.ctrlKey ? "Ctrl" : null,
    e.altKey ? "Alt" : null,
    e.shiftKey ? "Shift" : null,
    e.metaKey ? "Win" : null,
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return null;
  return [...parts, key].join("+");
}

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contrast } from "./color";
import { applyTheme, isDarkTheme, resolveTheme, THEMES } from "./themes";

/** The tokens of one theme, read from the stylesheet. */
function tokensOf(id: string): Record<string, string> {
  const css = readFileSync(path.join(__dirname, "..", "index.css"), "utf8");
  const header =
    id === "light"
      ? ':root,\n[data-theme="light"]'
      : id === "dark"
        ? '.dark,\n[data-theme="dark"]'
        : `[data-theme="${id}"]`;
  const at = css.indexOf(`${header} {`);
  if (at === -1) throw new Error(`No block for ${id}`);
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z-]+):\s*(oklch\([^)]*\));/g)) out[m[1] ?? ""] = m[2] ?? "";
  return out;
}

describe("themes", () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
    document.documentElement.classList.remove("dark");
  });

  it("offers eight themes, four light and four dark", () => {
    expect(THEMES).toHaveLength(8);
    expect(THEMES.filter((t) => t.dark)).toHaveLength(4);
    expect(isDarkTheme("midnight")).toBe(true);
    expect(isDarkTheme("paper")).toBe(false);
  });

  it("follows the computer only for system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("mint", true)).toBe("mint");
  });

  it("puts the theme and the dark class on the page", () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes("dark"), media: q })) as never;
    applyTheme("ember");
    expect(document.documentElement.dataset.theme).toBe("ember");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    applyTheme("slate");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  // Text 4.5:1 on every surface it is used on; buttons and the focus ring 3:1 (docs/UX-GUIDE.md).
  it.each(THEMES.map((t) => t.id))("%s can be read", (id) => {
    const t = tokensOf(id);
    expect(Object.keys(t)).toHaveLength(16);
    const text: [string, string][] = [
      ["foreground", "background"],
      ["foreground", "card"],
      ["foreground", "sidebar"],
      ["foreground", "muted"],
      ["muted-foreground", "background"],
      ["muted-foreground", "card"],
      ["muted-foreground", "sidebar"],
      ["primary-foreground", "primary"],
      ["accent-foreground", "accent"],
    ];
    for (const [a, b] of text) {
      expect(contrast(t[a] ?? "", t[b] ?? ""), `${a} on ${b}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const surface of ["background", "card"]) {
      expect(
        contrast(t.primary ?? "", t[surface] ?? ""),
        `primary on ${surface}`,
      ).toBeGreaterThanOrEqual(3);
      expect(contrast(t.ring ?? "", t[surface] ?? ""), `ring on ${surface}`).toBeGreaterThanOrEqual(
        3,
      );
    }
  });
});

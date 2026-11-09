import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string): string => readFileSync(path.join(root, file), "utf8");

/** Plain text of the website: no tags, no script or style, entities decoded, one space between words. */
function siteText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

/** Plain text of the README: no emphasis marks or code ticks, one space between words. */
function readmeText(md: string): string {
  return md.replace(/[*_`]/g, "").replace(/\s+/g, " ");
}

const facts = (
  JSON.parse(read("docs/shared-facts.json")) as { facts: { id: string; text: string }[] }
).facts;
const pkg = JSON.parse(read("package.json")) as { version: string };

describe("the website and the README say the same", () => {
  const site = siteText(read("site/index.html"));
  const readme = readmeText(read("README.md"));

  it.each(facts)("both have the sentence “$id” in the same words", ({ text }) => {
    expect(site.includes(text), `the website does not say: ${text}`).toBe(true);
    expect(readme.includes(text), `the README does not say: ${text}`).toBe(true);
  });

  it("the website shows the version that is built (0.x as v0.N), so it is updated with a release", () => {
    const [major, minor] = pkg.version.split(".");
    const shown = major === "0" ? `Preview v0.${minor ?? ""}` : `v${major ?? ""}.${minor ?? ""}`;
    expect(site.includes(shown), `the website does not show ${shown}`).toBe(true);
  });

  it("the screenshots the README shows are in the repository", () => {
    const names = [...read("README.md").matchAll(/docs\/screenshots\/([\w-]+\.png)/g)].map(
      (m) => m[1] ?? "",
    );
    expect(names.length).toBeGreaterThan(5);
    for (const n of names)
      expect(() => readFileSync(path.join(root, "docs/screenshots", n))).not.toThrow();
  });
});

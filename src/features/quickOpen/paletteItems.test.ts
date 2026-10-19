import { describe, expect, it, vi } from "vitest";
import type { Skill } from "@/bindings/Skill";
import { filterPalette, skillItems, type PaletteItem } from "./paletteItems";

const skill = (id: string, name: string, appliesTo: Skill["appliesTo"]): Skill => ({
  id,
  name,
  description: "d",
  kind: "rewrite",
  appliesTo,
  instruction: "x",
  builtin: true,
});
const item = (group: PaletteItem["group"], label: string): PaletteItem => ({
  id: `${group}:${label}`,
  group,
  label,
  run: vi.fn(),
});

describe("skillItems", () => {
  const all = [skill("a", "Fix", "note"), skill("b", "Sort", "folder"), skill("c", "Sum", "both")];
  it("offers the skills that fit a note", () => {
    const items = skillItems(all, { path: "A.md", isDir: false, name: "A" }, vi.fn());
    expect(items.map((i) => i.label)).toEqual(["Fix", "Sum"]);
  });
  it("offers the skills that fit a folder and runs one on the target", () => {
    const run = vi.fn();
    const target = { path: "Inbox", isDir: true, name: "Inbox" };
    const items = skillItems(all, target, run);
    expect(items.map((i) => i.label)).toEqual(["Sort", "Sum"]);
    items[0]?.run();
    expect(run).toHaveBeenCalledWith(all[1], target);
  });
  it("offers none without a target", () => {
    expect(skillItems(all, null, vi.fn())).toEqual([]);
  });
});

describe("filterPalette", () => {
  const skills = [item("Skills", "Fix spelling")];
  const notes = [item("Notes", "Firewall plan"), item("Notes", "Budget")];
  const actions = [item("Actions", "New note"), item("Actions", "Open Settings")];
  it("lists skills and actions but no notes before anything is typed", () => {
    const r = filterPalette(skills, notes, actions, "");
    expect(r.map((i) => i.group)).toEqual(["Skills", "Actions", "Actions"]);
  });
  it("matches all three groups by name, in a fixed order", () => {
    const r = filterPalette(skills, notes, actions, "fi");
    expect(r.map((i) => i.label)).toEqual(["Fix spelling", "Firewall plan"]);
  });
});

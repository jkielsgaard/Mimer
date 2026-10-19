import { describe, expect, it } from "vitest";
import { tabLabels } from "./tabLabels";

const hint = (m: ReturnType<typeof tabLabels>, p: string): string | null => m.get(p)?.hint ?? null;

describe("tabLabels", () => {
  it("shows the name alone when no other tab has it", () => {
    const m = tabLabels(["Work/Plan.md", "Home.md"]);
    expect(m.get("Work/Plan.md")).toEqual({ title: "Plan", hint: null });
    expect(hint(m, "Home.md")).toBeNull();
  });

  it("adds the folder to tabs with the same name", () => {
    const m = tabLabels(["Acme/Meeting.md", "Bygma/Meeting.md", "Home.md"]);
    expect(hint(m, "Acme/Meeting.md")).toBe("Acme");
    expect(hint(m, "Bygma/Meeting.md")).toBe("Bygma");
    expect(hint(m, "Home.md")).toBeNull();
  });

  it("calls a note in the vault root by its place, and ignores letter case in names", () => {
    const m = tabLabels(["Meeting.md", "Acme/meeting.md"]);
    expect(hint(m, "Meeting.md")).toBe("Vault");
    expect(hint(m, "Acme/meeting.md")).toBe("Acme");
  });

  it("goes one folder higher when the nearest folder is the same too", () => {
    const m = tabLabels(["Acme/2026/Meeting.md", "Bygma/2026/Meeting.md"]);
    expect(hint(m, "Acme/2026/Meeting.md")).toBe("Acme/2026");
    expect(hint(m, "Bygma/2026/Meeting.md")).toBe("Bygma/2026");
  });
});

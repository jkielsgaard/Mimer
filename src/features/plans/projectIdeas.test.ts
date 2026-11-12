import { describe, expect, it } from "vitest";
import { projectIdeas } from "./projectIdeas";

describe("projectIdeas", () => {
  it("makes an idea of each note, with folders as branches, and leaves the plan out", () => {
    const nodes = projectIdeas(
      [
        "Move/Move.md",
        "Move/Plan.md",
        "Move/Epics/Vans.md",
        "Move/Notes/Contract.md",
        "Move/Notes/Old/Draft.md",
        "Move/pic.png",
        "Other/Thing.md",
      ],
      "Move",
      "Move/Move.md",
    );
    expect(nodes.map((n) => n.text)).toEqual(["Epics", "Notes", "Plan [[Move/Plan]]"]);
    expect(nodes[0]?.children.map((n) => n.text)).toEqual(["Vans [[Move/Epics/Vans]]"]);
    expect(nodes[1]?.children.map((n) => n.text)).toEqual([
      "Contract [[Move/Notes/Contract]]",
      "Old",
    ]);
    expect(nodes[1]?.children[1]?.children[0]?.text).toBe("Draft [[Move/Notes/Old/Draft]]");
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { pushRecentSkill, recentSkillIds } from "./recentSkills";

describe("recentSkills", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it("keeps the newest first without repeats and at most six", () => {
    for (const id of ["a", "b", "c", "a", "d", "e", "f", "g"]) pushRecentSkill(id);
    expect(recentSkillIds()).toEqual(["g", "f", "e", "d", "a", "c"]);
  });
  it("ignores broken stored data", () => {
    localStorage.setItem("mimer.recentSkills", "{not json");
    expect(recentSkillIds()).toEqual([]);
    localStorage.setItem("mimer.recentSkills", '{"a":1}');
    expect(recentSkillIds()).toEqual([]);
  });
});

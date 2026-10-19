import { describe, expect, it } from "vitest";
import { factsOf, missingFacts } from "./facts";

describe("facts", () => {
  it("finds numbers, links, addresses and tags", () => {
    expect(
      factsOf("Call 4040 or see [[VPN guide]] and https://x.dk/a, mail it@x.dk #drift at 10:30."),
    ).toEqual(
      expect.arrayContaining([
        "4040",
        "[[VPN guide]]",
        "https://x.dk/a",
        "it@x.dk",
        "#drift",
        "10:30",
      ]),
    );
  });

  it("says which facts a rewrite lost", () => {
    const before = "Restart the client, then call 4040 before 10:30. See [[VPN guide]].";
    expect(
      missingFacts(before, "Restart it and call 4040 before 10:30. See [[VPN guide]]."),
    ).toEqual([]);
    expect(missingFacts(before, "Restart it and call the desk. See the guide.")).toEqual([
      "[[VPN guide]]",
      "4040",
      "10:30",
    ]);
  });
});

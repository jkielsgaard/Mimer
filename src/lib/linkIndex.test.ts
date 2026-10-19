import { describe, expect, it } from "vitest";
import { linkIndexText } from "./linkIndex";

describe("index page without AI", () => {
  it("links every note in the folder, grouped by subfolder", () => {
    const files = ["IT/VPN.md", "IT/Net/Switch.md", "IT/a.png", "Other.md", "IT/Firewall.md"];
    expect(linkIndexText("IT", files, "IT index")).toBe(
      "# IT index\n\n- [[IT/Firewall|Firewall]]\n- [[IT/VPN|VPN]]\n\n## Net\n\n- [[IT/Net/Switch|Switch]]\n",
    );
  });
});

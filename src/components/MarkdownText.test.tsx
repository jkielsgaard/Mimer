import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownText } from "./MarkdownText";

describe("MarkdownText", () => {
  it("shows bold, italic and lists formatted", () => {
    render(<MarkdownText text={"They will **call back**, said _yes_.\n\n- one\n- two"} />);
    expect(screen.getByText("call back").tagName).toBe("STRONG");
    expect(screen.getByText("yes").tagName).toBe("EM");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrivacyNote } from "./PrivacyNote";

describe("PrivacyNote", () => {
  it("tells that the AI is local and the notes stay on this computer", () => {
    render(<PrivacyNote />);
    expect(screen.getByTestId("privacy-note")).toHaveTextContent(
      "Local AI · your notes stay on this computer",
    );
  });
});

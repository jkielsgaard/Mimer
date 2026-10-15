import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrivacyNote } from "./PrivacyNote";

describe("PrivacyNote", () => {
  it("tells that Mimer's AI is local and the notes stay on this computer", () => {
    render(<PrivacyNote kind="local" />);
    expect(screen.getByRole("note")).toHaveTextContent(
      "Local AI · your notes stay on this computer",
    );
  });

  it("tells that Raven is cloud AI without access to notes, and who gets what is typed", () => {
    render(<PrivacyNote kind="cloud" providerName="Claude" />);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("Cloud AI · no access to your notes");
    expect(note).toHaveTextContent("What you type here is sent to Claude.");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusChip } from "./TaskRow";

describe("StatusChip", () => {
  it("shows nothing for a task without a status", () => {
    const { container } = render(<StatusChip status={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows Doing, Waiting and Dropped as a label", () => {
    const { rerender } = render(<StatusChip status="doing" />);
    expect(screen.getByTitle("Status: doing")).toHaveTextContent("doing");
    rerender(<StatusChip status="waiting" />);
    expect(screen.getByTitle("Status: waiting")).toBeInTheDocument();
    rerender(<StatusChip status="dropped" />);
    expect(screen.getByTitle("Status: dropped")).toHaveClass("line-through");
  });
});

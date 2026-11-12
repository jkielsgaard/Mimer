import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const draw = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mermaidDraw", () => ({ draw }));

import { DiagramPreview } from "./DiagramPreview";

describe("DiagramPreview", () => {
  beforeEach(() => {
    draw.mockReset().mockImplementation((box: HTMLElement) => {
      box.textContent = "drawn";
      return Promise.resolve();
    });
  });

  it("draws the code it is given into a picture", async () => {
    render(<DiagramPreview source={"flowchart LR\nA-->B"} />);
    const picture = screen.getByRole("img", { name: "The diagram" });
    await waitFor(() => {
      expect(picture).toHaveTextContent("drawn");
    });
    expect(draw).toHaveBeenCalledWith(picture, "flowchart LR\nA-->B");
  });

  it("draws again when the code changes", async () => {
    const { rerender } = render(<DiagramPreview source="flowchart LR\nA-->B" />);
    rerender(<DiagramPreview source="flowchart LR\nB-->C" />);
    await waitFor(() => {
      expect(draw).toHaveBeenCalledTimes(2);
    });
  });
});

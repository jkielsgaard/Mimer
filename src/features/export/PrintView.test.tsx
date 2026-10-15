import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { printWindow: vi.fn().mockResolvedValue(undefined) },
  toApiError: (e: unknown) => ({ message: String(e) }),
}));

import { PrintView } from "./PrintView";
import { usePrintStore } from "@/stores/printStore";

describe("PrintView", () => {
  beforeEach(() => {
    usePrintStore.setState({ html: null, title: "" });
  });

  it("renders nothing when no preview is open", () => {
    const { container } = render(<PrintView />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the document body and strips scripts", () => {
    usePrintStore.setState({
      title: "Plan",
      html: "<!doctype html><html><head><style>main{color:red}</style></head><body><main><h1>Plan</h1><script>alert(1)</script></main></body></html>",
    });
    render(<PrintView />);
    expect(screen.getByRole("heading", { name: "Plan" })).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByRole("button", { name: "Print / Save as PDF" })).toBeInTheDocument();
  });

  it("Escape closes the preview", () => {
    usePrintStore.setState({ title: "x", html: "<html><body><p>x</p></body></html>" });
    render(<PrintView />);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(usePrintStore.getState().html).toBeNull();
  });
});

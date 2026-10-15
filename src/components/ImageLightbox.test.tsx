import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ openFile: vi.fn() }));
vi.mock("@/lib/actions", () => actions);

import { useUiStore } from "@/stores/uiStore";
import { ImageLightbox } from "./ImageLightbox";

describe("ImageLightbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ imagePreview: null });
  });

  it("shows nothing until a picture is chosen, then shows it large", () => {
    render(<ImageLightbox />);
    expect(screen.queryByRole("img")).toBeNull();
    useUiStore.getState().openImagePreview({ src: "asset://a.png", name: "a.png", path: "a.png" });
    return screen.findByRole("img", { name: "a.png" });
  });

  it("can open the picture in another app when its path is known, and closes with Close", async () => {
    useUiStore.setState({ imagePreview: { src: "x", name: "a.png", path: "attachments/a.png" } });
    render(<ImageLightbox />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Open in another app/ }));
    expect(actions.openFile).toHaveBeenCalledWith("attachments/a.png");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(useUiStore.getState().imagePreview).toBeNull();
  });

  it("has no external-open button for a picture whose path is unknown", () => {
    useUiStore.setState({ imagePreview: { src: "x", name: "a.png", path: null } });
    render(<ImageLightbox />);
    expect(screen.queryByRole("button", { name: /Open in another app/ })).toBeNull();
  });
});

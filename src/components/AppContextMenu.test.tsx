import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ openDevtools: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { AppContextMenu } from "./AppContextMenu";

describe("AppContextMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replaces the web view menu with Inspect element, which opens the inspector", () => {
    render(
      <div>
        <p>text</p>
        <AppContextMenu />
      </div>,
    );
    const allowed = fireEvent.contextMenu(screen.getByText("text"));
    expect(allowed).toBe(false);
    fireEvent.click(screen.getByRole("menuitem", { name: "Inspect element" }));
    expect(api.openDevtools).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("leaves text fields and menus that are already handled alone", () => {
    render(
      <div>
        <input aria-label="field" />
        <AppContextMenu />
      </div>,
    );
    expect(fireEvent.contextMenu(screen.getByLabelText("field"))).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

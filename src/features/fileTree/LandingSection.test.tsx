import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TreeNode } from "@/bindings/TreeNode";

vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));
const openFile = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions", async (orig) => ({
  ...(await orig<typeof import("@/lib/actions")>()),
  openFile,
}));

import { LandingSection } from "./LandingSection";
import { isNewNote, useSeen } from "@/stores/seenStore";
import { useVaultStore } from "@/stores/vaultStore";

const now = Date.now();
const file = (path: string, modified: number): TreeNode => ({
  name: path.split("/").pop() ?? path,
  path,
  isDir: false,
  children: [],
  modified,
});
const dir = (path: string, children: TreeNode[]): TreeNode => ({
  name: path,
  path,
  isDir: true,
  children,
  modified: 0,
});

describe("LandingSection", () => {
  beforeEach(() => {
    openFile.mockReset();
    useSeen.setState({ paths: ["Meetings/Old.md"] });
    useVaultStore.setState({
      tree: [
        dir("Meetings", [
          file("Meetings/Acme.md", now - 1000),
          file("Meetings/Old.md", now - 1000),
        ]),
        dir("Quick notes", [file("Quick notes/Ancient.md", now - 30 * 24 * 3600 * 1000)]),
        dir("Other", [file("Other/x.md", now)]),
      ],
    });
  });

  it("lists new notes first with a Move button, and only the landing folders below", async () => {
    const onAction = vi.fn();
    render(<LandingSection folders={["Meetings", "Quick notes", "Tasks"]} onAction={onAction} />);
    const fresh = screen.getByRole("list", { name: "New notes" });
    expect(fresh).toHaveTextContent("Acme");
    expect(fresh).not.toHaveTextContent("Old");
    expect(fresh).not.toHaveTextContent("Ancient");
    expect(screen.queryByText("Other")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Move Acme to…" }));
    expect(onAction).toHaveBeenCalledWith({ kind: "moveMany", paths: ["Meetings/Acme.md"] });
  });

  it("a note is new for a week, until it is opened", () => {
    expect(isNewNote("a.md", now - 1000, [], now)).toBe(true);
    expect(isNewNote("a.md", now - 1000, ["a.md"], now)).toBe(false);
    expect(isNewNote("a.md", now - 8 * 24 * 3600 * 1000, [], now)).toBe(false);
    expect(isNewNote("a.md", 0, [], now)).toBe(false);
  });
});

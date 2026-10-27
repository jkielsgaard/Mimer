import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LinkResolver } from "@/lib/links";
import { makeTask } from "@/test/taskFixtures";

const apiMock = vi.hoisted(() => ({
  taskSetLink: vi.fn(),
  createNoteFromTemplate: vi.fn(),
  readNote: vi.fn(),
  writeNote: vi.fn(),
  listTemplates: vi.fn(),
  getTree: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));

import { LinkedNote, TaskNoteChip } from "./TaskNote";
import { useTaskStore } from "@/stores/taskStore";
import { useVaultStore } from "@/stores/vaultStore";

const files = ["Møder/Weekly with Mette.md", "Møder/Offer to Acme.md"];

describe("a note for a task", () => {
  beforeEach(() => {
    for (const f of Object.values(apiMock)) f.mockReset();
    apiMock.listTemplates.mockResolvedValue([]);
    apiMock.getTree.mockResolvedValue([]);
    useTaskStore.setState({ tasks: [], selected: null });
    useVaultStore.setState({
      files,
      tree: [],
      resolver: new LinkResolver(files),
      activePath: null,
      vault: null,
    });
  });

  it("shows a chip with the note's name that opens the note", async () => {
    const openNote = vi.fn().mockResolvedValue(undefined);
    useVaultStore.setState({ openNote });
    render(<TaskNoteChip task={makeTask({ link: "Offer to Acme" })} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Open the note Offer to Acme" }));
    expect(openNote).toHaveBeenCalledWith("Møder/Offer to Acme.md");
  });

  it("shows nothing for a task without a link, and a dimmed chip when the note is gone", () => {
    const { rerender } = render(<TaskNoteChip task={makeTask()} />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<TaskNoteChip task={makeTask({ link: "Deleted note" })} />);
    expect(screen.getByRole("button", { name: "Note missing: Deleted note" })).toBeInTheDocument();
  });

  it("links a note that exists, and unlinks it again", async () => {
    const t = makeTask({ link: null });
    apiMock.taskSetLink.mockResolvedValue([{ ...t, link: "Offer to Acme" }]);
    const user = userEvent.setup();
    const { rerender } = render(<LinkedNote task={t} />);
    await user.click(screen.getByRole("button", { name: /Link a note/ }));
    await user.click(await screen.findByText("Offer to Acme"));
    expect(apiMock.taskSetLink).toHaveBeenCalledWith(t.path, t.line, t.key, "Offer to Acme");
    const linked = makeTask({ link: "Offer to Acme" });
    apiMock.taskSetLink.mockResolvedValue([linked]);
    rerender(<LinkedNote task={linked} />);
    await user.click(screen.getByRole("button", { name: "Unlink the note" }));
    expect(apiMock.taskSetLink).toHaveBeenLastCalledWith(t.path, t.line, t.key, null);
  });

  it("makes a note for the task, with a line that points back, and links it", async () => {
    const t = makeTask({ path: "Møder/Weekly with Mette.md", title: "Send the offer" });
    apiMock.createNoteFromTemplate.mockResolvedValue("Møder/Send the offer.md");
    apiMock.readNote.mockResolvedValue({
      path: "Møder/Send the offer.md",
      content: "# Send the offer\n",
      mtime: 0,
    });
    apiMock.writeNote.mockResolvedValue(undefined);
    apiMock.taskSetLink.mockResolvedValue([t]);
    const user = userEvent.setup();
    render(<LinkedNote task={t} />);
    await user.click(screen.getByRole("button", { name: /Make a note for this task/ }));
    expect(await screen.findByLabelText("Name")).toHaveValue("Send the offer");
    await user.click(screen.getByRole("button", { name: "Make the note" }));
    await waitFor(() => {
      expect(apiMock.createNoteFromTemplate).toHaveBeenCalledWith("Møder", "Send the offer", null);
    });
    expect(apiMock.writeNote).toHaveBeenCalledWith(
      "Møder/Send the offer.md",
      "# Send the offer\n\nTask in [[Weekly with Mette]]\n",
    );
    await waitFor(() => {
      expect(apiMock.taskSetLink).toHaveBeenCalledWith(
        t.path,
        t.line,
        t.key,
        "Møder/Send the offer",
      );
    });
  });
});

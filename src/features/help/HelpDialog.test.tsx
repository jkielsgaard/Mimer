import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { HelpDialog } from "./HelpDialog";
import { HELP_TOPICS } from "./helpTopics";
import { useUiStore } from "@/stores/uiStore";

describe("HelpDialog", () => {
  beforeEach(() => {
    useUiStore.setState({ helpOpen: false, helpTopic: "start" });
  });

  it("is closed until it is opened", () => {
    render(<HelpDialog />);
    expect(screen.queryByText("Getting started")).toBeNull();
  });

  it("lists every topic and shows the first one", () => {
    useUiStore.getState().openHelp();
    render(<HelpDialog />);
    const nav = screen.getByRole("navigation", { name: "Topics" });
    for (const t of HELP_TOPICS) expect(nav).toHaveTextContent(t.title);
    expect(screen.getByRole("article", { name: "Getting started" })).toBeInTheDocument();
  });

  it("opens at the topic that was asked for", () => {
    useUiStore.getState().openHelp("images");
    render(<HelpDialog />);
    expect(screen.getByRole("article", { name: "Images" })).toHaveTextContent("Insert image");
  });

  it("choosing a topic shows its text, including tables", async () => {
    useUiStore.getState().openHelp();
    render(<HelpDialog />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Keyboard shortcuts/ }));
    const article = screen.getByRole("article", { name: "Keyboard shortcuts" });
    expect(article.querySelector("table")).not.toBeNull();
    expect(article).toHaveTextContent("Ctrl+Shift+K");
  });

  it("the search narrows the list and says when nothing matches", async () => {
    useUiStore.getState().openHelp();
    render(<HelpDialog />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Search the guide"), "paperclip");
    const nav = screen.getByRole("navigation", { name: "Topics" });
    expect(nav).toHaveTextContent("Mimer, the assistant");
    expect(nav).not.toHaveTextContent("Version history");
    await user.clear(screen.getByLabelText("Search the guide"));
    await user.type(screen.getByLabelText("Search the guide"), "zzzzzz");
    expect(screen.getByText("Nothing in the guide matches.")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FoundryModel } from "@/bindings/FoundryModel";

import { ModelPicker } from "./ModelPicker";
import { NO_FILTER } from "./foundryModels";

const m = (alias: string, tools = true): FoundryModel =>
  ({
    alias,
    name: alias,
    publisher: "Acme",
    task: "chat-completion",
    sizeMb: 1000,
    device: "GPU",
    contextTokens: 32768,
    license: "MIT",
    tools,
  }) as unknown as FoundryModel;

describe("ModelPicker", () => {
  const models = [m("alpha"), m("beta", false)];
  const base = {
    models,
    total: 5,
    chosen: "alpha",
    selected: models[0],
    installed: new Set<string>(["alpha"]),
    filter: NO_FILTER,
    onFilter: vi.fn(),
    onPick: vi.fn(),
  };

  it("shows only the chosen model until it is pressed, and then a list with a count", async () => {
    render(<ModelPicker {...base} />);
    const user = userEvent.setup();
    const box = screen.getByRole("button", { name: "Model" });
    expect(box).toHaveTextContent("alpha");
    expect(box).toHaveTextContent("downloaded");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.click(box);
    expect(screen.getByRole("listbox", { name: "Foundry Local models" })).toBeInTheDocument();
    expect(screen.getByText("2 of 5 models")).toBeInTheDocument();
    expect(screen.getByLabelText("Find a model")).toBeInTheDocument();
  });

  it("picks a model, closes, and closes with Esc and a click elsewhere", async () => {
    const onPick = vi.fn();
    render(<ModelPicker {...base} onPick={onPick} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Model" }));
    await user.click(screen.getByRole("option", { name: /beta/ }));
    expect(onPick).toHaveBeenCalledWith("beta");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Model" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Model" }));
    await user.click(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("says so when no model fits, and shows a chosen model the filter hides", async () => {
    render(<ModelPicker {...base} models={[]} />);
    expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("alpha");
    await userEvent.setup().click(screen.getByRole("button", { name: "Model" }));
    expect(screen.getByTestId("foundry-no-match")).toBeInTheDocument();
  });
});

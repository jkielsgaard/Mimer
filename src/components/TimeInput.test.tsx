import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUiStore } from "@/stores/uiStore";
import { TimeInput } from "./TimeInput";

function Harness({ start = "", onValid }: { start?: string; onValid?: (ok: boolean) => void }) {
  const [time, setTime] = useState(start);
  return (
    <>
      <TimeInput id="t" value={time} onChange={setTime} onValid={onValid} />
      <output data-testid="time">{time}</output>
      <button type="button">elsewhere</button>
    </>
  );
}

describe("TimeInput", () => {
  beforeEach(() => {
    useUiStore.setState({ timeFormat: "24" });
  });

  it("opens a list of every quarter of an hour from the arrow or a click in the box", async () => {
    render(<Harness start="10:00" />);
    const user = userEvent.setup();
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Choose a time" }));
    const rows = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(rows).toHaveLength(96);
    expect(rows[0]).toHaveTextContent("00:00");
    expect(rows[1]).toHaveTextContent("00:15");
    expect(rows.at(-1)).toHaveTextContent("23:45");
    expect(screen.getByRole("option", { name: /10:00/ })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Choose a time" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("a click on a row picks the time and closes the list", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "14:30" }));
    expect(screen.getByTestId("time")).toHaveTextContent("14:30");
    expect(screen.getByRole("combobox")).toHaveValue("14:30");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("can still be typed in: a time that is not on the list is kept as it is written", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("combobox"), "10:20");
    expect(screen.getByTestId("time")).toHaveTextContent("10:20");
    // The list is open and shows the nearest quarter, but nothing is chosen for the person.
    expect(screen.getByRole("option", { name: "10:15" })).toHaveAttribute("aria-selected", "false");
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.getByRole("combobox")).toHaveValue("10:20");
    expect(screen.getByTestId("time")).toHaveTextContent("10:20");
  });

  it("reads 1430 and 2:30 pm as before, and marks a time that cannot be read", async () => {
    const valid = vi.fn();
    render(<Harness onValid={valid} />);
    const user = userEvent.setup();
    const box = screen.getByRole("combobox");
    await user.type(box, "1430");
    expect(screen.getByTestId("time")).toHaveTextContent("14:30");
    await user.clear(box);
    await user.type(box, "2:30 pm");
    expect(screen.getByTestId("time")).toHaveTextContent("14:30");
    await user.clear(box);
    await user.type(box, "25:00");
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(valid).toHaveBeenLastCalledWith(false);
    await user.clear(box);
    expect(screen.getByTestId("time")).toHaveTextContent("");
    expect(valid).toHaveBeenLastCalledWith(true);
  });

  it("the arrow keys move through the list and Enter picks, Esc closes only the list", async () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <Harness start="10:00" />
      </div>,
    );
    const user = userEvent.setup();
    const box = screen.getByRole("combobox");
    await user.click(box);
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(box).toHaveAttribute("aria-activedescendant", "t-10:30");
    await user.keyboard("{ArrowUp}");
    expect(box).toHaveAttribute("aria-activedescendant", "t-10:15");
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("time")).toHaveTextContent("10:15");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    outer.mockClear();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    // Esc did not go on to close a window around the box.
    expect(outer).not.toHaveBeenCalled();
  });

  it("Enter without a row chosen is left to the form, and a click outside closes the list", async () => {
    const submit = vi.fn((e: React.SyntheticEvent) => {
      e.preventDefault();
    });
    render(
      <form onSubmit={submit}>
        <Harness start="10:00" />
      </form>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{Enter}");
    expect(submit).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("writes the list in the 12-hour way when that is chosen", async () => {
    useUiStore.setState({ timeFormat: "12" });
    render(<Harness start="14:30" />);
    const user = userEvent.setup();
    expect(screen.getByRole("combobox")).toHaveValue("2:30 PM");
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "9:15 AM" }));
    expect(screen.getByTestId("time")).toHaveTextContent("09:15");
    expect(screen.getByRole("combobox")).toHaveValue("9:15 AM");
  });
});

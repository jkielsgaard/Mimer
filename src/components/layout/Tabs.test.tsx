import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tabs } from "./Tabs";

const tabs = [
  { id: "a", label: "Mimer" },
  { id: "b", label: "Backlinks" },
];

describe("Tabs", () => {
  it("shows a dot on a busy tab that is not selected", () => {
    render(<Tabs tabs={tabs} value="b" onChange={() => undefined} label="Panel" busy="a" />);
    expect(screen.getByRole("tab", { name: /Mimer/ })).toContainElement(
      screen.getByLabelText("Working"),
    );
  });

  it("shows no dot on the selected tab or when nothing is busy", () => {
    const { rerender } = render(
      <Tabs tabs={tabs} value="a" onChange={() => undefined} label="Panel" busy="a" />,
    );
    expect(screen.queryByLabelText("Working")).toBeNull();
    rerender(<Tabs tabs={tabs} value="b" onChange={() => undefined} label="Panel" />);
    expect(screen.queryByLabelText("Working")).toBeNull();
  });

  it("can show a dot on several busy tabs", () => {
    const three = [...tabs, { id: "c", label: "Raven" }];
    render(
      <Tabs tabs={three} value="b" onChange={() => undefined} label="Panel" busy={["a", "c"]} />,
    );
    expect(screen.getAllByLabelText("Working")).toHaveLength(2);
  });
});

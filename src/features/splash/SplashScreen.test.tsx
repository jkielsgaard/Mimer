import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SplashScreen } from "./SplashScreen";

describe("SplashScreen", () => {
  it("shows the picture and the version", () => {
    render(<SplashScreen />);
    expect(screen.getByRole("img", { name: "Mimer is starting" })).toBeInTheDocument();
    expect(screen.getByText(/^Version /)).toBeInTheDocument();
  });
});

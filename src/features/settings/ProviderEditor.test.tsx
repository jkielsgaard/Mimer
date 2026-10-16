import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderConfig } from "@/bindings/ProviderConfig";

const api = vi.hoisted(() => ({
  hasApiKey: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { newProvider, ProviderEditor } from "./ProviderEditor";

function Harness({ start }: { start: ProviderConfig }) {
  const [p, setP] = useState(start);
  return (
    <ProviderEditor
      provider={p}
      onChange={setP}
      onRemove={() => undefined}
      persist={() => Promise.resolve(true)}
    />
  );
}

describe("ProviderEditor help", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.hasApiKey.mockResolvedValue(false);
  });

  it("explains what to do for each kind of provider when it is chosen", async () => {
    render(<Harness start={newProvider("lmstudio")} />);
    const help = (): string => screen.getByTestId("provider-help").textContent;
    expect(help()).toContain("lmstudio.ai");
    expect(help()).toContain("Developer tab");

    const user = userEvent.setup();
    const kind = screen.getByLabelText("Kind");
    await user.selectOptions(kind, "openai_compatible");
    expect(help()).toContain("base URL");
    expect(help()).toContain("Ollama");

    await user.selectOptions(kind, "anthropic");
    expect(help()).toContain("console.anthropic.com");
    expect(help()).toContain("Raven");
  });

  it("Foundry Local is not made here: it is set up under Built-in AI", () => {
    const options = [...document.querySelectorAll("option")];
    expect(options.some((o) => o.value === "foundry_local")).toBe(false);
    render(<Harness start={newProvider("foundry_local")} />);
    expect(screen.getByTestId("provider-help")).toHaveTextContent("Settings → Built-in AI");
    expect(screen.queryByRole("button", { name: /Detect/ })).toBeNull();
  });
});

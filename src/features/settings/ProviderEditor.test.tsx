import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderConfig } from "@/bindings/ProviderConfig";

const api = vi.hoisted(() => ({
  hasApiKey: vi.fn(),
  detectFoundryLocal: vi.fn(),
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

    await user.selectOptions(kind, "foundry_local");
    expect(help()).toContain("winget install Microsoft.FoundryLocal");
    expect(help()).toContain("NPU");
    expect(help()).toContain("not available on Linux");
  });

  it("makes Foundry Local a local provider with a Detect button that fills in the address", async () => {
    api.detectFoundryLocal.mockResolvedValue({
      installed: true,
      running: true,
      baseUrl: "http://127.0.0.1:61234/v1",
      message: "Foundry Local is running. Address: http://127.0.0.1:61234/v1",
    });
    const p = newProvider("foundry_local");
    expect(p.location).toBe("local");
    expect(p.kind).toBe("foundry_local");
    render(<Harness start={p} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Detect Foundry Local" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Base URL")).toHaveValue("http://127.0.0.1:61234/v1");
    });
    expect(screen.getByRole("status")).toHaveTextContent("Foundry Local is running");
  });

  it("shows what to do when Foundry Local is not installed and keeps the address", async () => {
    api.detectFoundryLocal.mockResolvedValue({
      installed: false,
      running: false,
      baseUrl: null,
      message: "Foundry Local was not found. Install it with winget.",
    });
    const p = newProvider("foundry_local");
    render(<Harness start={p} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Detect Foundry Local" }));
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("not found");
    });
    expect(screen.getByLabelText("Base URL")).toHaveValue(p.baseUrl);
  });

  it("only shows the Detect button for Foundry Local", () => {
    render(<Harness start={newProvider("lmstudio")} />);
    expect(screen.queryByRole("button", { name: "Detect Foundry Local" })).toBeNull();
  });
});

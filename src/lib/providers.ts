import type { ProviderConfig } from "@/bindings/ProviderConfig";
import type { Settings } from "@/bindings/Settings";

/** True when the URL points at this machine. */
export function isLoopbackUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return false;
  }
}

/**
 * Where a provider really is, as the backend decides it: Anthropic is always cloud, Phi Silica
 * always local, and the others are local only at a loopback address. Notes are only sent to local providers.
 */
export function effectiveLocation(p: ProviderConfig): "local" | "cloud" {
  if (p.kind === "anthropic") return "cloud";
  // Windows runs Phi Silica on this PC; it has no address.
  if (p.kind === "phi_silica") return "local";
  if (!isLoopbackUrl(p.baseUrl)) return "cloud";
  return p.kind === "openai_compatible" ? p.location : "local";
}

/**
 * The providers the user can choose from. Foundry Local is always in the settings, but is only
 * offered once a model has been downloaded for it.
 */
export function usableProviders(settings: Settings): ProviderConfig[] {
  return settings.ai.providers.filter(
    (p) => p.kind !== "foundry_local" || settings.ai.foundry.model !== "",
  );
}

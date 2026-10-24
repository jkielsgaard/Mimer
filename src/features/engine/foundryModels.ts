import type { FoundryModel } from "@/bindings/FoundryModel";

/** Microsoft's own list of every model Foundry Local can run. */
export const FOUNDRY_MODELS_URL = "https://www.foundrylocal.ai/models";

export type GoodFor = "writing" | "reasoning" | "code";

/** What a model family is good for, by its alias. The first match wins. */
const FAMILIES: { match: RegExp; kind: GoodFor; text: string }[] = [
  {
    match: /reason|deepseek-r1|qwq/,
    kind: "reasoning",
    text: "Reasons step by step before it answers. Slower; good for thinking a problem through.",
  },
  {
    match: /coder|code/,
    kind: "code",
    text: "Made for code. Use it for notes with a lot of code.",
  },
  {
    match: /^phi/,
    kind: "writing",
    text: "Microsoft's small model. Quick, good at fixing and rewriting text and following instructions.",
  },
  {
    match: /^qwen/,
    kind: "writing",
    text: "General model, good with longer notes and many languages.",
  },
  {
    match: /^mistral/,
    kind: "writing",
    text: "General text model. Good at summaries and rewriting.",
  },
  {
    match: /^gpt-oss/,
    kind: "writing",
    text: "Large and strong general model. Needs a powerful graphics card and much memory.",
  },
  {
    match: /^(llama|gemma)/,
    kind: "writing",
    text: "General text model for writing and summaries.",
  },
];

/** What the model is good for, in one line. Unknown families are general text models. */
export function goodFor(m: FoundryModel): { kind: GoodFor; text: string } {
  const alias = m.alias.toLowerCase();
  const family = FAMILIES.find((f) => f.match.test(alias));
  return family ?? { kind: "writing", text: "General text model." };
}

export type Size = "any" | "small" | "medium" | "large";
export type Device = "any" | "NPU" | "GPU" | "CPU";
export type Sort = "recommended" | "smallest" | "name";

export interface ModelFilter {
  text: string;
  good: "all" | GoodFor;
  tools: boolean;
  downloaded: boolean;
  device: Device;
  size: Size;
  sort: Sort;
}

export const NO_FILTER: ModelFilter = {
  text: "",
  good: "all",
  tools: false,
  downloaded: false,
  device: "any",
  size: "any",
  sort: "recommended",
};

/** Small is under 2 GB, medium 2–6 GB, large above. An unknown size is in none of them. */
export function sizeOf(sizeMb: number): Exclude<Size, "any"> | null {
  if (sizeMb <= 0) return null;
  if (sizeMb < 2000) return "small";
  if (sizeMb <= 6000) return "medium";
  return "large";
}

/** `about 96k words`: how much text a model reads at once (a token is about ¾ of a word). */
export function readsLabel(tokens: number | null): string | null {
  if (tokens === null || tokens <= 0) return null;
  const words = Math.round((tokens * 0.75) / 1000);
  return words >= 1 ? `reads about ${String(words)}k words` : "reads a short text";
}

const DEVICE_RANK: Record<string, number> = { NPU: 0, GPU: 1, CPU: 2 };

/**
 * The models that match the filter, in the chosen order. "Recommended": models with tools first,
 * then those on the neural processor, the graphics card and the processor, then the smallest.
 */
export function filterModels(
  list: FoundryModel[],
  f: ModelFilter,
  downloaded: ReadonlySet<string>,
): FoundryModel[] {
  const words = f.text.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = list.filter((m) => {
    const hay = `${m.name} ${m.alias} ${m.publisher ?? ""}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) return false;
    if (f.good !== "all" && goodFor(m).kind !== f.good) return false;
    if (f.tools && !m.tools) return false;
    if (f.downloaded && !downloaded.has(m.alias)) return false;
    if (f.device !== "any" && m.device.toUpperCase() !== f.device) return false;
    if (f.size !== "any" && sizeOf(m.sizeMb) !== f.size) return false;
    return true;
  });
  const size = (m: FoundryModel) => (m.sizeMb > 0 ? m.sizeMb : Number.MAX_SAFE_INTEGER);
  const byName = (a: FoundryModel, b: FoundryModel) => a.name.localeCompare(b.name);
  if (f.sort === "name") return shown.sort(byName);
  if (f.sort === "smallest") return shown.sort((a, b) => size(a) - size(b) || byName(a, b));
  return shown.sort(
    (a, b) =>
      Number(b.tools) - Number(a.tools) ||
      (DEVICE_RANK[a.device.toUpperCase()] ?? 3) - (DEVICE_RANK[b.device.toUpperCase()] ?? 3) ||
      size(a) - size(b) ||
      byName(a, b),
  );
}

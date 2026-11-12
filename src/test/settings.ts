import type { Settings } from "@/bindings/Settings";
import { DEFAULT_BUILTIN } from "./builtinDefaults";

/** An object whose keys can be given in part, also inside the objects below them. */
export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** The settings a freshly installed Mimer has, with a local LM Studio as the chosen AI. */
function defaults(): Settings {
  return {
    schemaVersion: 1,
    recentVaults: [],
    lastVault: null,
    theme: "system",
    editor: {
      fontSize: 15,
      lineWidth: 760,
      spellcheck: true,
      recentNotes: 4,
      aiSpelling: false,
      traceWork: false,
      ownWords: [],
      lineSpacing: "normal",
      letterSpacing: "normal",
      textFont: "system",
      followLine: false,
    },
    git: { authorName: "M", authorEmail: "m@l", idleCommitMinutes: 5 },
    ai: {
      defaultProviderId: "lm",
      checkAnswers: false,
      cloudConsent: null,
      builtin: { ...DEFAULT_BUILTIN },
      foundry: { model: "", tools: true },
      answerLanguage: "",
      globalInstructions: "",
      embeddings: { enabled: false, providerId: "lm", model: "" },
      providers: [],
    },
    backups: {},
    helper: {
      enabled: false,
      keepRunning: true,
      quickNoteKey: "Ctrl+Alt+N",
      parkKey: "Ctrl+Alt+P",
    },
  };
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function merge(
  base: Record<string, unknown>,
  over: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const was = out[k];
    out[k] = isPlain(was) && isPlain(v) ? merge(was, v) : v;
  }
  return out;
}

/**
 * A complete, valid `Settings` for a test. Give only what the test cares about: objects are merged
 * (so `{ ai: { cloudConsent: "x" } }` keeps the rest of `ai`), and a list (`providers`,
 * `recentVaults`) replaces the default list.
 */
export function makeSettings(overrides: DeepPartial<Settings> = {}): Settings {
  return merge(defaults(), overrides) as unknown as Settings;
}

import type { ProviderKind } from "@/bindings/ProviderKind";

/** What a user has to do to get one kind of AI provider working, shown when it is chosen. */
export interface ProviderHelp {
  /** One line: what this provider is. */
  summary: string;
  /** Numbered steps, in order. */
  steps: string[];
  /** Things to know afterwards (limits, where notes go, what to do when it fails). */
  notes: string[];
}

export const PROVIDER_HELP: Record<ProviderKind, ProviderHelp> = {
  lmstudio: {
    summary: "LM Studio is a free program that runs AI models on this computer.",
    steps: [
      "Install LM Studio from lmstudio.ai and download a model. Choose one that supports tools (for example a Qwen or Gemma instruct model), so Mimer can search and propose changes.",
      "In LM Studio open the Developer tab and start the server. It listens on http://localhost:1234/v1, which is already filled in below.",
      "Press Load models, choose the model, and press Test connection.",
      "Make it Mimer's provider under Settings → AI.",
    ],
    notes: [
      "LM Studio must be running while you use it.",
      "It runs on this computer, so your notes never leave it.",
    ],
  },
  openai_compatible: {
    summary:
      "Any server that speaks the OpenAI interface: a program on this computer (Ollama, llama.cpp, vLLM) or a cloud service (OpenAI, Azure OpenAI and others).",
    steps: [
      "Enter the base URL of the server, usually ending in /v1. For Ollama on this computer it is http://localhost:11434/v1.",
      "If the service needs an API key, paste it below and press Save key. It is kept in the system keychain, never in a file.",
      "Press Load models, choose the model, and press Test connection.",
      "Choose it as Mimer's provider under Settings → AI. Only a program on this computer can be used.",
    ],
    notes: [
      "Only an address on this computer (localhost, 127.0.0.1 or ::1) can be local. Anything else is cloud.",
      "A cloud service cannot be used: your notes are only ever sent to an AI on this computer.",
    ],
  },
  anthropic: {
    summary:
      "Claude, a cloud AI from Anthropic, from an older version of Mimer. Mimer only uses an AI on this computer, so it is not used.",
    steps: ["Remove it, or leave it: nothing is ever sent to it."],
    notes: ["Mimer, which reads your notes, never uses a cloud provider."],
  },
  foundry_local: {
    summary: "Mimer's Foundry Local, set up under Settings → Built-in AI.",
    steps: ["Open Settings → Built-in AI, choose Foundry Local and press Download."],
    notes: [],
  },
  builtin: {
    summary: "Mimer's own AI, set up under Settings → Built-in AI.",
    steps: ["Open Settings → Built-in AI and press Download."],
    notes: [],
  },
};

import { api } from "@/lib/api";
import { localAiProblem } from "@/lib/skills";

export interface AiAnswer {
  /** The whole answer once it is done. */
  promise: Promise<string>;
  cancel: () => void;
}

/**
 * One question to the local AI: an instruction and some text, answered as text. It uses the same
 * path as the inline commands, so the usual rules hold: only a local AI is used, and nothing is
 * written. Rejects with a message that says what to start when no local AI is running.
 */
export function askAi(instruction: string, text: string, notePath: string | null): AiAnswer {
  let task: string | null = null;
  let cancelled = false;
  const promise = (async (): Promise<string> => {
    const problem = await localAiProblem();
    if (problem !== null) throw new Error(problem);
    return new Promise<string>((resolve, reject) => {
      let out = "";
      api
        .aiInline(
          {
            command: "custom",
            instruction,
            text,
            notePath,
            providerId: null,
          },
          (e) => {
            if (e.type === "textDelta") out += e.text;
            else if (e.type === "error") reject(new Error(e.error.message));
            else if (e.type === "done") resolve(out.trim());
          },
        )
        .then((id) => {
          task = id;
          if (cancelled) void api.aiCancel(id).catch(() => undefined);
        })
        .catch((e: unknown) => {
          reject(e instanceof Error ? e : new Error("The AI could not be reached"));
        });
    });
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (task !== null) void api.aiCancel(task).catch(() => undefined);
    },
  };
}

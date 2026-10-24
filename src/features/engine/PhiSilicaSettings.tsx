import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { PhiCheck } from "@/bindings/PhiCheck";
import type { PhiStatus } from "@/bindings/PhiStatus";
import type { PhiTest } from "@/bindings/PhiTest";
import type { ProviderConfig } from "@/bindings/ProviderConfig";
import type { Settings } from "@/bindings/Settings";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { onPhiProgress } from "@/lib/events";
import { reportError } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

/** The id of the one Phi Silica provider (as in `phisilica::PHI_ID`). */
export const PHI_ID = "phi-silica";

/** The provider as the backend keeps it (`settings::phi_silica_provider`). */
export const PHI_PROVIDER: ProviderConfig = {
  id: PHI_ID,
  kind: "phi_silica",
  name: "Built-in AI · Phi Silica",
  baseUrl: "",
  model: "Phi Silica",
  location: "local",
  supportsTools: false,
  contextTokens: 4000,
};

/** What Windows says about Phi Silica, read once. `null` while it is asked or when it fails. */
export function usePhiStatus(): [PhiStatus | null, (s: PhiStatus) => void] {
  const [status, setStatus] = useState<PhiStatus | null>(null);
  useEffect(() => {
    let live = true;
    // In tests and outside Tauri the call may not exist; then Phi Silica is simply not shown.
    void Promise.resolve()
      .then(() => api.phiStatus())
      .then((s) => {
        if (live) setStatus(s);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return [status, setStatus];
}

/** The lines of "Phi Silica on this PC", for the bug report. */
export function phiReport(status: PhiStatus, test: PhiTest | null): string {
  const line = (name: string, c: PhiCheck) =>
    `${name}: ${c.state} · ${c.text}${c.code ? ` (${c.code})` : ""}`;
  const lines = [
    line("Access from Microsoft", status.access),
    line("This PC", status.device),
    line("The model", status.model),
  ];
  if (test) {
    lines.push(
      test.ok
        ? `Test reply: ok in ${String(test.millis)} ms`
        : `Test reply: failed · ${test.message}`,
    );
  }
  return lines.join("\n");
}

function Mark({ state }: { state: PhiCheck["state"] }) {
  const base =
    "flex size-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold";
  if (state === "ok")
    return (
      <span className={cn(base, "bg-success text-white")} aria-label="OK">
        <Check className="size-3" aria-hidden />
      </span>
    );
  if (state === "fail")
    return (
      <span className={cn(base, "bg-destructive text-white")} aria-label="Problem">
        <X className="size-3" aria-hidden />
      </span>
    );
  if (state === "warn")
    return (
      <span className={cn(base, "border-2 border-warning text-warning")} aria-label="Needs you">
        !
      </span>
    );
  return (
    <span className={cn(base, "border-2 border-muted-foreground/40")} aria-label="Not checked" />
  );
}

function Line({ name, check }: { name: string; check: PhiCheck }) {
  return (
    <li className="flex items-baseline gap-2.5 text-sm">
      <Mark state={check.state} />
      <span className="w-44 shrink-0 font-semibold">{name}</span>
      <span className="min-w-0 text-foreground/80">
        {check.text}
        {check.code !== null && (
          <span className="font-mono text-xs text-muted-foreground"> · {check.code}</span>
        )}
      </span>
    </li>
  );
}

/**
 * Settings → Built-in AI → Windows AI · Phi Silica: what Windows says on this PC, a test, and the
 * button that makes Mimer use it. Nothing is chosen by itself.
 */
export function PhiSilicaSettings({
  draft,
  onChange,
  status,
  onStatus,
}: {
  draft: Settings;
  onChange: (next: Settings) => void;
  status: PhiStatus;
  onStatus: (s: PhiStatus) => void;
}) {
  const [busy, setBusy] = useState<"check" | "get" | "test" | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [test, setTest] = useState<PhiTest | null>(null);
  const [copied, setCopied] = useState(false);
  const inUse = draft.ai.defaultProviderId === PHI_ID;
  const ready =
    status.access.state === "ok" && status.device.state === "ok" && status.model.state === "ok";

  const run = async (what: "check" | "get" | "test") => {
    setBusy(what);
    try {
      if (what === "check") onStatus(await api.phiStatus());
      if (what === "get") {
        setProgress(0);
        const stop = await onPhiProgress(setProgress);
        try {
          onStatus(await api.phiEnsureReady());
        } finally {
          stop();
          setProgress(null);
        }
      }
      if (what === "test") setTest(await api.phiTest());
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(null);
    }
  };

  const use = () => {
    const others = draft.ai.providers.filter((p) => p.id !== PHI_ID);
    onChange({
      ...draft,
      ai: { ...draft.ai, providers: [...others, PHI_PROVIDER], defaultProviderId: PHI_ID },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label="Phi Silica on this PC"
        className="flex flex-col gap-3 rounded-lg border p-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="section-label flex-1">Phi Silica on this PC</h3>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => {
              void run("check");
            }}
          >
            Check again
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard
                .writeText(phiReport(status, test))
                .then(() => {
                  setCopied(true);
                })
                .catch(reportError);
            }}
          >
            {copied ? "Copied" : "Copy for a bug report"}
          </Button>
        </div>
        <ul className="flex flex-col gap-2">
          <Line name="Access from Microsoft" check={status.access} />
          <Line name="This PC" check={status.device} />
          <Line name="The model" check={status.model} />
          {test && (
            <Line
              name="Test reply"
              check={
                test.ok
                  ? {
                      state: "ok",
                      text: `Answered in ${(test.millis / 1000).toFixed(1)} s`,
                      code: null,
                    }
                  : { state: "fail", text: test.message, code: null }
              }
            />
          )}
        </ul>
        {status.canGetModel && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() => {
                  void run("get");
                }}
              >
                Ask Windows to get it
              </Button>
              <span className="text-xs text-muted-foreground">
                Windows downloads it itself; this can take a while.
              </span>
            </div>
            {progress !== null && (
              <progress
                aria-label="Getting the model"
                className="h-1.5 w-full"
                max={100}
                value={progress}
              />
            )}
          </div>
        )}
        {test?.ok && (
          <div className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2 text-sm">
            <span className="section-label">The test</span>
            <span className="text-muted-foreground">
              Mimer asked: <em>“{test.prompt}”</em>
            </span>
            <span>Phi Silica answered: {test.answer}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={!ready || inUse} onClick={use}>
            {inUse ? "Mimer uses Phi Silica" : "Use Phi Silica for my notes"}
          </Button>
          <Button
            variant="outline"
            disabled={!ready || busy !== null}
            onClick={() => {
              void run("test");
            }}
          >
            {busy === "test" ? "Testing…" : "Test Phi Silica"}
          </Button>
        </div>
      </section>

      <section aria-label="What Phi Silica can do" className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 rounded-lg border p-3.5">
          <span className="section-label text-success">Works</span>
          <span>
            Fix, Rewrite, Shorten, Translate and the other text commands, in notes and in every text
            box.
          </span>
          <span>
            Summary, title and tags, find tasks, Help me start, and answers in the chat about the
            open note.
          </span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-lg border p-3.5">
          <span className="section-label text-warning">Not with Phi Silica</span>
          <span>
            Skills and search across the vault in the chat: Phi Silica cannot call tools, so the
            chat says so, as with other models without tools.
          </span>
          <span>Long notes: only a short text fits, so Mimer shortens what it sends.</span>
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Everything stays on this PC. Microsoft replaces Phi Silica with a newer built-in model in
        2027; Mimer will move to it then.
      </p>
    </div>
  );
}

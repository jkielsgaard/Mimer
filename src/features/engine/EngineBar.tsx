import { Loader2, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, percent } from "@/lib/bytes";
import { useEngineStore } from "@/stores/engineStore";
import { useUiStore } from "@/stores/uiStore";
import { ProblemPanel } from "./ProblemPanel";

/**
 * The bar at the top of the Mimer tab when Mimer uses the built-in AI: whether the model is
 * loaded, the button to load it (Wake Mimer) or unload it (Sleep Mimer), and what to do when
 * something is wrong.
 */
export function EngineBar() {
  const status = useEngineStore((s) => s.status);
  const wake = useEngineStore((s) => s.wake);
  const sleep = useEngineStore((s) => s.sleep);
  const cancelInstall = useEngineStore((s) => s.cancelInstall);
  const openSettings = (): void => {
    useUiStore.getState().openBuiltInSettings();
  };
  if (!status) return null;

  const wakeButton = (label = "Wake Mimer") => (
    <Button
      size="sm"
      onClick={() => {
        void wake();
      }}
    >
      <Sun /> {label}
    </Button>
  );

  if (status.state === "error" && status.problem) {
    return (
      <div className="border-b p-2" data-testid="engine-bar" data-state="error">
        <ProblemPanel
          problem={status.problem}
          actions={
            <>
              {status.selectedModelReady && status.engine ? wakeButton("Try again") : null}
              <Button size="sm" variant="outline" onClick={openSettings}>
                Open settings
              </Button>
            </>
          }
        />
      </div>
    );
  }

  const bar = (children: React.ReactNode, tone = "bg-muted/50") => (
    <div
      data-testid="engine-bar"
      data-state={status.state}
      className={`flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs ${tone}`}
    >
      {children}
    </div>
  );

  switch (status.state) {
    case "notInstalled":
      return bar(
        <>
          <span className="min-w-0 flex-1">
            The built-in AI is not downloaded yet. Choose your hardware and a model to start.
          </span>
          <Button size="sm" onClick={openSettings}>
            Set up
          </Button>
        </>,
      );
    case "installing": {
      const p = status.install;
      return bar(
        <>
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          <span className="min-w-0 flex-1">
            {status.message}
            {p && p.total > 0 && ` ${String(percent(p.done, p.total))}% of ${formatBytes(p.total)}`}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void cancelInstall();
            }}
          >
            Cancel
          </Button>
        </>,
      );
    }
    case "asleep":
      return bar(
        <>
          <Moon className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            Mimer is asleep. Wake Mimer to load the model into memory before you chat.
          </span>
          {wakeButton()}
        </>,
      );
    case "waking":
      return bar(
        <>
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          <span className="min-w-0 flex-1" role="status">
            {status.message}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void sleep();
            }}
          >
            Cancel
          </Button>
        </>,
        "bg-warning/15",
      );
    case "awake":
      return bar(
        <>
          <Sun className="size-4 shrink-0 text-success" aria-hidden />
          <span className="min-w-0 flex-1">
            Mimer is awake.
            {status.restartNeeded &&
              " The settings changed: put Mimer to sleep and wake him to use them."}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void sleep();
            }}
          >
            <Moon /> Sleep Mimer
          </Button>
        </>,
        "bg-success/10",
      );
    case "sleeping":
      return bar(
        <>
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          <span>Putting Mimer to sleep…</span>
        </>,
      );
    default:
      return null;
  }
}

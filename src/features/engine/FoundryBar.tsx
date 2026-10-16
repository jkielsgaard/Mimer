import { Loader2, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFoundryStore } from "@/stores/foundryStore";
import { useUiStore } from "@/stores/uiStore";
import { ProblemPanel } from "./ProblemPanel";

/**
 * The bar at the top of the Mimer tab when Mimer uses Foundry Local: whether the model is loaded,
 * the button to load it (Wake Mimer) or unload it (Sleep Mimer), and what to do when something is
 * wrong.
 */
export function FoundryBar() {
  const status = useFoundryStore((s) => s.status);
  const wake = useFoundryStore((s) => s.wake);
  const sleep = useFoundryStore((s) => s.sleep);
  const cancelInstall = useFoundryStore((s) => s.cancelInstall);
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
      <div className="border-b p-2" data-testid="foundry-bar" data-state="error">
        <ProblemPanel
          problem={status.problem}
          actions={
            <>
              {status.installed.length > 0 ? wakeButton("Try again") : null}
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
      data-testid="foundry-bar"
      data-state={status.state}
      className={`flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs ${tone}`}
    >
      {children}
    </div>
  );

  switch (status.state) {
    case "notInstalled":
      if (status.unavailableReason) {
        return bar(<span className="min-w-0 flex-1">{status.unavailableReason}</span>);
      }
      return bar(
        <>
          <span className="min-w-0 flex-1">
            No Foundry Local model is downloaded yet. Choose a model to start.
          </span>
          <Button size="sm" onClick={openSettings}>
            Set up
          </Button>
        </>,
      );
    case "installing":
      return bar(
        <>
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          <span className="min-w-0 flex-1">{status.message}</span>
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
              " Another model was chosen: put Mimer to sleep and wake him to use it."}
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

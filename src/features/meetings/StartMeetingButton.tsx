import { ChevronDown, Presentation } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { flushPendingWrites } from "@/lib/flush";
import { nextMeetingSeed } from "@/lib/meeting";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { ActionsDialog } from "./ActionsDialog";

/**
 * Above a note in the meetings folder: "Start meeting", and a small menu with what comes after
 * (add the actions to Tasks, prepare the next meeting). Nothing is shown for other notes.
 */
export function StartMeetingButton({ path }: { path: string | null }) {
  const folder = useVaultStore((s) => s.vault?.config.meetingsFolder) ?? "";
  const [actions, setActions] = useState<string | null>(null);
  if (path === null || folder === "" || !path.startsWith(`${folder.replace(/\/+$/, "")}/`)) {
    return null;
  }

  /** The note as it is on disk, after anything waiting to be written has been. */
  const read = async (): Promise<string> => {
    await flushPendingWrites();
    return (await api.readNote(path)).content;
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          useUiStore.getState().setMeetingFocus(path);
        }}
      >
        <Presentation /> Start meeting
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="ghost" aria-label="After the meeting">
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              read()
                .then((text) => {
                  setActions(text);
                })
                .catch(reportError);
            }}
          >
            Add actions to Tasks…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              read()
                .then((text) => {
                  useUiStore.getState().openMeetingFormWith(nextMeetingSeed(text));
                })
                .catch(reportError);
            }}
          >
            Prepare next meeting…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {actions !== null && (
        <ActionsDialog
          path={path}
          content={actions}
          onDone={(next) => api.writeNote(path, next)}
          onClose={() => {
            setActions(null);
          }}
        />
      )}
    </>
  );
}

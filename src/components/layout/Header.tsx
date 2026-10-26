import { CircleHelp, PanelLeft, PanelRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { PromptDialog } from "@/components/PromptDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { setWindowTitle } from "@/lib/window";
import { releaseStage } from "@/lib/version";
import { flushPendingWrites } from "@/lib/flush";
import { newNoteInCurrentFolder, openDailyNote } from "@/lib/actions";
import { formatShortcut } from "@/lib/shortcuts";
import { reportAi } from "@/lib/reportAi";
import { reportIssue } from "@/lib/reportIssue";
import { noteTitle } from "@/lib/utils";
import { VaultSwitcher } from "@/features/vaults/VaultSwitcher";
import { useProposalStore } from "@/stores/proposalStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { activeTitle, useVaultStore } from "@/stores/vaultStore";

/** Title bar row: the File, Go and Help menus, "vault — note" title and panel toggles. */
export function Header() {
  const vault = useVaultStore((s) => s.vault);
  const activePath = useVaultStore((s) => s.activePath);
  const closeVault = useVaultStore((s) => s.closeVault);
  const ui = useUiStore();
  const lastApplied = useProposalStore((s) => s.lastAppliedSha);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const title = vault
    ? activePath
      ? `${vault.name} — ${activeTitle(activePath)}`
      : vault.name
    : "Mimer";

  useEffect(() => {
    document.title = title;
    void setWindowTitle(`${title} · Mimer ${releaseStage}`);
  }, [title]);

  const item = (label: string, combo: string | null, run: () => void, disabled = false) => (
    <DropdownMenuItem disabled={disabled} onSelect={run}>
      <span>{label}</span>
      {combo && <DropdownMenuShortcut>{formatShortcut(combo)}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  );
  const menu = (name: string, children: ReactNode) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`${name} menu`}>
          {name}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-64">{children}</DropdownMenuContent>
    </DropdownMenu>
  );

  const saveTemplate = async (name: string): Promise<void> => {
    if (activePath === null) return;
    try {
      await flushPendingWrites();
      await api.saveTemplateFromNote(activePath, name);
      ui.toast("Template saved", "success");
    } catch (e) {
      reportError(e);
    }
  };

  return (
    <header className="flex h-9 shrink-0 items-center gap-1 border-b bg-sidebar px-2">
      {menu(
        "File",
        <>
          {item("Note", "Mod+N", newNoteInCurrentFolder)}
          {item("From a template…", null, () => {
            ui.setTemplatePickerOpen(true);
          })}
          {item("Meeting note…", null, () => {
            ui.setMeetingFormOpen(true);
          })}
          {item("Quick note", null, () => {
            ui.openCapture("note");
          })}
          {item("Today's daily note", "Mod+Shift+D", () => void openDailyNote())}
          <DropdownMenuSeparator />
          {item("Capture a task, idea or note…", "Mod+Shift+N", () => {
            ui.openCapture();
          })}
          <DropdownMenuSeparator />
          {item(
            "Save the note as a template…",
            null,
            () => {
              setTemplateName(noteTitle(activePath ?? ""));
            },
            activePath === null,
          )}
          {item(
            "Export…",
            null,
            () => {
              ui.openExportDialog({ path: activePath ?? "", isFolder: false });
            },
            activePath === null,
          )}
          {item("Import notes from a folder…", null, () => {
            ui.setImportOpen(true);
          })}
          <DropdownMenuSeparator />
          {item("Recover deleted notes…", null, () => {
            ui.setRecoverOpen(true);
          })}
          {item(
            "Undo the last AI change",
            null,
            () => {
              void useProposalStore.getState().undoLast();
            },
            lastApplied === null,
          )}
          <DropdownMenuSeparator />
          {item("Settings…", "Mod+,", () => {
            ui.setSettingsOpen(true);
          })}
          {item("Close the vault", null, () => void closeVault())}
        </>,
      )}
      {menu(
        "Go",
        <>
          {item("Quick open…", "Mod+P", () => {
            ui.setQuickOpen(true);
          })}
          {item("Command palette…", "Mod+Shift+P", () => {
            ui.setCommandPalette(true);
          })}
          {item("Search", "Mod+Shift+F", () => {
            ui.focusSearch();
          })}
          <DropdownMenuSeparator />
          {item("Tasks", "Mod+Shift+T", () => {
            ui.openArea("tasks");
          })}
          {item("Ideas", null, () => {
            ui.openArea("ideas");
          })}
          {item("Ask about my notes", "Mod+L", () => {
            ui.focusChat();
          })}
          <DropdownMenuSeparator />
          {item("History of the note", "Mod+Shift+H", () => {
            ui.setRightTab("history");
          })}
          {item(ui.sourceMode ? "Show live preview" : "Show Markdown source", "Mod+Alt+M", () => {
            ui.setSourceMode(!ui.sourceMode);
          })}
        </>,
      )}
      {menu(
        "Help",
        <>
          {item("How to use Mimer", "F1", () => {
            ui.openHelp();
          })}
          <DropdownMenuSeparator />
          {item("Report a bug…", null, () => {
            reportIssue("bug").catch(reportError);
          })}
          {item("Suggest a feature…", null, () => {
            reportIssue("feature").catch(reportError);
          })}
          {item("Report inappropriate AI content…", null, () => {
            reportAi("Mimer").catch(reportError);
          })}
          <DropdownMenuSeparator />
          {item("About the AI beta…", null, () => {
            ui.setBetaNoticeOpen(true);
          })}
          {item("About Mimer…", null, () => {
            ui.setAboutOpen(true);
          })}
        </>,
      )}
      <VaultSwitcher />
      <div
        className="flex-1 truncate text-center text-xs text-muted-foreground"
        data-testid="title"
      >
        {title}
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="How to use Mimer"
        title={`How to use Mimer (${formatShortcut("F1")})`}
        onClick={() => {
          ui.openHelp();
        }}
      >
        <CircleHelp />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle file tree"
        aria-pressed={!ui.leftCollapsed}
        onClick={ui.toggleLeft}
      >
        <PanelLeft />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle right panel"
        aria-pressed={!ui.rightCollapsed}
        onClick={ui.toggleRight}
      >
        <PanelRight />
      </Button>
      <PromptDialog
        open={templateName !== null}
        title="Save as template"
        label="Template name"
        confirmLabel="Save"
        initialValue={templateName ?? ""}
        validate={(v) => (v.trim() === "" ? "Enter a name" : null)}
        onCancel={() => {
          setTemplateName(null);
        }}
        onSubmit={(name) => {
          setTemplateName(null);
          void saveTemplate(name);
        }}
      />
    </header>
  );
}

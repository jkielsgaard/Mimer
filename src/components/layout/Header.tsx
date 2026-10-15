import { CircleHelp, Menu, PanelLeft, PanelRight } from "lucide-react";
import { useEffect, useState } from "react";
import { PromptDialog } from "@/components/PromptDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { setWindowTitle } from "@/lib/window";
import { releaseStage } from "@/lib/version";
import { flushPendingWrites } from "@/lib/flush";
import { newNoteInCurrentFolder, openDailyNote } from "@/lib/actions";
import { formatShortcut } from "@/lib/shortcuts";
import { noteTitle } from "@/lib/utils";
import { VaultSwitcher } from "@/features/vaults/VaultSwitcher";
import { reportError, useUiStore } from "@/stores/uiStore";
import { activeTitle, useVaultStore } from "@/stores/vaultStore";

/** Title bar row: app menu, "vault — note" title and panel toggles. */
export function Header() {
  const vault = useVaultStore((s) => s.vault);
  const activePath = useVaultStore((s) => s.activePath);
  const closeVault = useVaultStore((s) => s.closeVault);
  const ui = useUiStore();
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
      {combo && <span className="text-xs text-muted-foreground">{formatShortcut(combo)}</span>}
    </DropdownMenuItem>
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="File menu">
            <Menu /> File
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {item("New note", "Mod+N", () => void newNoteInCurrentFolder())}
          {item("New note from template…", null, () => {
            ui.setTemplatePickerOpen(true);
          })}
          {item("Open today's daily note", "Mod+Shift+D", () => void openDailyNote())}
          <DropdownMenuSeparator />
          {item(
            "Save current note as template…",
            null,
            () => {
              setTemplateName(noteTitle(activePath ?? ""));
            },
            activePath === null,
          )}
          <DropdownMenuSeparator />
          {item(
            "Export…",
            null,
            () => {
              ui.openExportDialog({ path: activePath ?? "", isFolder: false });
            },
            activePath === null,
          )}
          {item("Import notes from folder…", null, () => {
            ui.setImportOpen(true);
          })}
          {item("Write a research prompt…", null, () => {
            ui.setResearchOpen(true);
          })}
          {item("Import an answer from a cloud AI…", null, () => {
            ui.setImportAnswerOpen(true);
          })}
          {item("Quick open…", "Mod+P", () => {
            ui.setQuickOpen(true);
          })}
          {item("Search in vault", "Mod+Shift+F", () => {
            ui.focusSearch();
          })}
          <DropdownMenuSeparator />
          {item("Version history", "Mod+Shift+H", () => {
            ui.setRightTab("history");
          })}
          {item("Recover deleted notes…", null, () => {
            ui.setRecoverOpen(true);
          })}
          <DropdownMenuSeparator />
          {item("Settings…", "Mod+,", () => {
            ui.setSettingsOpen(true);
          })}
          {item("How to use Mimer", "F1", () => {
            ui.openHelp();
          })}
          {item("About Mimer…", null, () => {
            ui.setAboutOpen(true);
          })}
          {item("Close vault", null, () => void closeVault())}
        </DropdownMenuContent>
      </DropdownMenu>
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

import { useEffect, useState } from "react";
import type { VaultConfig } from "@/bindings/VaultConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api, toApiError } from "@/lib/api";
import { useVaultStore } from "@/stores/vaultStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import type { TemplateInfo } from "@/bindings/TemplateInfo";
import { InfoHint } from "@/components/InfoHint";

const FORMATS = [
  { value: "%Y-%m-%d", label: "2026-10-13" },
  { value: "%d-%m-%Y", label: "13-10-2026" },
  { value: "%d %b %Y", label: "13 Oct 2026" },
];

/** Settings → Vault: folders, daily notes and templates of the open vault. */
export function VaultSettingsTab() {
  const vault = useVaultStore((s) => s.vault);
  const updateConfig = useVaultStore((s) => s.updateConfig);
  const [draft, setDraft] = useState<VaultConfig | null>(null);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [customFormat, setCustomFormat] = useState(false);

  useEffect(() => {
    if (!vault) return;
    setDraft({ ...vault.config });
    setCustomFormat(!FORMATS.some((f) => f.value === vault.config.dailyNoteFormat));
    api.listTemplates().then(setTemplates).catch(reportError);
  }, [vault]);

  if (!vault || !draft) {
    return <p className="text-sm text-muted-foreground">Open a vault to change its settings.</p>;
  }
  const set = (patch: Partial<VaultConfig>): void => {
    setDraft({ ...draft, ...patch });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        These settings are saved in this vault (.vault/config.json).
      </p>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="v-daily">Daily notes folder (empty = vault root)</Label>
          <InfoHint
            label="Daily notes folder"
            text="Where the note for today is kept when you press Ctrl/Cmd+Shift+D."
            topic="templates"
          />
        </div>
        <Input
          data-no-ai
          id="v-daily"
          value={draft.dailyNotesFolder}
          onChange={(e) => {
            set({ dailyNotesFolder: e.target.value });
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="v-format">Daily note date format</Label>
        <Select
          id="v-format"
          value={customFormat ? "custom" : draft.dailyNoteFormat}
          onChange={(e) => {
            if (e.target.value === "custom") setCustomFormat(true);
            else {
              setCustomFormat(false);
              set({ dailyNoteFormat: e.target.value });
            }
          }}
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </Select>
        {customFormat && (
          <Input
            data-no-ai
            aria-label="Custom date format"
            value={draft.dailyNoteFormat}
            onChange={(e) => {
              set({ dailyNoteFormat: e.target.value });
            }}
          />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="v-tpl">Daily note template</Label>
          <InfoHint
            label="Daily note template"
            text="The template a new daily note starts from. Templates are notes in .vault/templates."
            topic="templates"
          />
        </div>
        <Select
          id="v-tpl"
          value={draft.dailyTemplate}
          onChange={(e) => {
            set({ dailyTemplate: e.target.value });
          }}
        >
          <option value="">None</option>
          {templates.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="v-meet">Folder for meeting notes</Label>
          <InfoHint
            label="Meeting notes folder"
            text="Meeting notes made with New, Meeting note go in this folder."
            topic="templates"
          />
        </div>
        <Input
          data-no-ai
          id="v-meet"
          value={draft.meetingsFolder}
          onChange={(e) => {
            set({ meetingsFolder: e.target.value });
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="v-quick">Folder for quick notes</Label>
          <InfoHint
            label="Quick notes folder"
            text="Quick notes made with New, Quick note go in this folder."
            topic="templates"
          />
        </div>
        <Input
          data-no-ai
          id="v-quick"
          value={draft.quickNotesFolder}
          onChange={(e) => {
            set({ quickNotesFolder: e.target.value });
          }}
        />
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              api
                .seedStandardTemplates()
                .then((r) => {
                  const added = r.addedFolders.length + r.addedTemplates.length;
                  useUiStore
                    .getState()
                    .toast(
                      added === 0
                        ? "The standard folders and templates are already there."
                        : "Standard folders and templates added.",
                      "success",
                    );
                  return useVaultStore.getState().refreshTree();
                })
                .catch(reportError);
            }}
          >
            Add standard folders and templates
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="v-imgstyle">Insert images as</Label>
          <InfoHint
            label="Image link style"
            text="Markdown link works in every editor. Short name is shorter and survives moving a note, but only some other apps understand it."
            topic="images"
          />
        </div>
        <Select
          id="v-imgstyle"
          value={draft.imageLinkStyle}
          onChange={(e) => {
            set({ imageLinkStyle: e.target.value });
          }}
        >
          <option value="markdown">Markdown link: ![](path), works in every editor</option>
          <option value="wiki">Short name: ![[picture.png]], survives moving the note</option>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="v-attach">Attachments folder</Label>
          <InfoHint
            label="Attachments folder"
            text="Pictures and files you paste or add are copied into this folder of the vault."
            topic="images"
          />
        </div>
        <Input
          data-no-ai
          id="v-attach"
          value={draft.attachmentsFolder}
          onChange={(e) => {
            set({ attachmentsFolder: e.target.value });
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="v-new">Folder for new notes (empty = vault root)</Label>
        <Input
          data-no-ai
          id="v-new"
          value={draft.newNoteFolder}
          onChange={(e) => {
            set({ newNoteFolder: e.target.value });
          }}
        />
      </div>
      <div>
        <Button
          onClick={() => {
            updateConfig(draft).catch((e: unknown) => {
              reportError(toApiError(e));
            });
          }}
        >
          Save vault settings
        </Button>
      </div>
    </div>
  );
}

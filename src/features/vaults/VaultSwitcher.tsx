import { Check, ChevronsUpDown, FolderOpen, FolderPlus } from "lucide-react";
import { useState } from "react";
import { NewVaultDialog } from "./NewVaultDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { pickFolder } from "@/lib/dialogs";
import { formatShortcut } from "@/lib/shortcuts";
import { basename } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

/** A path without trailing slashes and with `/` separators, for comparing vault paths. */
export function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** One shared empty list: a selector must not return a new array every time. */
const NO_VAULTS: string[] = [];

/** The shortcut shown for the switcher. */
export const SWITCH_VAULT_SHORTCUT = "Mod+Shift+O";

/**
 * Header button that lists the recent vaults, switches between them, and opens or creates
 * another one. Switching saves the open note first and commits the old vault.
 */
export function VaultSwitcher() {
  const vault = useVaultStore((s) => s.vault);
  const openVault = useVaultStore((s) => s.openVault);
  const recent = useSettingsStore((s) => s.settings?.recentVaults ?? NO_VAULTS);
  const open = useUiStore((s) => s.vaultSwitcherOpen);
  const setOpen = useUiStore((s) => s.setVaultSwitcherOpen);
  const [parent, setParent] = useState<string | null>(null);
  if (!vault) return null;
  const current = normalizeVaultPath(vault.path);

  const pick = async (): Promise<string | null> => {
    try {
      return await pickFolder();
    } catch (e) {
      reportError(e);
      return null;
    }
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Switch vault"
            title={`Switch vault (${formatShortcut(SWITCH_VAULT_SHORTCUT)})`}
            className="max-w-48"
          >
            <span className="truncate">{vault.name}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72" align="start">
          <div className="px-2 py-1 section-label">Vaults</div>
          {recent.map((p) => {
            const isCurrent = normalizeVaultPath(p) === current;
            return (
              <DropdownMenuItem
                key={p}
                aria-current={isCurrent}
                onSelect={() => {
                  if (!isCurrent) void openVault(p);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">
                    {basename(normalizeVaultPath(p))}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">{p}</span>
                </span>
                {isCurrent && <Check className="size-4 shrink-0" aria-label="Open now" />}
              </DropdownMenuItem>
            );
          })}
          {recent.length === 0 && <DropdownMenuItem disabled>No other vaults yet</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="justify-start"
            onSelect={() => {
              void pick().then((p) => (p ? openVault(p) : undefined));
            }}
          >
            <FolderOpen /> Open another folder as vault…
          </DropdownMenuItem>
          <DropdownMenuItem
            className="justify-start"
            onSelect={() => {
              void pick().then((p) => {
                if (p) setParent(p);
              });
            }}
          >
            <FolderPlus /> Create new vault…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewVaultDialog
        parent={parent}
        onClose={() => {
          setParent(null);
        }}
      />
    </>
  );
}

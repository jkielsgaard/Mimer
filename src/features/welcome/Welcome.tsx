import { FolderOpen, FolderPlus, FolderSearch, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { pickFolder } from "@/lib/dialogs";
import { basename } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { NewVaultDialog } from "@/features/vaults/NewVaultDialog";
import backdrop from "@/assets/Image_wo_logo.png";
import { appVersion, releaseStage } from "@/lib/version";
import { PlainButton } from "@/components/ui/plain-button";

/** One shared empty list: a selector must not return a new array every time. */
const NO_VAULTS: string[] = [];

/** Shown when no vault is open: open a folder, create a vault, or pick a recent one. */
export function Welcome() {
  const recent = useSettingsStore((s) => s.settings?.recentVaults ?? NO_VAULTS);
  const openVault = useVaultStore((s) => s.openVault);
  const [parent, setParent] = useState<string | null>(null);
  const setAboutOpen = useUiStore((s) => s.setAboutOpen);
  const forgetVault = useSettingsStore((s) => s.forgetVault);
  /** Recent vaults whose folder is gone (deleted, renamed or moved). */
  const [missing, setMissing] = useState<string[]>(NO_VAULTS);

  useEffect(() => {
    let current = true;
    api
      .missingVaults()
      .then((m) => {
        if (current) setMissing(m);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [recent]);

  const forget = (path: string): void => {
    forgetVault(path).catch(reportError);
  };
  /** Points a vault that moved to its new folder: opens that folder and drops the old entry. */
  const locate = (oldPath: string): void => {
    void pick().then(async (p) => {
      if (!p) return;
      if (await openVault(p)) forget(oldPath);
    });
  };

  const pick = async (): Promise<string | null> => {
    try {
      return await pickFolder();
    } catch (e) {
      reportError(e);
      return null;
    }
  };

  return (
    <main
      className="flex h-full items-center justify-center bg-black bg-cover bg-center p-6"
      style={{ backgroundImage: `url(${backdrop})` }}
    >
      <div className="flex w-full max-w-md flex-col gap-6 rounded-xl border bg-background/90 p-6 shadow-xl backdrop-blur-sm">
        <header className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Mimer</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Markdown notes with an AI assistant that runs on your own computer. Your notes stay
            plain files, with every change in Git.
          </p>
        </header>
        <div className="flex flex-col gap-2">
          <Button
            size="default"
            className="h-10 justify-start"
            onClick={() => {
              void pick().then((p) => (p ? openVault(p) : undefined));
            }}
          >
            <FolderOpen /> Open folder as vault
          </Button>
          <Button
            variant="outline"
            className="h-10 justify-start"
            onClick={() => {
              void pick().then((p) => {
                if (p) setParent(p);
              });
            }}
          >
            <FolderPlus /> Create new vault
          </Button>
        </div>
        {recent.length > 0 && (
          <section aria-label="Recent vaults">
            <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent vaults
            </h2>
            <ul className="flex flex-col">
              {recent.map((p) => {
                const gone = missing.includes(p);
                return (
                  <li key={p} className="group flex items-center gap-1 rounded hover:bg-muted">
                    <PlainButton
                      type="button"
                      className="min-w-0 flex-1 rounded px-2 py-1.5 text-left"
                      onClick={() => {
                        void openVault(p);
                      }}
                    >
                      <div className="text-sm font-medium">
                        {basename(p.replace(/[\\/]+$/, "").replace(/\\/g, "/"))}
                        {gone && (
                          <span className="ml-2 text-xs font-normal text-destructive">
                            Folder not found
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{p}</div>
                    </PlainButton>
                    {gone && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Locate ${p}`}
                        title="Choose the folder's new location"
                        onClick={() => {
                          locate(p);
                        }}
                      >
                        <FolderSearch /> Locate…
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${p} from the list`}
                      title="Remove from the list (the folder is not deleted)"
                      onClick={() => {
                        forget(p);
                      }}
                    >
                      <X />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
          <span>
            Mimer {appVersion} {releaseStage}
          </span>
          <PlainButton
            type="button"
            className="underline-offset-2 hover:underline"
            onClick={() => {
              useUiStore.getState().openHelp();
            }}
          >
            How to use Mimer
          </PlainButton>
          <PlainButton
            type="button"
            className="underline-offset-2 hover:underline"
            onClick={() => {
              setAboutOpen(true);
            }}
          >
            About
          </PlainButton>
        </p>
      </div>
      <NewVaultDialog
        parent={parent}
        onClose={() => {
          setParent(null);
        }}
      />
    </main>
  );
}

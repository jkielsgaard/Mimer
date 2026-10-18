import { useEffect, useMemo, useRef, useState } from "react";
import { LinkUpdateDialog } from "@/components/LinkUpdateDialog";
import { AppShell } from "@/components/layout/AppShell";
import { Toasts } from "@/components/layout/Toasts";
import { ProjectDialog } from "@/features/projects/ProjectDialog";
import { ProposalReview } from "@/features/proposals/ProposalReview";
import { FirstRunDialog } from "@/features/welcome/FirstRunDialog";
import { CommandPalette } from "@/features/quickOpen/CommandPalette";
import { QuickOpen } from "@/features/quickOpen/QuickOpen";
import { RecoverDeletedDialog } from "@/features/history/RecoverDeletedDialog";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import { Welcome } from "@/features/welcome/Welcome";
import { TemplatePicker } from "@/features/templates/TemplatePicker";
import { ExportDialog } from "@/features/export/ExportDialog";
import { AboutDialog } from "@/features/about/AboutDialog";
import { HelpDialog } from "@/features/help/HelpDialog";
import { ImageLightbox } from "@/components/ImageLightbox";
import { AppContextMenu } from "@/components/AppContextMenu";
import { ImportDialog } from "@/features/import/ImportDialog";
import { ResearchDialog } from "@/features/research/ResearchDialog";
import { ImportAnswerDialog } from "@/features/research/ImportAnswerDialog";
import { PrintView } from "@/features/export/PrintView";
import {
  closeActiveTab,
  cycleTab,
  newNoteInCurrentFolder,
  openDailyNote,
  saveActiveNote,
  toggleSplit,
} from "@/lib/actions";
import { api } from "@/lib/api";
import {
  onCloseRequested,
  onEmbeddingStatus,
  onEngineStatus,
  onFoundryStatus,
  onFileChanged,
  onIndexUpdated,
} from "@/lib/events";
import { useEngineStore } from "@/stores/engineStore";
import { useFoundryStore } from "@/stores/foundryStore";
import { NoticeDialog } from "@/components/NoticeDialog";
import { NewNoteDialog } from "@/features/fileTree/NewNoteDialog";
import { useEmbeddingStore } from "@/stores/embeddingStore";
import { flushPendingWrites } from "@/lib/flush";
import { useShortcuts } from "@/lib/shortcuts";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import "@/stores/workspaceSync";
import "@/stores/chatSync";
import { useVaultStore } from "@/stores/vaultStore";

function useBackendEvents(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const unlisten: (() => void)[] = [];
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const keep = (p: Promise<() => void>): void => {
      void p.then((fn) => {
        if (disposed) fn();
        else unlisten.push(fn);
      });
    };
    keep(
      onFileChanged(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          void useVaultStore.getState().refreshTree();
        }, 250);
      }),
    );
    keep(
      onEmbeddingStatus((status) => {
        useEmbeddingStore.getState().setStatus(status);
      }),
    );
    void useEmbeddingStore.getState().load();
    keep(
      onEngineStatus((status) => {
        const before = useEngineStore.getState().status?.state;
        useEngineStore.getState().setStatus(status);
        // A finished download may have made the built-in AI Mimer's provider.
        if (before === "installing" && status.state !== "installing") {
          void useSettingsStore.getState().load();
        }
      }),
    );
    void useEngineStore.getState().load();
    keep(
      onFoundryStatus((status) => {
        const before = useFoundryStore.getState().status?.state;
        useFoundryStore.getState().setStatus(status);
        // A finished download may have made Foundry Local Mimer's provider.
        if (before === "installing" && status.state !== "installing") {
          void useSettingsStore.getState().load();
        }
      }),
    );
    void useFoundryStore.getState().load();
    keep(
      onIndexUpdated(() => {
        useVaultStore.setState((s) => ({ indexNonce: s.indexNonce + 1 }));
      }),
    );
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      unlisten.forEach((fn) => {
        fn();
      });
    };
  }, [active]);
}

/** Root component: boots settings, restores the last vault, wires global events and shortcuts. */
export function App() {
  const vault = useVaultStore((s) => s.vault);
  const settings = useSettingsStore((s) => s.settings);
  const settingsError = useSettingsStore((s) => s.error);
  const [booted, setBooted] = useState(false);
  /** React StrictMode runs effects twice in development; opening the vault twice at once races. */
  const bootStarted = useRef(false);

  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;
    void (async () => {
      await useSettingsStore.getState().load();
      const last = useSettingsStore.getState().settings?.lastVault;
      if (last) await useVaultStore.getState().openVault(last);
      setBooted(true);
    })();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (): void => {
      const s = useSettingsStore.getState().settings;
      if (s?.theme === "system") document.documentElement.classList.toggle("dark", mq.matches);
    };
    mq.addEventListener("change", handler);
    return () => {
      mq.removeEventListener("change", handler);
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onCloseRequested(() => {
      void (async () => {
        try {
          await flushPendingWrites();
        } finally {
          await api.finishClose().catch(() => undefined);
        }
      })();
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useBackendEvents(vault !== null);

  const bindings = useMemo(
    () => ({
      "Mod+s": () => void saveActiveNote(),
      "Mod+n": () => {
        newNoteInCurrentFolder();
      },
      "Mod+p": () => {
        useUiStore.getState().setQuickOpen(true);
      },
      "Mod+Shift+p": () => {
        useUiStore.getState().setCommandPalette(true);
      },
      "Mod+Shift+f": () => {
        useUiStore.getState().focusSearch();
      },
      "Mod+l": () => {
        useUiStore.getState().focusChat();
      },
      "Mod+Shift+h": () => {
        useUiStore.getState().setRightTab("history");
      },
      F1: () => {
        useUiStore.getState().openHelp();
      },
      "Mod+Shift+O": () => {
        useUiStore.getState().setVaultSwitcherOpen(true);
      },
      "Mod+,": () => {
        useUiStore.getState().setSettingsOpen(true);
      },
      "Mod+Alt+m": () => {
        const ui = useUiStore.getState();
        ui.setSourceMode(!ui.sourceMode);
      },
      "Mod+Shift+d": () => {
        void openDailyNote();
      },
      "Mod+w": () => {
        closeActiveTab();
      },
      "Mod+PageDown": () => {
        cycleTab(1);
      },
      "Mod+PageUp": () => {
        cycleTab(-1);
      },
      "Mod+\\": () => {
        toggleSplit();
      },
    }),
    [],
  );
  useShortcuts(
    vault
      ? bindings
      : {
          F1: () => {
            useUiStore.getState().openHelp();
          },
        },
  );

  if (settingsError) {
    return (
      <main className="flex h-full items-center justify-center p-8">
        <div role="alert" className="max-w-lg rounded-lg border border-destructive/50 p-6">
          <h1 className="mb-2 text-lg font-semibold">Settings could not be loaded</h1>
          <p className="text-sm">{settingsError}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Mimer will not change the settings file. Fix or remove it, then restart the app.
          </p>
        </div>
      </main>
    );
  }
  if (!booted || !settings) return <div className="h-full bg-background" aria-busy="true" />;

  return (
    <>
      {vault ? <AppShell /> : <Welcome />}
      <QuickOpen />
      <CommandPalette />
      <FirstRunDialog />
      <SettingsDialog />
      <RecoverDeletedDialog />
      <TemplatePicker />
      <ExportDialog />
      <ImportDialog />
      <AppContextMenu />
      <ImageLightbox />
      <NoticeDialog />
      <NewNoteDialog />
      <ResearchDialog />
      <ImportAnswerDialog />
      <AboutDialog />
      <HelpDialog />
      <PrintView />
      <ProjectDialog />
      <ProposalReview />
      <LinkUpdateDialog />
      <Toasts />
    </>
  );
}

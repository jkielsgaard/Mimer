import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { betaNoticeSeen } from "@/features/welcome/betaNotice";
import { openLink } from "@/lib/openLink";
import { appVersion } from "@/lib/version";
import {
  CHANGELOG_URL,
  markWhatsNewSeen,
  minorOf,
  sectionFor,
  shouldShow,
  whatsNewSeen,
} from "@/lib/whatsNew";
import { useUiStore } from "@/stores/uiStore";
import changelog from "../../../CHANGELOG.md?raw";

/**
 * "What's new in Mimer 0.22": the changes of this version, from the changelog that is part of the
 * program, so nothing is fetched. It comes once, the first time a new version starts (never the
 * first time Mimer runs on a computer), and Help → What's new opens it again.
 */
export function WhatsNewDialog() {
  const open = useUiStore((s) => s.whatsNewOpen);
  const setOpen = useUiStore((s) => s.setWhatsNewOpen);
  const items = useMemo(() => sectionFor(changelog, appVersion), []);

  useEffect(() => {
    const firstRun = !betaNoticeSeen();
    // A person who has just installed Mimer has nothing to catch up on.
    if (firstRun) markWhatsNewSeen(appVersion);
    else if (items.length > 0 && shouldShow(whatsNewSeen(), appVersion, false)) setOpen(true);
  }, [items, setOpen]);

  const close = (): void => {
    markWhatsNewSeen(appVersion);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">
            What&apos;s new in Mimer {minorOf(appVersion)}
          </DialogTitle>
          <DialogDescription className="sr-only">The changes in this version</DialogDescription>
        </DialogHeader>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            There is nothing written about this version yet. All changes are in the changelog.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {items.map((t) => (
              <li key={`${t.lead}${t.text}`} className="flex gap-2">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>
                  {t.lead !== "" && <b>{t.lead} </b>}
                  {t.text}
                </span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              void openLink(CHANGELOG_URL);
            }}
          >
            All changes
          </Button>
          <Button onClick={close}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import aboutImage from "@/assets/Image_w_logo.png";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { appVersion, buildDateLabel, releaseStage } from "@/lib/version";
import { useUiStore } from "@/stores/uiStore";

/** About Mimer: the picture, the version, what the app is for, and who made it. */
export function AboutDialog() {
  const open = useUiStore((s) => s.aboutOpen);
  const setOpen = useUiStore((s) => s.setAboutOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-auto p-0">
        <img
          src={aboutImage}
          alt="Mimer, keeper of the well of wisdom"
          className="aspect-video w-full rounded-t-lg object-cover"
          draggable={false}
        />
        <div className="flex flex-col gap-3 px-6 pb-6 text-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">About Mimer</DialogTitle>
            <DialogDescription data-testid="about-version" className="text-xs">
              Version {appVersion} ({releaseStage}) · built {buildDateLabel()} · Apache-2.0 licence
            </DialogDescription>
          </DialogHeader>
          <p>
            Mimer is a notes app for people who want to own their notes. Everything is written as
            plain Markdown files in ordinary folders, so your notes stay readable in any editor and
            are never locked into Mimer.
          </p>
          <p>
            <strong>The idea.</strong> Notes should be safe, in your hands, and easy to keep in
            order. Every change is saved in a built-in version history, so nothing is lost. The AI
            in Mimer, also called Mimer, helps you write, structure and find things. It only
            proposes changes: nothing is written until you approve it. It runs on your own computer
            by default, and cloud AI is optional and can be blocked per project.
          </p>
          <p>
            <strong>The name.</strong> Mimer comes from Mímir in Norse mythology, the keeper of the
            well of wisdom beneath the world tree Yggdrasil.
          </p>
          <p className="border-t pt-3 text-muted-foreground">
            Developed by <strong className="text-foreground">Jesper Ahasverusen Kielsgaard</strong>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

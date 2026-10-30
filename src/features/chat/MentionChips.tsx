import { FileText, Folder, X } from "lucide-react";
import { isFolderMention } from "@/lib/mentionQuery";
import { basename } from "@/lib/utils";
import { PlainButton } from "@/components/ui/plain-button";

interface Props {
  /** Vault-relative note paths. */
  paths: readonly string[];
  /** When given, each chip has a button that removes it; otherwise the chips are read-only. */
  onRemove?: (path: string) => void;
}

/** The notes attached to a message, as small removable chips. */
export function MentionChips({ paths, onRemove }: Props) {
  if (paths.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Attached notes and folders">
      {paths.map((path) => {
        const name = basename(path).replace(/\.md$/i, "");
        return (
          <li
            key={path}
            title={path}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground"
          >
            {isFolderMention(path) ? (
              <Folder className="size-3 shrink-0" aria-hidden />
            ) : (
              <FileText className="size-3 shrink-0" aria-hidden />
            )}
            <span className="truncate">{name}</span>
            {onRemove && (
              <PlainButton
                type="button"
                aria-label={`Remove ${name}`}
                className="rounded-full p-0.5 hover:bg-background/60"
                onClick={() => {
                  onRemove(path);
                }}
              >
                <X className="size-3" />
              </PlainButton>
            )}
          </li>
        );
      })}
    </ul>
  );
}

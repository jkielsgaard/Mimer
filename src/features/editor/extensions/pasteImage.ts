import { EditorView } from "@codemirror/view";
import { api } from "@/lib/api";
import { savedImageText } from "../insertImages";
import { reportError } from "@/stores/uiStore";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** `pasted-YYYYMMDD-HHMMSS.<ext>` */
export function pastedFileName(date: Date, mime: string): string {
  const ext = (mime.split("/")[1] ?? "png").replace("jpeg", "jpg").replace(/\+.*$/, "");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `pasted-${stamp}.${ext}`;
}

/** Markdown for a saved attachment: image embed or plain link. */
export function attachmentMarkdown(fileName: string, link: string, isImage: boolean): string {
  return isImage ? `![](${link})` : `[${fileName}](${link})`;
}

async function saveFiles(
  view: EditorView,
  notePath: string,
  files: File[],
  pasted: boolean,
): Promise<void> {
  const parts: string[] = [];
  for (const file of files) {
    try {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      const isImage = file.type.startsWith("image/");
      const name =
        pasted && isImage
          ? pastedFileName(new Date(), file.type)
          : file.name || pastedFileName(new Date(), file.type);
      const link = await api.saveAttachment(notePath, name, bytes);
      parts.push(
        isImage ? await savedImageText(notePath, link, "") : attachmentMarkdown(name, link, false),
      );
    } catch (e) {
      reportError(e);
    }
  }
  if (parts.length > 0) {
    const sel = view.state.selection.main;
    view.dispatch({ changes: { from: sel.from, to: sel.to, insert: parts.join("\n") } });
  }
}

/** Paste and drag-drop of images and files into the editor. */
export function pasteImage(getNotePath: () => string | null) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = Array.from(event.clipboardData?.files ?? []);
      const notePath = getNotePath();
      if (files.length === 0 || notePath === null) return false;
      event.preventDefault();
      void saveFiles(view, notePath, files, true);
      return true;
    },
    drop(event, view) {
      const files = Array.from(event.dataTransfer?.files ?? []);
      const notePath = getNotePath();
      if (files.length === 0 || notePath === null) return false;
      event.preventDefault();
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos !== null) view.dispatch({ selection: { anchor: pos } });
      void saveFiles(view, notePath, files, false);
      return true;
    },
  });
}

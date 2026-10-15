import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { reportError } from "@/stores/uiStore";
import { usePrintStore } from "@/stores/printStore";

/**
 * Preview of a PDF export. Only the document is shown; "Print / Save as PDF" opens the system
 * print dialog, where every platform offers saving as PDF.
 *
 * The HTML comes from our own backend, which escapes all note content (see export/html.rs), so
 * injecting its body is safe here; scripts are removed by the parser below as an extra measure.
 */
export function PrintView() {
  const html = usePrintStore((s) => s.html);
  const title = usePrintStore((s) => s.title);
  const finish = usePrintStore((s) => s.finish);

  const parts = useMemo(() => {
    if (html === null) return null;
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script").forEach((s) => s.remove());
    return {
      style: doc.head.querySelector("style")?.textContent ?? "",
      body: doc.body.innerHTML,
    };
  }, [html]);

  useEffect(() => {
    if (html === null) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [html, finish]);

  if (html === null || parts === null) return null;
  return (
    <div
      className="print-overlay fixed inset-0 z-[70] overflow-auto bg-white text-black"
      role="dialog"
      aria-label="Print preview"
    >
      <style>{parts.style}</style>
      <div className="print-bar sticky top-0 z-10 flex items-center gap-2 border-b bg-white px-4 py-2 text-sm text-black">
        <span className="flex-1 truncate font-medium">{title}</span>
        <span className="hidden text-xs text-neutral-500 md:inline">
          Choose “Save as PDF” as the printer to create a PDF file.
        </span>
        <Button
          size="sm"
          onClick={() => {
            api.printWindow().catch(reportError);
          }}
        >
          Print / Save as PDF
        </Button>
        <Button size="sm" variant="ghost" onClick={finish}>
          Close
        </Button>
      </div>
      <div dangerouslySetInnerHTML={{ __html: parts.body }} />
    </div>
  );
}

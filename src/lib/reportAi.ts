import { openLink } from "@/lib/openLink";
import { appVersion } from "@/lib/version";

/** Where reports about inappropriate AI answers go. */
export const REPORT_URL = "https://github.com/jkielsgaard/Mimer/issues/new";

/** Which AI the answer came from. */
export type ReportSource = "Mimer" | "inline command";

/**
 * The address of a new issue that is already filled in: it says what is being reported and which
 * version, and asks the user to describe the answer. Nothing from the user's notes or chat is
 * added: the user decides what to write.
 */
export function reportAiUrl(source: ReportSource): string {
  const title = `Inappropriate AI content (${source})`;
  const body = [
    "I want to report an inappropriate AI answer.",
    "",
    `- Where: ${source}`,
    `- Mimer version: ${appVersion}`,
    "- AI used (built-in, LM Studio or a cloud provider):",
    "",
    "What was inappropriate about the answer? (Do not paste private notes.)",
    "",
  ].join("\n");
  return `${REPORT_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=ai-content`;
}

/** Opens the pre-filled report in the browser. */
export async function reportAi(source: ReportSource): Promise<void> {
  await openLink(reportAiUrl(source));
}

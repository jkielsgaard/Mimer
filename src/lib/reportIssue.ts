import { openLink } from "@/lib/openLink";
import { appVersion } from "@/lib/version";
import { REPORT_URL } from "@/lib/reportAi";

/** What the user wants to tell the developer. */
export type IssueKind = "bug" | "feature";

/** The operating system, as far as the browser engine tells. Only used to fill in the report. */
function systemName(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/windows/i.test(ua)) return "Windows";
  if (/mac os|macintosh/i.test(ua)) return "macOS";
  if (/linux|x11/i.test(ua)) return "Linux";
  return "";
}

/**
 * The address of a new GitHub issue made from one of the templates in `.github/ISSUE_TEMPLATE`,
 * with the version and system filled in. Nothing from the user's notes or chats is added.
 */
export function issueUrl(kind: IssueKind): string {
  const params = new URLSearchParams({
    template: kind === "bug" ? "bug_report.yml" : "feature_request.yml",
    version: appVersion,
  });
  if (kind === "bug") params.set("system", systemName());
  return `${REPORT_URL}?${params.toString()}`;
}

/** Opens a pre-filled bug report or feature idea in the browser. */
export async function reportIssue(kind: IssueKind): Promise<void> {
  await openLink(issueUrl(kind));
}

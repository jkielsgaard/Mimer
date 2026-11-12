/** The lengths offered for the Focus timer, in minutes. */
export const FOCUS_PRESETS = [15, 25, 45, 60] as const;

export const FOCUS_DEFAULT = 25;
export const FOCUS_MIN = 1;
export const FOCUS_MAX = 180;

/** A length in whole minutes inside the allowed range; the default for anything else. */
export function clampMinutes(n: number): number {
  if (!Number.isFinite(n)) return FOCUS_DEFAULT;
  return Math.min(FOCUS_MAX, Math.max(FOCUS_MIN, Math.round(n)));
}

/** What is wrong with a length somebody typed, or null when it is fine. */
export function minutesError(text: string): string | null {
  if (!/^\d{1,3}$/.test(text.trim())) return "Write a whole number of minutes.";
  const n = Number(text);
  if (n < FOCUS_MIN || n > FOCUS_MAX) {
    return `Between ${String(FOCUS_MIN)} and ${String(FOCUS_MAX)} minutes.`;
  }
  return null;
}

const ASK_KEY = "mimer.askNextStep";

/** Whether Mimer asks "What is the next step?" when you leave Focus (per computer; on unless off). */
export function askNextStep(): boolean {
  try {
    return localStorage.getItem(ASK_KEY) !== "0";
  } catch {
    return true;
  }
}

/** Remembers the choice above. The screen works without it when storage is not there. */
export function setAskNextStep(on: boolean): void {
  try {
    localStorage.setItem(ASK_KEY, on ? "1" : "0");
  } catch {
    /* the choice just is not remembered */
  }
}

const KEY = "mimer.betaNoticeSeen";

/** True once the first-start notice (first version, AI is beta) was read on this computer. */
export function betaNoticeSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Remembers that the notice need not come by itself again. */
export function markBetaNoticeSeen(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* storage can be blocked; the notice then shows again next time */
  }
}

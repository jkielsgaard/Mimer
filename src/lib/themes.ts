import type { Settings } from "@/bindings/Settings";

/** The theme setting: a theme, or `system` (Light or Dark, by the computer). */
export type ThemeSetting = Settings["theme"];
/** A theme that can be on screen. */
export type ThemeId = Exclude<ThemeSetting, "system">;

export interface ThemeInfo {
  id: ThemeId;
  label: string;
  description: string;
  /** A dark theme: the page gets the `dark` class (the `dark:` styles and the diagram theme). */
  dark: boolean;
}

/** The themes in the order they are shown. The colours are in `src/index.css`. */
export const THEMES: readonly ThemeInfo[] = [
  { id: "light", label: "Light", description: "Mimer's own light", dark: false },
  { id: "dark", label: "Dark", description: "Mimer's own dark", dark: true },
  { id: "slate", label: "Slate", description: "Cool blue-grey, calm", dark: false },
  { id: "paper", label: "Paper", description: "Warm paper, easy for long reading", dark: false },
  { id: "mint", label: "Mint", description: "Soft green, fresh", dark: false },
  { id: "midnight", label: "Midnight", description: "Deep navy, blue accent", dark: true },
  { id: "graphite", label: "Graphite", description: "Neutral dark grey, teal accent", dark: true },
  { id: "ember", label: "Ember", description: "Warm dark brown, orange accent", dark: true },
];

/** The theme on screen for a setting: `system` follows the computer. */
export function resolveTheme(setting: ThemeSetting, computerIsDark: boolean): ThemeId {
  if (setting === "system") return computerIsDark ? "dark" : "light";
  return setting;
}

export function isDarkTheme(id: ThemeId): boolean {
  return THEMES.find((t) => t.id === id)?.dark ?? false;
}

/** Whether the computer is set to dark (false where that cannot be asked). */
export function computerIsDark(): boolean {
  return typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}

/** Puts a theme on the page: the theme name for the colours, the `dark` class for dark ones. */
export function applyTheme(setting: ThemeSetting): void {
  const id = resolveTheme(setting, computerIsDark());
  const root = document.documentElement;
  root.dataset.theme = id;
  root.classList.toggle("dark", isDarkTheme(id));
}

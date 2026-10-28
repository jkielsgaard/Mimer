import { create } from "zustand";
import {
  DEFAULT_LAYOUT,
  loadLayout,
  saveLayout,
  withMoved,
  withoutWidget,
  withWide,
  withWidget,
  type Placed,
  type WidgetId,
} from "@/lib/startLayout";

interface StartState {
  layout: Placed[];
  /** The page is being rearranged. */
  editing: boolean;
  setEditing: (on: boolean) => void;
  add: (id: WidgetId) => void;
  remove: (id: WidgetId) => void;
  move: (id: WidgetId, up: boolean) => void;
  setWide: (id: WidgetId, wide: boolean) => void;
  reset: () => void;
}

/** The start page's widgets, kept on this computer. */
export const useStartStore = create<StartState>((set, get) => {
  const change = (layout: Placed[]): void => {
    saveLayout(layout);
    set({ layout });
  };
  return {
    layout: loadLayout(),
    editing: false,
    setEditing: (editing) => {
      set({ editing });
    },
    add: (id) => {
      change(withWidget(get().layout, id));
    },
    remove: (id) => {
      change(withoutWidget(get().layout, id));
    },
    move: (id, up) => {
      change(withMoved(get().layout, id, up));
    },
    setWide: (id, wide) => {
      change(withWide(get().layout, id, wide));
    },
    reset: () => {
      change(DEFAULT_LAYOUT.map((p) => ({ ...p })));
    },
  };
});

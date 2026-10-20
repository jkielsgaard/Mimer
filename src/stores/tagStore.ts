import { create } from "zustand";
import type { TagCount } from "@/bindings/TagCount";
import { api } from "@/lib/api";

interface TagState {
  tags: TagCount[];
  /** Reads the tags of the vault with how many notes use each. */
  load: () => Promise<void>;
}

/** The tags used in the vault, for the suggestions while typing `#`. */
export const useTagStore = create<TagState>((set) => ({
  tags: [],
  load: async () => {
    try {
      set({ tags: await api.allTags() });
    } catch {
      /* the suggestions are only a help */
    }
  },
}));

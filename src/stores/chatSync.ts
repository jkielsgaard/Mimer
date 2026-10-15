import { useChatStore } from "./chatStore";
import { useVaultStore } from "./vaultStore";

// Chats belong to a vault: when the open vault changes, the conversation and saved list are
// reset and reloaded. Kept out of vaultStore so the stores do not import each other.
useVaultStore.subscribe((state, previous) => {
  if (state.vault?.path === previous.vault?.path) return;
  useChatStore.getState().resetForVault();
  if (state.vault) void useChatStore.getState().refreshChats();
});

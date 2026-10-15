// Typed wrappers around Tauri `invoke`. Components never call `invoke` directly.
import { Channel, invoke } from "@tauri-apps/api/core";
import type { AppError } from "@/bindings/AppError";
import type { ApplyResult } from "@/bindings/ApplyResult";
import type { Backlink } from "@/bindings/Backlink";
import type { ChatEvent } from "@/bindings/ChatEvent";
import type { ChatRequest } from "@/bindings/ChatRequest";
import type { CommitEntry } from "@/bindings/CommitEntry";
import type { CommitReason } from "@/bindings/CommitReason";
import type { DeletedFile } from "@/bindings/DeletedFile";
import type { InlineRequest } from "@/bindings/InlineRequest";
import type { RavenRequest } from "@/bindings/RavenRequest";
import type { NoteContent } from "@/bindings/NoteContent";
import type { Project } from "@/bindings/Project";
import type { ProposalSetView } from "@/bindings/ProposalSetView";
import type { ProviderTestResult } from "@/bindings/ProviderTestResult";
import type { RenamePreview } from "@/bindings/RenamePreview";
import type { RenameResult } from "@/bindings/RenameResult";
import type { SearchHit } from "@/bindings/SearchHit";
import type { SearchQuery } from "@/bindings/SearchQuery";
import type { Catalog } from "@/bindings/Catalog";
import type { EngineStatus } from "@/bindings/EngineStatus";
import type { HardwareInfo } from "@/bindings/HardwareInfo";
import type { InstallRequest } from "@/bindings/InstallRequest";
import type { RemoveWhat } from "@/bindings/RemoveWhat";
import type { Settings } from "@/bindings/Settings";
import type { TagCount } from "@/bindings/TagCount";
import type { TreeNode } from "@/bindings/TreeNode";
import type { VaultInfo } from "@/bindings/VaultInfo";
import type { ChatSummary } from "@/bindings/ChatSummary";
import type { StoredChat } from "@/bindings/StoredChat";
import type { SavedPrompt } from "@/bindings/SavedPrompt";
import type { TemplateInfo } from "@/bindings/TemplateInfo";
import type { SeedReport } from "@/bindings/SeedReport";
import type { StandardKind } from "@/bindings/StandardKind";
import type { VaultConfig } from "@/bindings/VaultConfig";
import type { ExportRequest } from "@/bindings/ExportRequest";
import type { ExportResult } from "@/bindings/ExportResult";
import type { EmbeddingStatus } from "@/bindings/EmbeddingStatus";
import type { SemanticHit } from "@/bindings/SemanticHit";
import type { ImageUsage } from "@/bindings/ImageUsage";
import type { ImportEvent } from "@/bindings/ImportEvent";
import type { ImportPlan } from "@/bindings/ImportPlan";
import type { ImportReport } from "@/bindings/ImportReport";
import type { ResearchSpec } from "@/bindings/ResearchSpec";
import type { TreeOrder } from "@/bindings/TreeOrder";

/** Error thrown by every API wrapper; `code` drives behaviour, `message` is shown in a toast. */
export class ApiError extends Error {
  readonly code: AppError["code"] | "Unknown";

  constructor(code: AppError["code"] | "Unknown", message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

function isAppError(e: unknown): e is AppError {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    "message" in e &&
    typeof (e as { message: unknown }).message === "string"
  );
}

/** Converts anything thrown by `invoke` into an `ApiError`. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (isAppError(e)) return new ApiError(e.code, e.message);
  if (e instanceof Error) return new ApiError("Unknown", e.message);
  return new ApiError("Unknown", typeof e === "string" ? e : "Something went wrong");
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw toApiError(e);
  }
}

/** Runs a streaming command; `onEvent` receives every `ChatEvent`. Resolves to the task id. */
async function stream(
  cmd: string,
  request: ChatRequest | InlineRequest | RavenRequest,
  onEvent: (e: ChatEvent) => void,
): Promise<string> {
  const channel = new Channel<ChatEvent>();
  channel.onmessage = onEvent;
  return call<string>(cmd, { request, channel });
}

export const api = {
  getTreeOrder: () => call<TreeOrder>("get_tree_order"),
  setFolderOrder: (folder: string, names: string[]) =>
    call<undefined>("set_folder_order", { folder, names }),
  openDevtools: () => call<undefined>("open_devtools"),

  // The built-in AI (download, wake, sleep)
  engineHardware: () => call<HardwareInfo>("engine_hardware"),
  engineCatalog: () => call<Catalog>("engine_catalog"),
  engineStatus: () => call<EngineStatus>("engine_status"),
  engineInstall: (request: InstallRequest) => call<undefined>("engine_install", { request }),
  engineCancelInstall: () => call<undefined>("engine_cancel_install"),
  engineAddModel: (path: string) => call<undefined>("engine_add_model", { path }),
  engineWake: () => call<undefined>("engine_wake"),
  engineSleep: () => call<undefined>("engine_sleep"),
  engineRemove: (what: RemoveWhat) => call<undefined>("engine_remove", { what }),

  // Research prompts for a cloud AI
  buildResearchPrompt: (spec: ResearchSpec) => call<string>("build_research_prompt", { spec }),

  // Vault
  openVault: (path: string) => call<VaultInfo>("open_vault", { path }),
  createVault: (parent: string, name: string) => call<VaultInfo>("create_vault", { parent, name }),
  forgetVault: (path: string) => call<undefined>("forget_vault", { path }),
  missingVaults: () => call<string[]>("missing_vaults"),
  closeVault: () => call<undefined>("close_vault"),
  getTree: () => call<TreeNode[]>("get_tree"),
  readNote: (path: string) => call<NoteContent>("read_note", { path }),
  writeNote: (path: string, content: string) => call<undefined>("write_note", { path, content }),
  createNote: (folder: string, name?: string) =>
    call<string>("create_note", { folder, name: name ?? null }),
  createFolder: (parent: string, name: string) => call<string>("create_folder", { parent, name }),
  previewRename: (from: string, to: string) => call<RenamePreview>("preview_rename", { from, to }),
  renamePath: (from: string, to: string, updateLinks: boolean) =>
    call<RenameResult>("rename_path", { from, to, updateLinks }),
  deletePath: (path: string) => call<undefined>("delete_path", { path }),
  renameNoteQuietly: (from: string, to: string) =>
    call<undefined>("rename_note_quietly", { from, to }),
  saveAttachment: (notePath: string, fileName: string, bytes: number[]) =>
    call<string>("save_attachment", { notePath, fileName, bytes }),
  revealInFileManager: (path: string) => call<undefined>("reveal_in_file_manager", { path }),
  openAttachment: (path: string) => call<undefined>("open_attachment", { path }),
  finishClose: () => call<undefined>("finish_close"),

  // Git / history
  commitNow: (reason: CommitReason, paths?: string[]) =>
    call<string | null>("commit_now", { reason, paths: paths ?? null }),
  fileHistory: (path: string) => call<CommitEntry[]>("file_history", { path }),
  fileAtCommit: (path: string, sha: string) => call<string>("file_at_commit", { path, sha }),
  restoreFile: (path: string, sha: string) => call<undefined>("restore_file", { path, sha }),
  deletedFiles: () => call<DeletedFile[]>("deleted_files"),
  restoreDeleted: (path: string, sha: string) => call<undefined>("restore_deleted", { path, sha }),

  // Search / links
  search: (query: SearchQuery) => call<SearchHit[]>("search", { query }),
  backlinks: (path: string) => call<Backlink[]>("backlinks", { path }),
  allTags: () => call<TagCount[]>("all_tags"),

  // Projects
  listProjects: () => call<Project[]>("list_projects"),
  createProject: (name: string, instructions: string, providerId: string | null) =>
    call<Project>("create_project", { name, instructions, providerId }),
  updateProject: (project: Project) => call<Project>("update_project", { project }),
  deleteProject: (id: string) => call<undefined>("delete_project", { id }),

  // Settings / providers
  getSettings: () => call<Settings>("get_settings"),
  updateSettings: (settings: Settings) => call<undefined>("update_settings", { settings }),
  getDefaultBaseInstruction: () => call<string>("get_default_base_instruction"),
  setApiKey: (providerId: string, key: string) =>
    call<undefined>("set_api_key", { providerId, key }),
  hasApiKey: (providerId: string) => call<boolean>("has_api_key", { providerId }),
  deleteApiKey: (providerId: string) => call<undefined>("delete_api_key", { providerId }),
  listModels: (providerId: string) => call<string[]>("list_models", { providerId }),
  testProvider: (providerId: string) => call<ProviderTestResult>("test_provider", { providerId }),

  // AI
  aiChat: (request: ChatRequest, onEvent: (e: ChatEvent) => void) =>
    stream("ai_chat", request, onEvent),
  aiInline: (request: InlineRequest, onEvent: (e: ChatEvent) => void) =>
    stream("ai_inline", request, onEvent),
  /** A chat with the cloud AI of Raven: messages only, no notes. */
  ravenChat: (request: RavenRequest, onEvent: (e: ChatEvent) => void) =>
    stream("raven_chat", request, onEvent),
  aiCancel: (taskId: string) => call<undefined>("ai_cancel", { taskId }),
  getProposals: (setId: string) => call<ProposalSetView>("get_proposals", { setId }),
  applyProposals: (setId: string, acceptedIds: string[], confirmedChangedIds: string[]) =>
    call<ApplyResult>("apply_proposals", { setId, acceptedIds, confirmedChangedIds }),
  discardProposals: (setId: string) => call<undefined>("discard_proposals", { setId }),

  // Chat history and saved prompts
  listChats: () => call<ChatSummary[]>("list_chats"),
  loadChat: (id: string) => call<StoredChat>("load_chat", { id }),
  saveChat: (chat: StoredChat) => call<StoredChat>("save_chat", { chat }),
  deleteChat: (id: string) => call<undefined>("delete_chat", { id }),
  deleteAllChats: () => call<number>("delete_all_chats"),
  listPrompts: () => call<SavedPrompt[]>("list_prompts"),
  addPrompt: (title: string, text: string) => call<SavedPrompt>("add_prompt", { title, text }),
  removePrompt: (id: string) => call<undefined>("remove_prompt", { id }),

  // Templates and daily notes
  listTemplates: () => call<TemplateInfo[]>("list_templates"),
  createNoteFromTemplate: (folder: string, name: string, template: string | null) =>
    call<string>("create_note_from_template", { folder, name, template }),
  openDailyNote: () => call<string>("open_daily_note"),
  createStandardNote: (kind: StandardKind, title?: string) =>
    call<string>("create_standard_note", { kind, title: title ?? null }),
  seedStandardTemplates: () => call<SeedReport>("seed_standard_templates"),
  saveTemplateFromNote: (notePath: string, name: string) =>
    call<TemplateInfo>("save_template_from_note", { notePath, name }),
  updateVaultConfig: (config: VaultConfig) => call<VaultConfig>("update_vault_config", { config }),

  // Export
  exportDocument: (request: ExportRequest, targetPath: string) =>
    call<ExportResult>("export_document", { request, targetPath }),
  exportPreviewHtml: (request: ExportRequest) => call<string>("export_preview_html", { request }),
  printWindow: () => call<undefined>("print_window"),

  createIndexPage: (folder: string) => call<string>("create_index_page", { folder }),

  // Images
  addImages: (notePath: string, files: string[]) =>
    call<string[]>("add_images", { notePath, files }),
  openExternal: (url: string) => call<undefined>("open_external", { url }),
  imageUsage: () => call<ImageUsage[]>("image_usage"),

  // Import from a folder
  scanImport: (source: string) => call<ImportPlan>("scan_import", { source }),
  runImport: (source: string, destFolder: string, onEvent: (e: ImportEvent) => void) => {
    const channel = new Channel<ImportEvent>();
    channel.onmessage = onEvent;
    return call<ImportReport>("run_import", { source, destFolder, channel });
  },
  cancelImport: () => call<undefined>("cancel_import"),

  // Semantic search
  getEmbeddingStatus: () => call<EmbeddingStatus>("get_embedding_status"),
  startEmbeddingIndex: (rebuild: boolean) => call<undefined>("start_embedding_index", { rebuild }),
  cancelEmbeddingIndex: () => call<undefined>("cancel_embedding_index"),
  semanticSearch: (query: string, limit?: number) =>
    call<SemanticHit[]>("semantic_search", { query, limit: limit ?? null }),
  hybridSearch: (query: string) => call<SearchHit[]>("hybrid_search", { query }),
};

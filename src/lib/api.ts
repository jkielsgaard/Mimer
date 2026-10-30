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
import type { NoteContent } from "@/bindings/NoteContent";
import type { Project } from "@/bindings/Project";
import type { ProposalSetView } from "@/bindings/ProposalSetView";
import type { ProviderTestResult } from "@/bindings/ProviderTestResult";
import type { RenamePreview } from "@/bindings/RenamePreview";
import type { RenameResult } from "@/bindings/RenameResult";
import type { SearchHit } from "@/bindings/SearchHit";
import type { SearchQuery } from "@/bindings/SearchQuery";
import type { Catalog } from "@/bindings/Catalog";
import type { AppPlatform } from "@/bindings/AppPlatform";
import type { PhiStatus } from "@/bindings/PhiStatus";
import type { PhiTest } from "@/bindings/PhiTest";
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
import type { Epic } from "@/bindings/Epic";
import type { Idea } from "@/bindings/Idea";
import type { MetaPatch } from "@/bindings/MetaPatch";
import type { Task } from "@/bindings/Task";
import type { Skill } from "@/bindings/Skill";
import type { TemplateInfo } from "@/bindings/TemplateInfo";
import type { SeedReport } from "@/bindings/SeedReport";
import type { StandardKind } from "@/bindings/StandardKind";
import type { VaultConfig } from "@/bindings/VaultConfig";
import type { ExportRequest } from "@/bindings/ExportRequest";
import type { ExportResult } from "@/bindings/ExportResult";
import type { EmbeddingStatus } from "@/bindings/EmbeddingStatus";
import type { SemanticHit } from "@/bindings/SemanticHit";
import type { FoundryModel } from "@/bindings/FoundryModel";
import type { FoundryRemove } from "@/bindings/FoundryRemove";
import type { FoundryStatus } from "@/bindings/FoundryStatus";
import type { ImageUsage } from "@/bindings/ImageUsage";
import type { ImportEvent } from "@/bindings/ImportEvent";
import type { ImportPlan } from "@/bindings/ImportPlan";
import type { ImportReport } from "@/bindings/ImportReport";
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
  request: ChatRequest | InlineRequest,
  onEvent: (e: ChatEvent) => void,
): Promise<string> {
  const channel = new Channel<ChatEvent>();
  channel.onmessage = onEvent;
  return call<string>(cmd, { request, channel });
}

export const api = {
  getTreeOrder: () => call<TreeOrder>("get_tree_order"),
  getEpicOrder: () => call<string[]>("get_epic_order"),
  setEpicOrder: (epics: string[]) => call<undefined>("set_epic_order", { epics }),
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
  undoCommit: (sha: string) => call<string[]>("undo_commit", { sha }),
  deletedFiles: () => call<DeletedFile[]>("deleted_files"),
  restoreDeleted: (path: string, sha: string) => call<undefined>("restore_deleted", { path, sha }),

  // The start screen
  splashDone: () => call<undefined>("splash_done"),

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

  // Templates and daily notes
  listTemplates: () => call<TemplateInfo[]>("list_templates"),
  createNoteFromTemplate: (folder: string, name: string, template: string | null) =>
    call<string>("create_note_from_template", { folder, name, template }),
  openDailyNote: (date?: string) => call<string>("open_daily_note", { date: date ?? null }),
  createStandardNote: (kind: StandardKind, title?: string) =>
    call<string>("create_standard_note", { kind, title: title ?? null }),
  seedStandardTemplates: () => call<SeedReport>("seed_standard_templates"),
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
  appPlatform: () => call<AppPlatform>("app_platform"),
  // Phi Silica (only in the Microsoft Store version)
  phiStatus: () => call<PhiStatus>("phi_status"),
  phiEnsureReady: () => call<PhiStatus>("phi_ensure_ready"),
  phiTest: () => call<PhiTest>("phi_test"),
  foundryCatalog: (refresh: boolean) => call<FoundryModel[]>("foundry_catalog", { refresh }),
  foundryStatus: () => call<FoundryStatus>("foundry_status"),
  foundryInstall: (alias: string, useForMimer: boolean) =>
    call<undefined>("foundry_install", { alias, useForMimer }),
  listSkills: () => call<Skill[]>("list_skills"),
  // Tasks
  listTasks: () => call<Task[]>("list_tasks"),
  taskSetDone: (path: string, line: number, key: string, done: boolean) =>
    call<Task[]>("task_set_done", { path, line, key, done }),
  taskSetMeta: (path: string, line: number, key: string, patch: MetaPatch) =>
    call<Task[]>("task_set_meta", { path, line, key, patch }),
  taskAddStep: (path: string, line: number, key: string, text: string) =>
    call<Task[]>("task_add_step", { path, line, key, text }),
  taskAddLog: (path: string, line: number, key: string, date: string, text: string) =>
    call<Task[]>("task_add_log", { path, line, key, date, text }),
  taskAdd: (text: string, note?: string, steps?: string[], path?: string) =>
    call<Task[]>("task_add", {
      text,
      note: note ?? null,
      steps: steps ?? null,
      path: path ?? null,
    }),
  taskEditLog: (path: string, line: number, key: string, date: string, text: string) =>
    call<Task[]>("task_edit_log", { path, line, key, date, text }),
  taskDeleteLog: (path: string, line: number, key: string) =>
    call<Task[]>("task_delete_log", { path, line, key }),
  taskSetNote: (path: string, line: number, key: string, text: string) =>
    call<Task[]>("task_set_note", { path, line, key, text }),
  epicSetDescription: (path: string, text: string) =>
    call<Epic>("epic_set_description", { path, text }),
  epicSetTitle: (path: string, title: string) => call<Epic>("epic_set_title", { path, title }),
  listEpics: () => call<Epic[]>("list_epics"),
  noteTags: (path: string) => call<string[]>("note_tags", { path }),
  noteSetTag: (path: string, tag: string, on: boolean) =>
    call<string[]>("note_set_tag", { path, tag, on }),
  taggedNotes: (tag: string) => call<NoteContent[]>("tagged_notes", { tag }),
  epicAdopt: (path: string) => call<Epic>("epic_adopt", { path }),
  epicCreate: (title: string) => call<Epic>("epic_create", { title }),
  epicForNote: (note: string) => call<Epic>("epic_for_note_cmd", { note }),
  listDailyDates: () => call<string[]>("list_daily_dates"),
  taskMove: (path: string, line: number, key: string, up: boolean) =>
    call<Task[]>("task_move", { path, line, key, up }),
  taskSetLink: (path: string, line: number, key: string, link: string | null) =>
    call<Task[]>("task_set_link", { path, line, key, link }),
  taskSetTitle: (path: string, line: number, key: string, title: string) =>
    call<Task[]>("task_set_title", { path, line, key, title }),
  taskDelete: (path: string, line: number, key: string) =>
    call<Task[]>("task_delete", { path, line, key }),
  listIdeas: () => call<Idea[]>("list_ideas"),
  ideaDelete: (line: number, key: string) => call<Idea[]>("idea_delete", { line, key }),
  ideaAdd: (date: string, text: string, note?: string) =>
    call<Idea[]>("idea_add", { date, text, note: note ?? null }),
  ideaEdit: (line: number, key: string, text: string, note: string) =>
    call<Idea[]>("idea_edit", { line, key, text, note }),
  ideaSetStatus: (line: number, key: string, status: string | null) =>
    call<Idea[]>("idea_set_status", { line, key, status }),
  taskAddToNote: (path: string, texts: string[]) =>
    call<Task[]>("task_add_to_note", { path, texts }),
  foundrySetupHardware: () => call<undefined>("foundry_setup_hardware"),
  foundryUseCpuOnly: () => call<undefined>("foundry_use_cpu_only"),
  foundryCancelInstall: () => call<undefined>("foundry_cancel_install"),
  foundryWake: () => call<undefined>("foundry_wake"),
  foundrySleep: () => call<undefined>("foundry_sleep"),
  foundryRemove: (what: FoundryRemove) => call<undefined>("foundry_remove", { what }),
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

//! Global settings stored in `<app_config_dir>/settings.json`.

pub mod keychain;
pub mod service;

use crate::engine::hardware::{Backend, CpuVendor, GpuVendor};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
use ts_rs::TS;

/// Recent notes listed by default, and the most that can be asked for.
pub const DEFAULT_RECENT_NOTES: u32 = 4;
pub const MAX_RECENT_NOTES: u32 = 20;

/// Longest base instruction kept (characters).
pub const MAX_BASE_INSTRUCTION_CHARS: usize = 4_000;

/// Current settings schema version.
pub const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Theme {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct EditorSettings {
    pub font_size: u32,
    pub line_width: u32,
    pub spellcheck: bool,
    /// How many recent notes the file panel lists (0 hides the list).
    pub recent_notes: u32,
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            font_size: 15,
            line_width: 760,
            spellcheck: true,
            recent_notes: DEFAULT_RECENT_NOTES,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct GitSettings {
    pub author_name: String,
    pub author_email: String,
    pub idle_commit_minutes: u32,
}

impl Default for GitSettings {
    fn default() -> Self {
        Self {
            author_name: "Mimer".into(),
            author_email: "mdvault@localhost".into(),
            idle_commit_minutes: 5,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum ProviderKind {
    #[serde(rename = "lmstudio")]
    #[ts(rename = "lmstudio")]
    LmStudio,
    #[serde(rename = "openai_compatible")]
    #[ts(rename = "openai_compatible")]
    OpenAiCompatible,
    #[serde(rename = "anthropic")]
    #[ts(rename = "anthropic")]
    Anthropic,
    /// The AI that Mimer runs itself (`engine` module). Always on this computer.
    #[serde(rename = "builtin")]
    #[ts(rename = "builtin")]
    BuiltIn,
    /// Microsoft's Foundry Local, installed by the user (`foundry` module). Local at a loopback
    /// address only, like LM Studio.
    #[serde(rename = "foundry_local")]
    #[ts(rename = "foundry_local")]
    FoundryLocal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Location {
    Local,
    Cloud,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProviderConfig {
    pub id: String,
    pub kind: ProviderKind,
    pub name: String,
    pub base_url: String,
    pub model: String,
    pub location: Location,
    pub supports_tools: bool,
    pub context_tokens: u32,
}

impl ProviderConfig {
    /// The location this provider is *actually* at, ignoring what the settings file claims.
    /// Only `lmstudio` and `openai_compatible` providers with a loopback address can be local:
    /// the address decides, never the kind. Notes are only ever sent to local providers.
    pub fn effective_location(&self) -> Location {
        match self.kind {
            ProviderKind::Anthropic => Location::Cloud,
            ProviderKind::LmStudio | ProviderKind::BuiltIn | ProviderKind::FoundryLocal => {
                if is_loopback_url(&self.base_url) {
                    Location::Local
                } else {
                    Location::Cloud
                }
            }
            ProviderKind::OpenAiCompatible => {
                if is_loopback_url(&self.base_url) && self.location == Location::Local {
                    Location::Local
                } else {
                    Location::Cloud
                }
            }
        }
    }
}

/// How much of the model is placed on the graphics card.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum GpuUse {
    /// The engine decides from the free graphics memory.
    Auto,
    /// Everything that fits.
    All,
    /// Nothing: use the CPU and ordinary memory only.
    None,
    /// The number in `gpuLayerCount`.
    Custom,
}

/// Flash attention (faster and lighter on memory where the card supports it).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum FlashAttention {
    Auto,
    On,
    Off,
}

/// Settings of the AI that Mimer runs itself. They apply the next time Mimer is woken.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct BuiltInSettings {
    /// The CPU the user chose (saved with the download; it does not change what is downloaded).
    pub cpu: CpuVendor,
    /// The graphics card the user chose.
    pub gpu: GpuVendor,
    /// The engine build downloaded for it.
    pub backend: Backend,
    /// A model from the catalog, or `custom:<file name>` for the user's own file.
    pub model_id: String,
    /// The context window in tokens; also what Mimer budgets its prompts against.
    pub context_tokens: u32,
    pub gpu_use: GpuUse,
    pub gpu_layer_count: u32,
    /// Threads for the CPU part; 0 lets the engine decide.
    pub threads: u32,
    pub flash_attention: FlashAttention,
    /// Let the model think before it answers (slower). Off by default.
    pub thinking: bool,
    /// Sleep automatically after this many minutes without a request; 0 = never.
    pub idle_sleep_minutes: u32,
}

/// The least and most context tokens the built-in AI accepts.
pub const MIN_BUILTIN_CONTEXT: u32 = 2_048;
pub const MAX_BUILTIN_CONTEXT: u32 = 131_072;

impl Default for BuiltInSettings {
    fn default() -> Self {
        Self {
            cpu: CpuVendor::Other,
            gpu: GpuVendor::None,
            backend: Backend::Cpu,
            model_id: "gemma-4-12b-qat".into(),
            context_tokens: 16_384,
            gpu_use: GpuUse::Auto,
            gpu_layer_count: 32,
            threads: 0,
            flash_attention: FlashAttention::Auto,
            thinking: false,
            idle_sleep_minutes: 0,
        }
    }
}

/// The provider that stands for the built-in AI.
fn builtin_provider(context_tokens: u32) -> ProviderConfig {
    ProviderConfig {
        id: crate::engine::BUILTIN_ID.into(),
        kind: ProviderKind::BuiltIn,
        name: "Mimer (built-in)".into(),
        // The port is chosen each time Mimer is woken and written here then.
        base_url: "http://127.0.0.1:8080/v1".into(),
        model: crate::engine::BUILTIN_ALIAS.into(),
        location: Location::Local,
        supports_tools: true,
        context_tokens,
    }
}

/// Semantic search (embeddings) settings.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct EmbeddingSettings {
    pub enabled: bool,
    pub provider_id: String,
    pub model: String,
}

impl Default for EmbeddingSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            provider_id: "lmstudio-default".into(),
            model: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct AiSettings {
    /// The local provider used by Mimer (the notes AI), inline commands and project help.
    pub default_provider_id: String,
    /// The cloud provider used by Raven, the separate chat that has no access to notes.
    /// `None` means Raven is off and its tab is hidden.
    pub raven_provider_id: Option<String>,
    /// Who Mimer is. Empty means the built-in default (`ai::prompt::DEFAULT_BASE_INSTRUCTION`).
    /// The safety rules are not part of it and cannot be edited.
    pub base_instruction: String,
    /// When true Mimer may write new content from its own knowledge (it has no internet access and
    /// can be wrong). Off by default: Mimer then works on the user's notes and offers a research
    /// prompt for a cloud AI instead.
    pub allow_own_knowledge: bool,
    pub global_instructions: String,
    pub providers: Vec<ProviderConfig>,
    pub embeddings: EmbeddingSettings,
    /// The AI that Mimer runs itself, without LM Studio.
    pub builtin: BuiltInSettings,
}

/// The provider Mimer uses when nothing has been chosen: the built-in AI where it can be
/// downloaded (Windows and Linux, not the Store build), otherwise LM Studio.
fn preferred_default_provider() -> &'static str {
    if crate::engine::hardware::current_os() != crate::engine::hardware::Os::Unsupported
        && crate::engine::catalog::unavailable_reason().is_none()
    {
        crate::engine::BUILTIN_ID
    } else {
        "lmstudio-default"
    }
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            default_provider_id: preferred_default_provider().into(),
            raven_provider_id: None,
            base_instruction: String::new(),
            allow_own_knowledge: false,
            global_instructions: String::new(),
            embeddings: EmbeddingSettings::default(),
            builtin: BuiltInSettings::default(),
            providers: vec![
                builtin_provider(BuiltInSettings::default().context_tokens),
                ProviderConfig {
                    id: "lmstudio-default".into(),
                    kind: ProviderKind::LmStudio,
                    name: "LM Studio".into(),
                    base_url: "http://localhost:1234/v1".into(),
                    model: String::new(),
                    location: Location::Local,
                    supports_tools: true,
                    context_tokens: 16000,
                },
            ],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct Settings {
    pub schema_version: u32,
    pub recent_vaults: Vec<String>,
    pub last_vault: Option<String>,
    pub theme: Theme,
    pub editor: EditorSettings,
    pub git: GitSettings,
    pub ai: AiSettings,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            recent_vaults: Vec::new(),
            last_vault: None,
            theme: Theme::System,
            editor: EditorSettings::default(),
            git: GitSettings::default(),
            ai: AiSettings::default(),
        }
    }
}

impl Settings {
    /// Looks up a provider by id.
    pub fn provider(&self, id: &str) -> Option<&ProviderConfig> {
        self.ai.providers.iter().find(|p| p.id == id)
    }

    /// Enforces the invariants from the spec (fixed locations, clamped values).
    pub fn normalize(&mut self) {
        self.normalize_builtin();
        for p in &mut self.ai.providers {
            p.location = p.effective_location();
            if p.context_tokens < 1000 {
                p.context_tokens = 1000;
            }
        }
        self.ai.base_instruction = self
            .ai
            .base_instruction
            .trim()
            .chars()
            .take(MAX_BASE_INSTRUCTION_CHARS)
            .collect();
        self.separate_local_and_cloud();
        // Embeddings read the notes, so they need a local OpenAI-compatible endpoint. The built-in
        // AI runs a chat model and cannot make embeddings.
        let emb = self.ai.embeddings.clone();
        let usable = self.provider(&emb.provider_id).is_some_and(|p| {
            p.kind != ProviderKind::Anthropic
                && p.kind != ProviderKind::BuiltIn
                && p.effective_location() == Location::Local
        });
        if !usable {
            self.ai.embeddings.enabled = false;
        }
        self.git.idle_commit_minutes = self.git.idle_commit_minutes.clamp(1, 60);
        self.editor.font_size = self.editor.font_size.clamp(10, 32);
        self.editor.line_width = self.editor.line_width.clamp(400, 2000);
        self.editor.recent_notes = self.editor.recent_notes.min(MAX_RECENT_NOTES);
        if self.recent_vaults.len() > 10 {
            self.recent_vaults.truncate(10);
        }
    }

    /// Keeps the built-in AI's settings in range and its provider in step with them: there is
    /// exactly one built-in provider, it is local, and it follows the context size.
    fn normalize_builtin(&mut self) {
        let b = &mut self.ai.builtin;
        b.context_tokens = b
            .context_tokens
            .clamp(MIN_BUILTIN_CONTEXT, MAX_BUILTIN_CONTEXT);
        b.threads = b.threads.min(256);
        b.gpu_layer_count = b.gpu_layer_count.min(999);
        b.idle_sleep_minutes = b.idle_sleep_minutes.min(1_440);
        let context = b.context_tokens;
        let id = crate::engine::BUILTIN_ID;
        // Only one provider may be of the built-in kind, and it has the built-in id.
        self.ai
            .providers
            .retain(|p| p.kind != ProviderKind::BuiltIn || p.id == id);
        match self.ai.providers.iter_mut().find(|p| p.id == id) {
            Some(p) => {
                p.kind = ProviderKind::BuiltIn;
                p.location = Location::Local;
                p.supports_tools = true;
                p.model = crate::engine::BUILTIN_ALIAS.into();
                p.context_tokens = context;
                if !is_loopback_url(&p.base_url) {
                    p.base_url = builtin_provider(context).base_url;
                }
            }
            None => self.ai.providers.push(builtin_provider(context)),
        }
    }

    /// Keeps notes local and cloud AI in Raven: the default provider must be local and Raven's
    /// must be cloud. A cloud default from an older version becomes Raven's provider (when Raven
    /// has none yet) and the first local provider takes its place.
    fn separate_local_and_cloud(&mut self) {
        let is_local = |s: &Settings, id: &str| {
            s.provider(id)
                .is_some_and(|p| p.effective_location() == Location::Local)
        };
        if !is_local(self, &self.ai.default_provider_id.clone()) {
            let old = self.ai.default_provider_id.clone();
            let was_cloud = self
                .provider(&old)
                .is_some_and(|p| p.effective_location() == Location::Cloud);
            if was_cloud && self.ai.raven_provider_id.is_none() {
                self.ai.raven_provider_id = Some(old);
            }
            if let Some(first) = self
                .ai
                .providers
                .iter()
                .find(|p| p.effective_location() == Location::Local)
            {
                self.ai.default_provider_id = first.id.clone();
            }
        }
        let raven_ok = self.ai.raven_provider_id.as_deref().is_some_and(|id| {
            self.provider(id)
                .is_some_and(|p| p.effective_location() == Location::Cloud)
        });
        if !raven_ok {
            self.ai.raven_provider_id = None;
        }
    }

    /// Removes a vault path from the recent list; it is also no longer the last vault.
    pub fn forget_vault(&mut self, path: &str) {
        self.recent_vaults.retain(|p| p != path);
        if self.last_vault.as_deref() == Some(path) {
            self.last_vault = None;
        }
    }

    /// Moves a vault path to the front of the recent list.
    pub fn remember_vault(&mut self, path: &str) {
        self.recent_vaults.retain(|p| p != path);
        self.recent_vaults.insert(0, path.to_string());
        self.last_vault = Some(path.to_string());
        self.normalize();
    }
}

/// True when the URL's host is `localhost`, `127.0.0.1` or `::1`.
pub fn is_loopback_url(url: &str) -> bool {
    match reqwest::Url::parse(url) {
        Ok(u) => match u.host_str() {
            Some(h) => {
                let h = h.trim_start_matches('[').trim_end_matches(']');
                h.eq_ignore_ascii_case("localhost") || h == "127.0.0.1" || h == "::1"
            }
            None => false,
        },
        Err(_) => false,
    }
}

/// Loads settings. Missing file → defaults. Unknown schema version → error (file untouched).
pub fn load(path: &Path) -> AppResult<Settings> {
    if !path.exists() {
        return Ok(Settings::default());
    }
    let text = std::fs::read_to_string(path)?;
    let value: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| AppError::Settings(format!("settings.json is not valid JSON: {e}")))?;
    let version = value
        .get("schemaVersion")
        .and_then(|v| v.as_u64())
        .unwrap_or(1);
    if version != u64::from(SCHEMA_VERSION) {
        return Err(AppError::Settings(format!(
            "settings.json has schema version {version}, which this version of Mimer does not understand. The file was not changed."
        )));
    }
    let mut s: Settings = serde_json::from_value(value)
        .map_err(|e| AppError::Settings(format!("settings.json could not be read: {e}")))?;
    s.normalize();
    Ok(s)
}

/// Saves settings atomically.
pub fn save(path: &Path, settings: &Settings) -> AppResult<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let text = serde_json::to_string_pretty(settings)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loopback_detection() {
        assert!(is_loopback_url("http://localhost:1234/v1"));
        assert!(is_loopback_url("http://127.0.0.1:8080"));
        assert!(is_loopback_url("http://[::1]:8080/v1"));
        assert!(!is_loopback_url("https://api.openai.com/v1"));
        assert!(!is_loopback_url("http://localhost.evil.com/v1"));
        assert!(!is_loopback_url("not a url"));
    }

    #[test]
    fn openai_compatible_cannot_claim_remote_host_is_local() {
        let mut s = Settings::default();
        s.ai.providers.push(ProviderConfig {
            id: "x".into(),
            kind: ProviderKind::OpenAiCompatible,
            name: "x".into(),
            base_url: "https://api.example.com/v1".into(),
            model: String::new(),
            location: Location::Local,
            supports_tools: true,
            context_tokens: 8000,
        });
        s.normalize();
        assert_eq!(s.provider("x").map(|p| p.location), Some(Location::Cloud));
    }

    #[test]
    fn unknown_schema_version_is_rejected_and_file_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("settings.json");
        std::fs::write(&p, r#"{"schemaVersion": 99}"#).unwrap();
        assert!(matches!(load(&p), Err(AppError::Settings(_))));
        assert_eq!(
            std::fs::read_to_string(&p).unwrap(),
            r#"{"schemaVersion": 99}"#
        );
    }

    #[test]
    fn embeddings_are_disabled_for_anthropic_providers() {
        let mut s = Settings::default();
        s.ai.embeddings.enabled = true;
        s.ai.embeddings.provider_id = "missing".into();
        s.normalize();
        assert!(!s.ai.embeddings.enabled);
    }

    #[test]
    fn settings_without_embeddings_load_disabled() {
        let v: Settings =
            serde_json::from_str(r#"{"schemaVersion":1,"ai":{"providers":[]}}"#).unwrap();
        assert!(!v.ai.embeddings.enabled);
    }

    #[test]
    fn roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("settings.json");
        let mut s = Settings::default();
        s.remember_vault("/a");
        save(&p, &s).unwrap();
        let back = load(&p).unwrap();
        assert_eq!(back.last_vault.as_deref(), Some("/a"));
    }

    #[test]
    fn base_instruction_defaults_to_empty_trims_and_is_capped() {
        let old: Settings = serde_json::from_str(r#"{"schemaVersion":1}"#).unwrap();
        assert_eq!(old.ai.base_instruction, "");

        let mut s = Settings::default();
        s.ai.base_instruction = format!("  {}  ", "x".repeat(MAX_BASE_INSTRUCTION_CHARS + 50));
        s.normalize();
        assert_eq!(
            s.ai.base_instruction.chars().count(),
            MAX_BASE_INSTRUCTION_CHARS
        );
        s.ai.base_instruction = "  keep me  ".into();
        s.normalize();
        assert_eq!(s.ai.base_instruction, "keep me");
    }

    #[test]
    fn recent_notes_default_to_four_are_capped_and_old_files_load() {
        let old: Settings =
            serde_json::from_str(r#"{"schemaVersion":1,"editor":{"fontSize":15}}"#).unwrap();
        assert_eq!(old.editor.recent_notes, 4);
        assert!(!old.ai.allow_own_knowledge);
        let mut s = Settings::default();
        s.editor.recent_notes = 500;
        s.normalize();
        assert_eq!(s.editor.recent_notes, MAX_RECENT_NOTES);
        s.editor.recent_notes = 0;
        s.normalize();
        assert_eq!(s.editor.recent_notes, 0, "zero hides the list");
    }

    fn provider(id: &str, kind: ProviderKind, url: &str) -> ProviderConfig {
        ProviderConfig {
            id: id.into(),
            kind,
            name: id.into(),
            base_url: url.into(),
            model: String::new(),
            location: Location::Local,
            supports_tools: true,
            context_tokens: 8000,
        }
    }

    #[test]
    fn lm_studio_is_local_only_at_a_loopback_address() {
        let near = provider("a", ProviderKind::LmStudio, "http://localhost:1234/v1");
        let far = provider("b", ProviderKind::LmStudio, "https://models.example.com/v1");
        assert_eq!(near.effective_location(), Location::Local);
        assert_eq!(far.effective_location(), Location::Cloud);
    }

    #[test]
    fn foundry_local_is_local_only_at_a_loopback_address_and_is_saved_as_foundry_local() {
        let near = provider("a", ProviderKind::FoundryLocal, "http://127.0.0.1:5272/v1");
        let far = provider(
            "b",
            ProviderKind::FoundryLocal,
            "https://models.example.com/v1",
        );
        assert_eq!(near.effective_location(), Location::Local);
        assert_eq!(far.effective_location(), Location::Cloud);
        let json = serde_json::to_string(&near).unwrap();
        assert!(json.contains("\"kind\":\"foundry_local\""), "{json}");
        let back: ProviderConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(back.kind, ProviderKind::FoundryLocal);
        let mut s = Settings::default();
        s.ai.providers.push(far);
        s.normalize();
        assert_eq!(s.ai.providers.last().unwrap().location, Location::Cloud);
    }

    #[test]
    fn a_cloud_default_provider_moves_to_raven_and_a_local_one_takes_its_place() {
        let mut s = Settings::default();
        s.ai.providers.push(provider(
            "claude",
            ProviderKind::Anthropic,
            "https://api.anthropic.com",
        ));
        s.ai.default_provider_id = "claude".into();
        s.normalize();
        // A local provider takes its place (the first one in the list).
        assert!(s
            .provider(&s.ai.default_provider_id)
            .is_some_and(|p| p.effective_location() == Location::Local));
        assert_eq!(s.ai.raven_provider_id.as_deref(), Some("claude"));
    }

    #[test]
    fn raven_keeps_its_own_provider_and_never_holds_a_local_one() {
        let mut s = Settings::default();
        s.ai.providers.push(provider(
            "claude",
            ProviderKind::Anthropic,
            "https://api.anthropic.com",
        ));
        s.ai.providers.push(provider(
            "other",
            ProviderKind::OpenAiCompatible,
            "https://api.example.com/v1",
        ));
        s.ai.default_provider_id = "other".into();
        s.ai.raven_provider_id = Some("claude".into());
        s.normalize();
        assert_eq!(s.ai.raven_provider_id.as_deref(), Some("claude"));
        s.ai.raven_provider_id = Some("lmstudio-default".into());
        s.normalize();
        assert_eq!(
            s.ai.raven_provider_id, None,
            "a local provider cannot be Raven's"
        );
        s.ai.raven_provider_id = Some("gone".into());
        s.normalize();
        assert_eq!(s.ai.raven_provider_id, None);
    }

    #[test]
    fn old_settings_load_with_raven_off() {
        let old: Settings = serde_json::from_str(r#"{"schemaVersion":1}"#).unwrap();
        assert_eq!(old.ai.raven_provider_id, None);
    }

    #[test]
    fn embeddings_need_a_local_provider() {
        let mut s = Settings::default();
        s.ai.providers.push(provider(
            "far",
            ProviderKind::OpenAiCompatible,
            "https://api.example.com/v1",
        ));
        s.ai.embeddings.enabled = true;
        s.ai.embeddings.provider_id = "far".into();
        s.normalize();
        assert!(!s.ai.embeddings.enabled);
    }

    #[test]
    fn a_fresh_install_uses_the_built_in_ai_where_it_can_be_downloaded() {
        let s = Settings::default();
        let can_download = crate::engine::hardware::current_os()
            != crate::engine::hardware::Os::Unsupported
            && crate::engine::catalog::unavailable_reason().is_none();
        let expected = if can_download {
            "builtin"
        } else {
            "lmstudio-default"
        };
        assert_eq!(s.ai.default_provider_id, expected);
        // LM Studio is still there to choose, and both are local, so notes stay on this computer.
        assert!(s.provider("lmstudio-default").is_some());
        assert!(s.provider("builtin").is_some());
        // Raven is off: it needs a cloud provider, which neither of these is.
        assert_eq!(s.ai.raven_provider_id, None);
    }
}

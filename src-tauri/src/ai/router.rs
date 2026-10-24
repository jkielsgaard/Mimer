//! Picks the provider for a request. Notes go to an AI on this computer, or to the one cloud AI
//! the user has turned on with "I understand that my notes are sent to …" (never for a project
//! marked Local AI only). Embeddings only ever use a local provider.

use crate::error::{AppError, AppResult};
use crate::projects::Project;
use crate::settings::{Location, ProviderConfig, Settings};

/// A provider that has passed the check for its kind of use.
pub trait Approved {
    /// The provider configuration that was approved for this request.
    fn config(&self) -> &ProviderConfig;
}

/// A provider that may receive notes: local (loopback address, or Windows' own model), or the
/// cloud AI the user agreed to. Can only be created by the functions in this module.
#[derive(Debug, Clone)]
pub struct NotesProvider {
    config: ProviderConfig,
}

impl Approved for NotesProvider {
    fn config(&self) -> &ProviderConfig {
        &self.config
    }
}

impl NotesProvider {
    /// The provider configuration that was approved for this request.
    pub fn config(&self) -> &ProviderConfig {
        &self.config
    }
}

fn is_local(config: &ProviderConfig) -> bool {
    config.effective_location() == Location::Local
}

/// Chooses a local provider. `provider_id` of `None` means the default. A cloud provider is
/// refused with `ProviderBlocked`, whatever the settings file claims about its location.
pub fn select_local(settings: &Settings, provider_id: Option<&str>) -> AppResult<NotesProvider> {
    let id = provider_id.unwrap_or(&settings.ai.default_provider_id);
    let config = settings
        .provider(id)
        .cloned()
        .ok_or_else(|| AppError::Provider(format!("AI provider “{id}” is not configured")))?;
    if !is_local(&config) {
        return Err(AppError::ProviderBlocked(format!(
            "“{}” is a cloud provider. Your notes are only sent to local AI. Choose a local provider.",
            config.name
        )));
    }
    Ok(NotesProvider { config })
}

/// Chooses the provider for an optional active project. A project provider that may not be used
/// (a cloud AI the user did not turn on, or one that does not exist) is ignored and Mimer's AI
/// is used.
pub fn select_for_project(
    settings: &Settings,
    project: Option<&Project>,
) -> AppResult<NotesProvider> {
    select_notes(settings, project, None)
}

/// Chooses the provider that receives notes: `provider_id`, else the project's own, else Mimer's
/// AI. A cloud AI is only accepted when the user agreed to it, and never for a project marked
/// Local AI only; such a project falls back to the first AI on this computer.
pub fn select_notes(
    settings: &Settings,
    project: Option<&Project>,
    provider_id: Option<&str>,
) -> AppResult<NotesProvider> {
    let local_only = project.is_some_and(|p| p.local_only);
    let allowed = |c: &ProviderConfig| is_local(c) || (!local_only && settings.cloud_consented(c));
    let own = project
        .and_then(|p| p.provider_id.as_deref())
        .filter(|id| settings.provider(id).is_some_and(allowed));
    let id = provider_id
        .or(own)
        .unwrap_or(&settings.ai.default_provider_id);
    let config = settings
        .provider(id)
        .cloned()
        .ok_or_else(|| AppError::Provider(format!("AI provider “{id}” is not configured")))?;
    if allowed(&config) {
        return Ok(NotesProvider { config });
    }
    if local_only {
        if let Some(first) = settings.ai.providers.iter().find(|p| is_local(p)) {
            return Ok(NotesProvider {
                config: first.clone(),
            });
        }
        return Err(AppError::ProviderBlocked(
            "This project is marked Local AI only, and there is no AI on this computer. Set one up under Settings → AI.".into(),
        ));
    }
    Err(AppError::ProviderBlocked(format!(
        "“{}” is a cloud AI. Your notes are only sent to it after you turn it on under Settings → AI. Choose an AI on this computer, or turn it on there.",
        config.name
    )))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::ProviderKind;

    fn settings() -> Settings {
        let mut s = Settings::default();
        // These tests are about choosing between providers, not about what a fresh install uses.
        s.ai.default_provider_id = "lmstudio-default".into();
        s.ai.providers.push(ProviderConfig {
            id: "cloud".into(),
            kind: ProviderKind::Anthropic,
            name: "Claude".into(),
            base_url: "https://api.anthropic.com".into(),
            model: "m".into(),
            location: Location::Cloud,
            supports_tools: true,
            context_tokens: 100_000,
        });
        s.ai.providers.push(ProviderConfig {
            id: "fake-local".into(),
            kind: ProviderKind::OpenAiCompatible,
            name: "Sneaky".into(),
            base_url: "https://api.example.com/v1".into(),
            model: "m".into(),
            location: Location::Local, // lies; must not be trusted
            supports_tools: true,
            context_tokens: 8000,
        });
        s
    }

    fn project(provider: Option<&str>) -> Project {
        Project {
            schema_version: 1,
            id: "p".into(),
            name: "P".into(),
            folder: "P".into(),
            instructions: String::new(),
            provider_id: provider.map(str::to_string),
            local_only: false,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn notes_never_go_to_a_cloud_provider() {
        let s = settings();
        assert!(matches!(
            select_local(&s, Some("cloud")),
            Err(AppError::ProviderBlocked(_))
        ));
        let mut cloud_default = settings();
        cloud_default.ai.default_provider_id = "cloud".into();
        assert!(matches!(
            select_local(&cloud_default, None),
            Err(AppError::ProviderBlocked(_))
        ));
        assert!(matches!(
            select_for_project(&cloud_default, None),
            Err(AppError::ProviderBlocked(_))
        ));
    }

    #[test]
    fn mislabelled_remote_host_is_still_blocked() {
        assert!(matches!(
            select_local(&settings(), Some("fake-local")),
            Err(AppError::ProviderBlocked(_))
        ));
    }

    #[test]
    fn lm_studio_with_a_remote_address_is_not_local() {
        let mut s = settings();
        s.ai.providers.push(ProviderConfig {
            id: "far-away".into(),
            kind: ProviderKind::LmStudio,
            name: "Far away".into(),
            base_url: "https://models.example.com/v1".into(),
            model: "m".into(),
            location: Location::Local,
            supports_tools: true,
            context_tokens: 8000,
        });
        assert!(matches!(
            select_local(&s, Some("far-away")),
            Err(AppError::ProviderBlocked(_))
        ));
    }

    #[test]
    fn local_provider_is_allowed_and_projects_use_their_own_local_provider() {
        let mut s = settings();
        s.ai.providers.push(ProviderConfig {
            id: "second".into(),
            kind: ProviderKind::OpenAiCompatible,
            name: "Second".into(),
            base_url: "http://127.0.0.1:8080/v1".into(),
            model: "m".into(),
            location: Location::Local,
            supports_tools: true,
            context_tokens: 8000,
        });
        assert_eq!(
            select_for_project(&s, None).unwrap().config().id,
            "lmstudio-default"
        );
        assert_eq!(
            select_for_project(&s, Some(&project(Some("second"))))
                .unwrap()
                .config()
                .id,
            "second"
        );
    }

    #[test]
    fn a_cloud_provider_on_a_project_is_ignored() {
        let s = settings();
        let r = select_for_project(&s, Some(&project(Some("cloud")))).unwrap();
        assert_eq!(r.config().id, "lmstudio-default");
    }

    fn with_cloud(s: &mut Settings) {
        s.ai.providers.push(ProviderConfig {
            id: "openai".into(),
            kind: ProviderKind::OpenAiCompatible,
            name: "OpenAI".into(),
            base_url: "https://api.openai.com/v1".into(),
            model: "m".into(),
            location: Location::Cloud,
            supports_tools: true,
            context_tokens: 100_000,
        });
    }

    #[test]
    fn a_cloud_ai_is_only_used_after_the_user_agreed_to_it() {
        let mut s = settings();
        with_cloud(&mut s);
        s.ai.default_provider_id = "openai".into();
        assert!(matches!(
            select_for_project(&s, None),
            Err(AppError::ProviderBlocked(_))
        ));
        s.ai.cloud_consent = Some(crate::settings::CloudConsent {
            provider_id: "openai".into(),
            base_url: "https://api.openai.com/v1".into(),
            agreed_at: "2026-10-24T10:00:00Z".into(),
        });
        assert_eq!(select_for_project(&s, None).unwrap().config().id, "openai");
        // Embeddings stay local whatever the user agreed to.
        assert!(matches!(
            select_local(&s, Some("openai")),
            Err(AppError::ProviderBlocked(_))
        ));
        // The agreement is for that address only.
        s.ai.providers.last_mut().unwrap().base_url = "https://elsewhere.example.com/v1".into();
        assert!(matches!(
            select_for_project(&s, None),
            Err(AppError::ProviderBlocked(_))
        ));
    }

    #[test]
    fn a_local_only_project_never_uses_the_cloud_ai() {
        let mut s = settings();
        with_cloud(&mut s);
        s.ai.default_provider_id = "openai".into();
        s.ai.cloud_consent = Some(crate::settings::CloudConsent {
            provider_id: "openai".into(),
            base_url: "https://api.openai.com/v1".into(),
            agreed_at: String::new(),
        });
        let mut p = project(Some("openai"));
        p.local_only = true;
        let chosen = select_for_project(&s, Some(&p)).unwrap();
        assert_eq!(chosen.config().effective_location(), Location::Local);
        s.ai.providers
            .retain(|c| c.effective_location() == Location::Cloud);
        assert!(matches!(
            select_for_project(&s, Some(&p)),
            Err(AppError::ProviderBlocked(_))
        ));
    }

    #[test]
    fn unknown_provider_errors() {
        assert!(matches!(
            select_local(&settings(), Some("nope")),
            Err(AppError::Provider(_))
        ));
    }
}

//! Picks the provider for a request and enforces local-only projects.

use crate::error::{AppError, AppResult};
use crate::projects::Project;
use crate::settings::{Location, ProviderConfig, Settings};

/// A provider that passed the local-only check. Can only be created by [`select_provider`],
/// and is the only thing `providers::chat` accepts.
#[derive(Debug, Clone)]
pub struct ResolvedProvider {
    config: ProviderConfig,
}

impl ResolvedProvider {
    /// The provider configuration that was approved for this request.
    pub fn config(&self) -> &ProviderConfig {
        &self.config
    }
}

/// Chooses a provider. `provider_id` of `None` means the global default.
/// If `local_only` is true and the provider is (effectively) cloud, returns `ProviderBlocked`.
pub fn select_provider(
    settings: &Settings,
    provider_id: Option<&str>,
    local_only: bool,
) -> AppResult<ResolvedProvider> {
    let id = provider_id.unwrap_or(&settings.ai.default_provider_id);
    let config = settings
        .provider(id)
        .cloned()
        .ok_or_else(|| AppError::Provider(format!("AI provider “{id}” is not configured")))?;
    if local_only && config.effective_location() == Location::Cloud {
        return Err(AppError::ProviderBlocked(format!(
            "This project is locked to local AI, but “{}” is a cloud provider. Choose a local provider in the project settings.",
            config.name
        )));
    }
    Ok(ResolvedProvider { config })
}

/// Chooses the provider for an optional active project.
pub fn select_for_project(
    settings: &Settings,
    project: Option<&Project>,
) -> AppResult<ResolvedProvider> {
    match project {
        Some(p) => select_provider(settings, p.provider_id.as_deref(), p.local_only),
        None => select_provider(settings, None, false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::ProviderKind;

    fn settings() -> Settings {
        let mut s = Settings::default();
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

    fn project(provider: Option<&str>, local_only: bool) -> Project {
        Project {
            schema_version: 1,
            id: "p".into(),
            name: "P".into(),
            folder: "P".into(),
            instructions: String::new(),
            provider_id: provider.map(str::to_string),
            local_only,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn cloud_provider_blocked_in_local_only_project() {
        let s = settings();
        let r = select_for_project(&s, Some(&project(Some("cloud"), true)));
        assert!(matches!(r, Err(AppError::ProviderBlocked(_))));
    }

    #[test]
    fn global_default_cloud_is_blocked_too() {
        let mut s = settings();
        s.ai.default_provider_id = "cloud".into();
        assert!(matches!(
            select_for_project(&s, Some(&project(None, true))),
            Err(AppError::ProviderBlocked(_))
        ));
        assert!(select_for_project(&s, Some(&project(None, false))).is_ok());
        assert!(select_for_project(&s, None).is_ok());
    }

    #[test]
    fn local_provider_allowed_in_local_only_project() {
        let s = settings();
        let r = select_for_project(&s, Some(&project(None, true))).unwrap();
        assert_eq!(r.config().id, "lmstudio-default");
    }

    #[test]
    fn mislabelled_remote_host_is_still_blocked() {
        let s = settings();
        assert!(matches!(
            select_for_project(&s, Some(&project(Some("fake-local"), true))),
            Err(AppError::ProviderBlocked(_))
        ));
    }

    #[test]
    fn unknown_provider_errors() {
        assert!(matches!(
            select_provider(&settings(), Some("nope"), false),
            Err(AppError::Provider(_))
        ));
    }
}

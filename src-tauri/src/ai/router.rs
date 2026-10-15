//! Picks the provider for a request. Notes only ever go to local providers; cloud providers are
//! reachable only through Raven, which never receives any note content.

use crate::error::{AppError, AppResult};
use crate::projects::Project;
use crate::settings::{Location, ProviderConfig, Settings};

/// A provider that has passed the check for its kind of use.
pub trait Approved {
    /// The provider configuration that was approved for this request.
    fn config(&self) -> &ProviderConfig;
}

/// A local provider (loopback address). The only kind the notes AI, inline commands, project
/// help and embeddings accept. Can only be created by [`select_local`] or [`select_for_project`].
#[derive(Debug, Clone)]
pub struct LocalProvider {
    config: ProviderConfig,
}

impl Approved for LocalProvider {
    fn config(&self) -> &ProviderConfig {
        &self.config
    }
}

impl LocalProvider {
    /// The provider configuration that was approved for this request.
    pub fn config(&self) -> &ProviderConfig {
        &self.config
    }
}

/// The cloud provider chosen for Raven. Can only be created by [`select_cloud`].
#[derive(Debug, Clone)]
pub struct CloudProvider {
    config: ProviderConfig,
}

impl Approved for CloudProvider {
    fn config(&self) -> &ProviderConfig {
        &self.config
    }
}

impl CloudProvider {
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
pub fn select_local(settings: &Settings, provider_id: Option<&str>) -> AppResult<LocalProvider> {
    let id = provider_id.unwrap_or(&settings.ai.default_provider_id);
    let config = settings
        .provider(id)
        .cloned()
        .ok_or_else(|| AppError::Provider(format!("AI provider “{id}” is not configured")))?;
    if !is_local(&config) {
        return Err(AppError::ProviderBlocked(format!(
            "“{}” is a cloud provider. Your notes are only sent to local AI. Choose a local provider, or use Raven for cloud AI.",
            config.name
        )));
    }
    Ok(LocalProvider { config })
}

/// Chooses the local provider for an optional active project. A project provider that is not
/// local (for example from an older version) is ignored and the default is used.
pub fn select_for_project(
    settings: &Settings,
    project: Option<&Project>,
) -> AppResult<LocalProvider> {
    let own = project
        .and_then(|p| p.provider_id.as_deref())
        .filter(|id| settings.provider(id).is_some_and(is_local));
    select_local(settings, own)
}

/// Chooses Raven's cloud provider. Fails when Raven is off or its provider is not a cloud one.
pub fn select_cloud(settings: &Settings) -> AppResult<CloudProvider> {
    let id = settings.ai.raven_provider_id.as_deref().ok_or_else(|| {
        AppError::Provider("Raven is off. Choose a cloud provider for it in Settings → AI.".into())
    })?;
    let config = settings
        .provider(id)
        .cloned()
        .ok_or_else(|| AppError::Provider(format!("AI provider “{id}” is not configured")))?;
    if is_local(&config) {
        return Err(AppError::ProviderBlocked(format!(
            "“{}” is a local provider. Raven uses cloud AI only.",
            config.name
        )));
    }
    Ok(CloudProvider { config })
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

    fn project(provider: Option<&str>) -> Project {
        Project {
            schema_version: 1,
            id: "p".into(),
            name: "P".into(),
            folder: "P".into(),
            instructions: String::new(),
            provider_id: provider.map(str::to_string),
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

    #[test]
    fn unknown_provider_errors() {
        assert!(matches!(
            select_local(&settings(), Some("nope")),
            Err(AppError::Provider(_))
        ));
    }

    #[test]
    fn raven_needs_a_cloud_provider() {
        let mut s = settings();
        assert!(
            matches!(select_cloud(&s), Err(AppError::Provider(_))),
            "off"
        );
        s.ai.raven_provider_id = Some("cloud".into());
        assert_eq!(select_cloud(&s).unwrap().config().id, "cloud");
        s.ai.raven_provider_id = Some("lmstudio-default".into());
        assert!(matches!(
            select_cloud(&s),
            Err(AppError::ProviderBlocked(_))
        ));
        s.ai.raven_provider_id = Some("missing".into());
        assert!(matches!(select_cloud(&s), Err(AppError::Provider(_))));
    }
}

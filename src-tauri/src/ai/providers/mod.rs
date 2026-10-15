//! LLM providers behind one interface.

pub mod anthropic;
pub mod lmstudio;
pub mod openai_compat;
pub mod types;

use super::router::Approved;
use crate::error::{AppError, AppResult};
use crate::settings::{ProviderConfig, ProviderKind};
use serde::Serialize;
use std::time::Duration;
use tokio_util::sync::CancellationToken;
use ts_rs::TS;
use types::{LlmRequest, LlmResponse};

/// HTTP client: 10 s connect timeout, no total timeout (streams are cancelled explicitly).
/// Fails instead of silently dropping the connect timeout.
pub fn http_client() -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| AppError::Provider(format!("Could not start the HTTP client: {e}")))
}

/// Sends a chat request. Only reachable with an approved provider: a `LocalProvider` for notes or
/// the `CloudProvider` of Raven (see `ai::router`).
pub async fn chat(
    client: &reqwest::Client,
    provider: &impl Approved,
    key: Option<&str>,
    req: &LlmRequest,
    cancel: &CancellationToken,
    on_text: &mut (dyn FnMut(&str) + Send),
) -> AppResult<LlmResponse> {
    let p = provider.config();
    match p.kind {
        ProviderKind::Anthropic => {
            anthropic::chat_stream(client, p, key, req, cancel, on_text).await
        }
        ProviderKind::LmStudio | ProviderKind::OpenAiCompatible | ProviderKind::BuiltIn => {
            openai_compat::chat_stream(client, p, key, req, cancel, on_text).await
        }
    }
}

/// Lists the models a provider offers.
pub async fn list_models(
    client: &reqwest::Client,
    p: &ProviderConfig,
    key: Option<&str>,
) -> AppResult<Vec<String>> {
    match p.kind {
        ProviderKind::Anthropic => anthropic::list_models(client, &p.base_url, key).await,
        _ => openai_compat::list_models(client, &p.base_url, key).await,
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProviderTestResult {
    pub ok: bool,
    pub message: String,
    pub models: Vec<String>,
}

/// Turns the result of listing models into the message shown by "Test connection".
pub fn connection_report(p: &ProviderConfig, result: AppResult<Vec<String>>) -> ProviderTestResult {
    match result {
        Ok(models) => {
            let mut message = format!("Connected. {} model(s) available.", models.len());
            if p.model.is_empty() {
                message.push_str(" No model is selected yet.");
            } else if !models.is_empty() && !models.contains(&p.model) {
                message.push_str(&format!(" Note: “{}” is not in the list.", p.model));
            }
            ProviderTestResult {
                ok: true,
                message,
                models,
            }
        }
        Err(e) => ProviderTestResult {
            ok: false,
            message: e.to_string(),
            models: vec![],
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::Location;

    fn provider(model: &str) -> ProviderConfig {
        ProviderConfig {
            id: "p".into(),
            kind: ProviderKind::LmStudio,
            name: "LM Studio".into(),
            base_url: "http://localhost:1234/v1".into(),
            model: model.into(),
            location: Location::Local,
            supports_tools: true,
            context_tokens: 8000,
        }
    }

    #[test]
    fn report_counts_models_and_flags_a_missing_selection() {
        let r = connection_report(&provider(""), Ok(vec!["a".into(), "b".into()]));
        assert!(r.ok);
        assert_eq!(r.models.len(), 2);
        assert!(r.message.contains("2 model(s)"));
        assert!(r.message.contains("No model is selected"));
    }

    #[test]
    fn report_warns_when_the_selected_model_is_not_served() {
        let r = connection_report(&provider("gone"), Ok(vec!["a".into()]));
        assert!(r.message.contains("“gone” is not in the list"));
        let ok = connection_report(&provider("a"), Ok(vec!["a".into()]));
        assert!(!ok.message.contains("not in the list"));
    }

    #[test]
    fn report_turns_errors_into_a_failed_result() {
        let r = connection_report(&provider("a"), Err(AppError::Provider("refused".into())));
        assert!(!r.ok);
        assert!(r.message.contains("refused"));
        assert!(r.models.is_empty());
    }
}

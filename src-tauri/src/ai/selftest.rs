//! "Test it" in Settings → AI: one short question to an AI on this computer, to see that it
//! answers, and the answer or the error in plain words. The question holds none of the user's
//! notes. It goes through `router::select_local`, so a cloud AI is refused here like anywhere
//! else.

use super::providers::{self, types::ChatMessage, types::LlmRequest};
use super::router;
use crate::error::AppError;
use crate::settings::Settings;
use serde::Serialize;
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;
use ts_rs::TS;

/// How long the AI may take before the test gives up (a model may need to load first).
const TIMEOUT: Duration = Duration::from_secs(120);

/// The question: short, with no notes, so any model can answer it.
const QUESTION: &str = "Say hello in one short sentence.";

/// What a test of an AI found.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AiTestResult {
    pub ok: bool,
    /// The AI's name and model.
    pub provider: String,
    /// What the AI answered (when it did).
    pub answer: String,
    /// What went wrong, in the words the AI or the system gave (empty when it worked).
    pub error: String,
    pub millis: u32,
}

/// Asks the AI `provider_id` (an AI on this computer) one short question.
pub async fn run(settings: &Settings, provider_id: &str, key: Option<&str>) -> AiTestResult {
    let started = Instant::now();
    let millis = |s: Instant| u32::try_from(s.elapsed().as_millis()).unwrap_or(u32::MAX);
    let provider = match router::select_local(settings, Some(provider_id)) {
        Ok(p) => p,
        Err(e) => {
            return AiTestResult {
                ok: false,
                provider: provider_id.to_string(),
                answer: String::new(),
                error: e.to_string(),
                millis: millis(started),
            }
        }
    };
    let config = provider.config();
    let name = if config.model.is_empty() {
        config.name.clone()
    } else {
        format!("{} · {}", config.name, config.model)
    };
    let client = match providers::http_client() {
        Ok(c) => c,
        Err(e) => {
            return AiTestResult {
                ok: false,
                provider: name,
                answer: String::new(),
                error: e.to_string(),
                millis: millis(started),
            }
        }
    };
    let req = LlmRequest {
        system: String::new(),
        messages: vec![ChatMessage::user(QUESTION)],
        tools: vec![],
        temperature: 0.2,
    };
    let cancel = CancellationToken::new();
    let mut text = String::new();
    let outcome = tokio::time::timeout(
        TIMEOUT,
        providers::chat(&client, &provider, key, &req, &cancel, &mut |t: &str| {
            text.push_str(t);
        }),
    )
    .await;
    let error: Option<String> = match outcome {
        Err(_) => {
            cancel.cancel();
            Some("The AI did not answer within two minutes.".into())
        }
        Ok(Err(e)) => Some(describe(&e)),
        Ok(Ok(resp)) => {
            if text.trim().is_empty() {
                text = resp.text;
            }
            if text.trim().is_empty() {
                Some("The AI answered, but with no text.".into())
            } else {
                None
            }
        }
    };
    AiTestResult {
        ok: error.is_none(),
        provider: name,
        answer: text.trim().to_string(),
        error: error.unwrap_or_default(),
        millis: millis(started),
    }
}

/// The error as the system gave it, so it can be copied into a bug report as it is.
fn describe(e: &AppError) -> String {
    e.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::{Location, ProviderConfig, ProviderKind};

    fn settings_with(kind: ProviderKind, url: &str, location: Location) -> Settings {
        let mut s = Settings::default();
        s.ai.providers.push(ProviderConfig {
            id: "t".into(),
            kind,
            name: "Test AI".into(),
            base_url: url.into(),
            model: "m".into(),
            location,
            supports_tools: false,
            context_tokens: 4000,
        });
        s
    }

    #[tokio::test]
    async fn an_unknown_ai_gives_a_clear_error_and_no_answer() {
        let r = run(&Settings::default(), "nobody", None).await;
        assert!(!r.ok);
        assert!(r.error.contains("not configured"), "{}", r.error);
        assert!(r.answer.is_empty());
    }

    #[tokio::test]
    async fn a_cloud_ai_is_refused_by_the_test_like_everywhere_else() {
        let s = settings_with(
            ProviderKind::OpenAiCompatible,
            "https://api.example.com/v1",
            Location::Cloud,
        );
        let r = run(&s, "t", None).await;
        assert!(!r.ok);
        assert!(r.error.contains("cloud"), "{}", r.error);
    }

    #[tokio::test]
    async fn an_ai_that_is_not_running_says_what_went_wrong() {
        // Nothing listens on this port.
        let s = settings_with(
            ProviderKind::LmStudio,
            "http://127.0.0.1:9/v1",
            Location::Local,
        );
        let r = run(&s, "t", None).await;
        assert!(!r.ok);
        assert!(!r.error.is_empty());
        assert_eq!(r.provider, "Test AI · m");
    }
}

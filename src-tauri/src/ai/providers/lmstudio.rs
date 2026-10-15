//! LM Studio speaks the OpenAI-compatible protocol; only the defaults differ.

/// Default LM Studio server URL.
pub const DEFAULT_BASE_URL: &str = "http://localhost:1234/v1";

pub use super::openai_compat::{chat_stream, list_models};

//! Anthropic Messages API.

use super::openai_compat::error_from_response;
use super::types::{parse_args, ChatMessage, LlmRequest, LlmResponse, Role, ToolCall};
use crate::error::{AppError, AppResult};
use crate::settings::ProviderConfig;
use eventsource_stream::Eventsource;
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use tokio_util::sync::CancellationToken;

/// Default API host.
pub const DEFAULT_BASE_URL: &str = "https://api.anthropic.com";
const VERSION: &str = "2023-06-01";

fn base(p: &str) -> String {
    let b = p.trim().trim_end_matches('/');
    let b = if b.is_empty() { DEFAULT_BASE_URL } else { b };
    b.trim_end_matches("/v1").to_string()
}

/// Converts messages to Anthropic's block format.
pub fn convert_messages(messages: &[ChatMessage]) -> Vec<Value> {
    let mut out: Vec<Value> = Vec::new();
    for m in messages {
        match m.role {
            Role::User => out.push(json!({"role": "user", "content": m.content})),
            Role::Assistant => {
                let mut blocks = Vec::new();
                if !m.content.is_empty() {
                    blocks.push(json!({"type": "text", "text": m.content}));
                }
                for c in &m.tool_calls {
                    blocks.push(json!({
                        "type": "tool_use", "id": c.id, "name": c.name,
                        "input": parse_args(&c.arguments).unwrap_or_else(|_| json!({}))
                    }));
                }
                if !blocks.is_empty() {
                    out.push(json!({"role": "assistant", "content": blocks}));
                }
            }
            Role::Tool => {
                let block = json!({"type": "tool_result", "tool_use_id": m.tool_call_id, "content": m.content});
                let merged = out.last_mut().is_some_and(|last| {
                    last["role"] == "user"
                        && last["content"]
                            .as_array()
                            .is_some_and(|a| a.iter().all(|b| b["type"] == "tool_result"))
                });
                if merged {
                    if let Some(arr) = out.last_mut().and_then(|l| l["content"].as_array_mut()) {
                        arr.push(block);
                    }
                } else {
                    out.push(json!({"role": "user", "content": [block]}));
                }
            }
        }
    }
    out
}

/// Builds the request body.
pub fn build_body(model: &str, req: &LlmRequest, supports_tools: bool) -> Value {
    let mut body = json!({
        "model": model,
        "max_tokens": 4096,
        "stream": true,
        "system": req.system,
        "messages": convert_messages(&req.messages),
        "temperature": req.temperature.min(1.0),
    });
    if supports_tools && !req.tools.is_empty() {
        body["tools"] = Value::Array(
            req.tools
                .iter()
                .map(|t| json!({"name": t.name, "description": t.description, "input_schema": t.parameters}))
                .collect(),
        );
    }
    body
}

/// Accumulates SSE events.
#[derive(Default)]
pub struct Accumulator {
    text: String,
    tools: BTreeMap<usize, (String, String, String)>,
    pub stopped: bool,
}

impl Accumulator {
    /// Feeds one event's JSON `data`. Returns a text delta, if any.
    pub fn push_event(&mut self, data: &str) -> AppResult<Option<String>> {
        let v: Value = serde_json::from_str(data)
            .map_err(|e| AppError::Provider(format!("Bad stream event: {e}")))?;
        let index = v.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
        match v.get("type").and_then(Value::as_str).unwrap_or("") {
            "content_block_start" => {
                let b = &v["content_block"];
                if b["type"] == "tool_use" {
                    self.tools.insert(
                        index,
                        (
                            b["id"].as_str().unwrap_or("").to_string(),
                            b["name"].as_str().unwrap_or("").to_string(),
                            String::new(),
                        ),
                    );
                }
                Ok(None)
            }
            "content_block_delta" => {
                let d = &v["delta"];
                match d["type"].as_str().unwrap_or("") {
                    "text_delta" => {
                        let t = d["text"].as_str().unwrap_or("");
                        self.text.push_str(t);
                        Ok(if t.is_empty() {
                            None
                        } else {
                            Some(t.to_string())
                        })
                    }
                    "input_json_delta" => {
                        if let Some(e) = self.tools.get_mut(&index) {
                            e.2.push_str(d["partial_json"].as_str().unwrap_or(""));
                        }
                        Ok(None)
                    }
                    _ => Ok(None),
                }
            }
            "message_stop" => {
                self.stopped = true;
                Ok(None)
            }
            "error" => {
                let msg = v
                    .pointer("/error/message")
                    .and_then(Value::as_str)
                    .unwrap_or("Unknown provider error");
                Err(AppError::Provider(msg.to_string()))
            }
            _ => Ok(None),
        }
    }

    /// Final response.
    pub fn finish(self) -> LlmResponse {
        LlmResponse {
            text: self.text,
            tool_calls: self
                .tools
                .into_values()
                .map(|(id, name, arguments)| ToolCall {
                    id,
                    name,
                    arguments,
                })
                .collect(),
        }
    }
}

fn headers(rb: reqwest::RequestBuilder, key: Option<&str>) -> reqwest::RequestBuilder {
    rb.header("x-api-key", key.unwrap_or(""))
        .header("anthropic-version", VERSION)
}

/// Streams a message.
pub async fn chat_stream(
    client: &reqwest::Client,
    p: &ProviderConfig,
    key: Option<&str>,
    req: &LlmRequest,
    cancel: &CancellationToken,
    on_text: &mut (dyn FnMut(&str) + Send),
) -> AppResult<LlmResponse> {
    if key.is_none_or(str::is_empty) {
        return Err(AppError::Provider(
            "No API key is stored for this provider. Add one in Settings → AI providers.".into(),
        ));
    }
    let rb = headers(
        client.post(format!("{}/v1/messages", base(&p.base_url))),
        key,
    )
    .header("content-type", "application/json")
    .json(&build_body(&p.model, req, p.supports_tools));
    let resp = tokio::select! {
        r = rb.send() => r.map_err(|e| AppError::Provider(format!("Could not reach Anthropic: {e}")))?,
        () = cancel.cancelled() => return Ok(LlmResponse::default()),
    };
    if !resp.status().is_success() {
        return Err(error_from_response(resp).await);
    }
    let mut stream = resp.bytes_stream().eventsource();
    let mut acc = Accumulator::default();
    loop {
        tokio::select! {
            () = cancel.cancelled() => break,
            ev = stream.next() => match ev {
                None => break,
                Some(Err(e)) => return Err(AppError::Provider(format!("Stream error: {e}"))),
                Some(Ok(e)) => {
                    if let Some(t) = acc.push_event(&e.data)? { on_text(&t); }
                    if acc.stopped { break; }
                }
            }
        }
    }
    Ok(acc.finish())
}

/// Lists models from `GET /v1/models`.
pub async fn list_models(
    client: &reqwest::Client,
    base_url: &str,
    key: Option<&str>,
) -> AppResult<Vec<String>> {
    let resp = headers(
        client.get(format!("{}/v1/models?limit=100", base(base_url))),
        key,
    )
    .send()
    .await
    .map_err(|e| AppError::Provider(format!("Could not reach Anthropic: {e}")))?;
    if !resp.status().is_success() {
        return Err(error_from_response(resp).await);
    }
    let v: Value = resp.json().await?;
    Ok(v.get("data")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|m| m.get("id").and_then(Value::as_str).map(str::to_string))
                .collect()
        })
        .unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feed(fixture: &str) -> AppResult<(String, LlmResponse)> {
        let mut acc = Accumulator::default();
        let mut text = String::new();
        for block in fixture.split("\n\n").filter(|b| !b.trim().is_empty()) {
            let data = block
                .lines()
                .find_map(|l| l.strip_prefix("data: "))
                .unwrap();
            if let Some(t) = acc.push_event(data)? {
                text.push_str(&t);
            }
        }
        assert!(acc.stopped || fixture.contains("event: error"));
        Ok((text, acc.finish()))
    }

    #[test]
    fn parses_fixture_stream() {
        let (text, r) = feed(include_str!("../../../tests/fixtures/anthropic_stream.txt")).unwrap();
        assert_eq!(text, "Let me check.");
        assert_eq!(r.tool_calls.len(), 1);
        assert_eq!(r.tool_calls[0].name, "search_notes");
        assert_eq!(r.tool_calls[0].arguments, "{\"query\": \"firewall\"}");
    }

    #[test]
    fn error_event_is_an_error() {
        assert!(feed(include_str!("../../../tests/fixtures/anthropic_error.txt")).is_err());
    }

    #[test]
    fn converts_tool_round_trip() {
        let msgs = vec![
            ChatMessage::user("q"),
            ChatMessage::assistant(
                "thinking",
                vec![
                    ToolCall {
                        id: "a".into(),
                        name: "t".into(),
                        arguments: "{\"x\":1}".into(),
                    },
                    ToolCall {
                        id: "b".into(),
                        name: "t".into(),
                        arguments: "{}".into(),
                    },
                ],
            ),
            ChatMessage::tool_result("a", "r1"),
            ChatMessage::tool_result("b", "r2"),
        ];
        let out = convert_messages(&msgs);
        assert_eq!(out.len(), 3);
        assert_eq!(out[1]["content"][1]["type"], "tool_use");
        assert_eq!(out[1]["content"][1]["input"]["x"], 1);
        assert_eq!(out[2]["content"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn base_url_normalisation() {
        assert_eq!(base(""), "https://api.anthropic.com");
        assert_eq!(base("https://x.test/v1/"), "https://x.test");
    }
}

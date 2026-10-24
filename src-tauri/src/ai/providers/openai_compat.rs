//! OpenAI-compatible chat completions (also used by LM Studio).

use super::types::{ChatMessage, LlmRequest, LlmResponse, Role, ToolCall};
use crate::error::{AppError, AppResult};
use crate::settings::ProviderConfig;
use eventsource_stream::Eventsource;
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use tokio_util::sync::CancellationToken;

fn convert_message(m: &ChatMessage) -> Value {
    match m.role {
        Role::User => json!({"role": "user", "content": m.content}),
        Role::Assistant if m.tool_calls.is_empty() => {
            json!({"role": "assistant", "content": m.content})
        }
        Role::Assistant => json!({
            "role": "assistant",
            "content": if m.content.is_empty() { Value::Null } else { Value::String(m.content.clone()) },
            "tool_calls": m.tool_calls.iter().map(|c| json!({
                "id": c.id, "type": "function",
                "function": {"name": c.name, "arguments": if c.arguments.trim().is_empty() { "{}" } else { c.arguments.as_str() }}
            })).collect::<Vec<_>>(),
        }),
        Role::Tool => json!({"role": "tool", "tool_call_id": m.tool_call_id, "content": m.content}),
    }
}

/// Builds the request body.
pub fn build_body(model: &str, req: &LlmRequest, supports_tools: bool) -> Value {
    // No empty system message: some chat templates fail on one.
    let mut messages = if req.system.is_empty() {
        Vec::new()
    } else {
        vec![json!({"role": "system", "content": req.system})]
    };
    messages.extend(req.messages.iter().map(convert_message));
    let mut body = json!({
        "model": model,
        "stream": true,
        "messages": messages,
        "temperature": req.temperature,
    });
    if supports_tools && !req.tools.is_empty() {
        body["tools"] = Value::Array(
            req.tools
                .iter()
                .map(|t| {
                    json!({"type": "function", "function": {
                        "name": t.name, "description": t.description, "parameters": t.parameters
                    }})
                })
                .collect(),
        );
    }
    body
}

/// Accumulates streamed chunks.
#[derive(Default)]
pub struct Accumulator {
    text: String,
    calls: BTreeMap<usize, (String, String, String)>,
    /// Some servers number every parallel tool call 0. When a new call id shows up on an index
    /// that already has a different id, the call gets its own slot, and later chunks for that
    /// index (which carry no id) are routed to it.
    redirect: BTreeMap<usize, usize>,
}

/// First slot used for calls that had to be moved off a reused index.
const REDIRECT_BASE: usize = 1_000;

impl Accumulator {
    /// Feeds one `data:` payload. Returns the text delta, if any.
    pub fn push_chunk(&mut self, data: &str) -> AppResult<Option<String>> {
        let v: Value = serde_json::from_str(data)
            .map_err(|e| AppError::Provider(format!("Bad stream chunk: {e}")))?;
        if let Some(err) = v.get("error") {
            let msg = err
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("Unknown provider error");
            return Err(AppError::Provider(msg.to_string()));
        }
        let Some(delta) = v.pointer("/choices/0/delta") else {
            return Ok(None);
        };
        if let Some(calls) = delta.get("tool_calls").and_then(Value::as_array) {
            for (pos, c) in calls.iter().enumerate() {
                let reported = c
                    .get("index")
                    .and_then(Value::as_u64)
                    .map_or(pos, |i| i as usize);
                let mut idx = *self.redirect.get(&reported).unwrap_or(&reported);
                if let Some(id) = c
                    .get("id")
                    .and_then(Value::as_str)
                    .filter(|i| !i.is_empty())
                {
                    let reused = self
                        .calls
                        .get(&idx)
                        .is_some_and(|e| !e.0.is_empty() && e.0 != id);
                    if reused {
                        idx = REDIRECT_BASE + self.redirect.len();
                        self.redirect.insert(reported, idx);
                    }
                }
                let e = self.calls.entry(idx).or_default();
                if let Some(id) = c.get("id").and_then(Value::as_str) {
                    if e.0.is_empty() {
                        e.0 = id.to_string();
                    }
                }
                if let Some(n) = c.pointer("/function/name").and_then(Value::as_str) {
                    if e.1.is_empty() {
                        e.1 = n.to_string();
                    }
                }
                if let Some(a) = c.pointer("/function/arguments").and_then(Value::as_str) {
                    e.2.push_str(a);
                }
            }
        }
        match delta.get("content").and_then(Value::as_str) {
            Some(t) if !t.is_empty() => {
                self.text.push_str(t);
                Ok(Some(t.to_string()))
            }
            _ => Ok(None),
        }
    }

    /// Final response.
    pub fn finish(self) -> LlmResponse {
        let tool_calls = self
            .calls
            .into_iter()
            .filter(|(_, (_, name, _))| !name.is_empty())
            .map(|(i, (id, name, arguments))| ToolCall {
                id: if id.is_empty() {
                    format!("call_{i}")
                } else {
                    id
                },
                name,
                arguments,
            })
            .collect();
        LlmResponse {
            text: self.text,
            tool_calls,
        }
    }
}

pub(crate) async fn error_from_response(resp: reqwest::Response) -> AppError {
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    let detail = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|v| {
            v.pointer("/error/message")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or(body);
    AppError::Provider(format!(
        "Provider returned {status}: {}",
        detail.chars().take(500).collect::<String>()
    ))
}

/// True for an error from the server's chat template (for example Foundry Local's template
/// engine on SmolLM3: `Unknown method: replace at row 23, column 48`), as opposed to the model.
pub fn is_template_error(e: &AppError) -> bool {
    let m = e.to_string();
    m.contains("Unknown method")
        || (m.contains("at row") && m.contains("column") && m.contains("{%"))
}

/// The same request with the system text put at the start of the first user message, for a
/// chat template that cannot handle a system message.
pub fn without_system(req: &LlmRequest) -> LlmRequest {
    let mut out = req.clone();
    out.system = String::new();
    if let Some(first) = out.messages.iter_mut().find(|m| m.role == Role::User) {
        first.content = format!("{}\n\n{}", req.system.trim(), first.content);
    } else {
        out.messages
            .insert(0, super::types::ChatMessage::user(req.system.clone()));
    }
    out
}

/// Streams a chat completion. When the server's chat template fails before any text came (some
/// models in Foundry Local cannot take a system message), it is asked once more with the system
/// text in the first user message. Other errors and other models are not affected.
pub async fn chat_stream(
    client: &reqwest::Client,
    p: &ProviderConfig,
    key: Option<&str>,
    req: &LlmRequest,
    cancel: &CancellationToken,
    on_text: &mut (dyn FnMut(&str) + Send),
) -> AppResult<LlmResponse> {
    let mut sent = false;
    let first = {
        let mut counted = |t: &str| {
            sent = true;
            on_text(t);
        };
        stream_once(client, p, key, req, cancel, &mut counted).await
    };
    match first {
        Err(e) if !sent && !req.system.is_empty() && is_template_error(&e) => {
            tracing::info!("chat template failed with a system message; trying without: {e}");
            stream_once(client, p, key, &without_system(req), cancel, on_text).await
        }
        other => other,
    }
}

async fn stream_once(
    client: &reqwest::Client,
    p: &ProviderConfig,
    key: Option<&str>,
    req: &LlmRequest,
    cancel: &CancellationToken,
    on_text: &mut (dyn FnMut(&str) + Send),
) -> AppResult<LlmResponse> {
    let url = format!("{}/chat/completions", p.base_url.trim_end_matches('/'));
    let mut rb = client
        .post(url)
        .json(&build_body(&p.model, req, p.supports_tools));
    if let Some(k) = key.filter(|k| !k.is_empty()) {
        rb = rb.bearer_auth(k);
    }
    let resp = tokio::select! {
        r = rb.send() => r.map_err(|e| AppError::Provider(format!("Could not reach {}: {e}", p.base_url)))?,
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
                    if e.data.trim() == "[DONE]" { break; }
                    if let Some(t) = acc.push_chunk(&e.data)? { on_text(&t); }
                }
            }
        }
    }
    Ok(acc.finish())
}

/// Lists model ids from `GET {baseUrl}/models`.
pub async fn list_models(
    client: &reqwest::Client,
    base_url: &str,
    key: Option<&str>,
) -> AppResult<Vec<String>> {
    let mut rb = client.get(format!("{}/models", base_url.trim_end_matches('/')));
    if let Some(k) = key.filter(|k| !k.is_empty()) {
        rb = rb.bearer_auth(k);
    }
    let resp = rb
        .send()
        .await
        .map_err(|e| AppError::Provider(format!("Could not reach {base_url}: {e}")))?;
    if !resp.status().is_success() {
        return Err(error_from_response(resp).await);
    }
    let v: Value = resp.json().await?;
    let mut ids: Vec<String> = v
        .get("data")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|m| m.get("id").and_then(Value::as_str).map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    ids.sort();
    Ok(ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_template_error_is_told_apart_and_the_system_text_moves_into_the_question() {
        let e = AppError::Provider(
            "Provider returned 500: Unknown method: replace at row 23, column 48: {%- endif -%}"
                .into(),
        );
        assert!(is_template_error(&e));
        assert!(!is_template_error(&AppError::Provider(
            "Stream error: timed out".into()
        )));
        let req = LlmRequest {
            system: "Fix the text.".into(),
            messages: vec![ChatMessage::user("Teh cat")],
            tools: vec![],
            temperature: 0.3,
        };
        let body = build_body("m", &without_system(&req), false);
        assert_eq!(body["messages"].as_array().unwrap().len(), 1);
        assert_eq!(body["messages"][0]["role"], "user");
        assert_eq!(body["messages"][0]["content"], "Fix the text.\n\nTeh cat");
        // The normal request still has its system message.
        assert_eq!(
            build_body("m", &req, false)["messages"][0]["role"],
            "system"
        );
    }
    use crate::ai::providers::types::ToolDef;

    #[test]
    fn parses_fixture_stream() {
        let fixture = include_str!("../../../tests/fixtures/openai_stream.txt");
        let mut acc = Accumulator::default();
        let mut text = String::new();
        for block in fixture.split("\n\n").filter(|b| !b.trim().is_empty()) {
            let data = block.strip_prefix("data: ").unwrap();
            if data == "[DONE]" {
                break;
            }
            if let Some(t) = acc.push_chunk(data).unwrap() {
                text.push_str(&t);
            }
        }
        assert_eq!(text, "Hello world");
        let r = acc.finish();
        assert_eq!(r.text, "Hello world");
        assert_eq!(r.tool_calls.len(), 2);
        assert_eq!(r.tool_calls[0].name, "search_notes");
        assert_eq!(r.tool_calls[0].arguments, "{\"query\":\"firewall\"}");
        assert_eq!(r.tool_calls[1].id, "call_b");
    }

    #[test]
    fn error_chunk_is_an_error() {
        let mut acc = Accumulator::default();
        assert!(acc
            .push_chunk(r#"{"error":{"message":"model not loaded"}}"#)
            .is_err());
    }

    #[test]
    fn body_includes_tools_only_when_supported() {
        let req = LlmRequest {
            system: "sys".into(),
            messages: vec![
                ChatMessage::user("hi"),
                ChatMessage::assistant(
                    "",
                    vec![ToolCall {
                        id: "1".into(),
                        name: "t".into(),
                        arguments: "{}".into(),
                    }],
                ),
                ChatMessage::tool_result("1", "ok"),
            ],
            tools: vec![ToolDef {
                name: "t",
                description: "d",
                parameters: json!({"type": "object"}),
            }],
            temperature: 0.3,
        };
        let with = build_body("m", &req, true);
        assert!(with.get("tools").is_some());
        assert_eq!(with["messages"][0]["role"], "system");
        assert_eq!(
            with["messages"][2]["tool_calls"][0]["function"]["name"],
            "t"
        );
        assert_eq!(with["messages"][3]["role"], "tool");
        assert!(build_body("m", &req, false).get("tools").is_none());
    }

    #[test]
    fn a_tool_call_with_empty_arguments_is_sent_back_as_an_empty_object() {
        let req = LlmRequest {
            system: "sys".into(),
            messages: vec![ChatMessage::assistant(
                "",
                vec![ToolCall {
                    id: "1".into(),
                    name: "t".into(),
                    arguments: "".into(),
                }],
            )],
            tools: vec![],
            temperature: 0.3,
        };
        let body = build_body("m", &req, true);
        assert_eq!(
            body["messages"][1]["tool_calls"][0]["function"]["arguments"],
            "{}"
        );
    }

    fn chunk(call: Value) -> String {
        json!({"choices": [{"delta": {"tool_calls": [call]}}]}).to_string()
    }

    #[test]
    fn parallel_tool_calls_that_all_claim_index_zero_stay_separate() {
        let mut acc = Accumulator::default();
        for data in [
            chunk(
                json!({"index": 0, "id": "call_a", "function": {"name": "propose_delete", "arguments": "{\"path\":"}}),
            ),
            chunk(json!({"index": 0, "function": {"arguments": "\"a.md\"}"}})),
            chunk(
                json!({"index": 0, "id": "call_b", "function": {"name": "propose_delete", "arguments": "{\"path\":"}}),
            ),
            chunk(json!({"index": 0, "function": {"arguments": "\"b.md\"}"}})),
            chunk(
                json!({"index": 0, "id": "call_c", "function": {"name": "propose_delete", "arguments": "{\"path\":\"c.md\"}"}}),
            ),
        ] {
            acc.push_chunk(&data).unwrap();
        }
        let done = acc.finish();
        let got: Vec<(&str, &str)> = done
            .tool_calls
            .iter()
            .map(|c| (c.id.as_str(), c.arguments.as_str()))
            .collect();
        assert_eq!(
            got,
            vec![
                ("call_a", "{\"path\":\"a.md\"}"),
                ("call_b", "{\"path\":\"b.md\"}"),
                ("call_c", "{\"path\":\"c.md\"}"),
            ]
        );
    }

    #[test]
    fn correctly_numbered_parallel_calls_are_unchanged() {
        let mut acc = Accumulator::default();
        for data in [
            chunk(json!({"index": 0, "id": "a", "function": {"name": "x", "arguments": "{}"}})),
            chunk(json!({"index": 1, "id": "b", "function": {"name": "y", "arguments": "{}"}})),
        ] {
            acc.push_chunk(&data).unwrap();
        }
        let names: Vec<String> = acc
            .finish()
            .tool_calls
            .into_iter()
            .map(|c| c.name)
            .collect();
        assert_eq!(names, vec!["x", "y"]);
    }

    #[test]
    fn a_resent_id_on_the_same_call_is_not_a_new_call() {
        let mut acc = Accumulator::default();
        for data in [
            chunk(
                json!({"index": 0, "id": "a", "function": {"name": "x", "arguments": "{\"k\":"}}),
            ),
            chunk(json!({"index": 0, "id": "a", "function": {"arguments": "1}"}})),
        ] {
            acc.push_chunk(&data).unwrap();
        }
        let calls = acc.finish().tool_calls;
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].arguments, "{\"k\":1}");
    }
}

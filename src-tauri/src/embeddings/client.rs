//! Calls an OpenAI-compatible `/embeddings` endpoint (LM Studio, OpenAI-compatible servers).

use crate::ai::providers::{http_client, openai_compat::error_from_response};
use crate::error::{AppError, AppResult};
use futures_util::future::BoxFuture;
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;

/// Inputs per HTTP request.
pub const BATCH: usize = 16;

/// Turns texts into vectors. Boxed so the indexer can be tested with a fake.
pub type EmbedFn =
    Arc<dyn Fn(Vec<String>) -> BoxFuture<'static, AppResult<Vec<Vec<f32>>>> + Send + Sync>;

/// Parses an embeddings response. Vectors are returned in input order.
pub fn parse_response(body: &str, expected: usize) -> AppResult<Vec<Vec<f32>>> {
    let v: Value = serde_json::from_str(body).map_err(|_| bad())?;
    let data = v.get("data").and_then(Value::as_array).ok_or_else(bad)?;
    if data.len() != expected {
        return Err(bad());
    }
    let mut items: Vec<(u64, Vec<f32>)> = Vec::with_capacity(data.len());
    for item in data {
        let index = item
            .get("index")
            .and_then(Value::as_u64)
            .unwrap_or(u64::MAX);
        let vector: Vec<f32> = item
            .get("embedding")
            .and_then(Value::as_array)
            .ok_or_else(bad)?
            .iter()
            .map(|x| x.as_f64().map(|f| f as f32).ok_or_else(bad))
            .collect::<AppResult<_>>()?;
        if vector.is_empty() {
            return Err(bad());
        }
        items.push((index, vector));
    }
    items.sort_by_key(|(i, _)| *i);
    let dim = items.first().map(|(_, v)| v.len()).unwrap_or(0);
    if items.iter().any(|(_, v)| v.len() != dim) {
        return Err(bad());
    }
    Ok(items.into_iter().map(|(_, v)| v).collect())
}

fn bad() -> AppError {
    AppError::Provider("Unexpected embeddings response".into())
}

/// Builds the real embedding function for an endpoint.
pub fn http_embedder(base_url: String, model: String, api_key: Option<String>) -> EmbedFn {
    Arc::new(move |texts: Vec<String>| {
        let base_url = base_url.clone();
        let model = model.clone();
        let api_key = api_key.clone();
        Box::pin(async move {
            let client = http_client()?;
            let mut all = Vec::with_capacity(texts.len());
            for batch in texts.chunks(BATCH) {
                let mut rb = client
                    .post(format!("{}/embeddings", base_url.trim_end_matches('/')))
                    .json(&json!({ "model": model, "input": batch }))
                    .timeout(Duration::from_secs(60));
                if let Some(k) = api_key.as_deref().filter(|k| !k.is_empty()) {
                    rb = rb.bearer_auth(k);
                }
                let resp = rb.send().await.map_err(|e| {
                    AppError::Provider(format!("Could not reach the embedding server: {e}"))
                })?;
                if !resp.status().is_success() {
                    return Err(error_from_response(resp).await);
                }
                let body = resp
                    .text()
                    .await
                    .map_err(|e| AppError::Provider(e.to_string()))?;
                all.extend(parse_response(&body, batch.len())?);
            }
            Ok(all)
        }) as BoxFuture<'static, AppResult<Vec<Vec<f32>>>>
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_out_of_order_items_in_input_order() {
        let body =
            r#"{"data":[{"index":1,"embedding":[0.0,1.0]},{"index":0,"embedding":[1.0,0.0]}]}"#;
        let v = parse_response(body, 2).unwrap();
        assert_eq!(v, vec![vec![1.0, 0.0], vec![0.0, 1.0]]);
    }

    #[test]
    fn rejects_wrong_counts_missing_data_and_mixed_sizes() {
        assert!(parse_response(r#"{"data":[{"index":0,"embedding":[1.0]}]}"#, 2).is_err());
        assert!(parse_response(r#"{"nope":1}"#, 1).is_err());
        assert!(parse_response(
            r#"{"data":[{"index":0,"embedding":[1.0]},{"index":1,"embedding":[1.0,2.0]}]}"#,
            2
        )
        .is_err());
        assert!(parse_response("not json", 1).is_err());
    }
}

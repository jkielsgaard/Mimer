//! The calls into Windows for Phi Silica. Each runs on its own thread in the multithreaded COM
//! apartment, so it never depends on which thread Tauri or Tokio happens to use.

use super::bindings::{
    AIFeatureReadyResultState, AIFeatureReadyState, LanguageModel, LanguageModelOptions,
    LanguageModelResponseStatus,
};
use super::{next_piece, response_error, Access, FEATURE_ID};
use crate::error::{AppError, AppResult};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio_util::sync::CancellationToken;
use windows::core::{Ref, HSTRING};
use windows::ApplicationModel::{LimitedAccessFeatureStatus, LimitedAccessFeatures};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
use windows_future::{AsyncOperationProgressHandler, AsyncStatus};

/// Runs `f` on a new thread that has joined the multithreaded apartment.
fn in_mta<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    std::thread::spawn(move || {
        // S_FALSE (already joined) is fine too; a real failure shows up in the calls after it.
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        f()
    })
    .join()
    .map_err(|_| "The Windows call stopped unexpectedly".to_string())
}

fn hex(e: &windows::core::Error) -> String {
    format!("{:#010x}", e.code().0)
}

fn unlock_here(a: &Access) -> Result<String, String> {
    let r = LimitedAccessFeatures::TryUnlockFeature(
        &HSTRING::from(FEATURE_ID),
        &HSTRING::from(a.token.as_str()),
        &HSTRING::from(a.attestation.as_str()),
    )
    .and_then(|r| r.Status())
    .map_err(|e| hex(&e))?;
    Ok(match r {
        LimitedAccessFeatureStatus::Available => "Available",
        LimitedAccessFeatureStatus::AvailableWithoutToken => "AvailableWithoutToken",
        LimitedAccessFeatureStatus::Unavailable => "Unavailable",
        _ => "Unknown",
    }
    .into())
}

fn unlocked_here(a: &Access) -> Result<(), String> {
    match unlock_here(a)?.as_str() {
        "Available" | "AvailableWithoutToken" => Ok(()),
        other => Err(format!("Phi Silica is not unlocked ({other}).")),
    }
}

/// `LimitedAccessFeatures.TryUnlockFeature`, by the name of its status.
pub fn unlock(a: &Access) -> Result<String, String> {
    let a = a.clone();
    in_mta(move || unlock_here(&a))?
}

/// `LanguageModel.GetReadyState`, by the name of the state.
pub fn ready_state() -> Result<String, String> {
    in_mta(|| {
        let s = LanguageModel::GetReadyState().map_err(|e| hex(&e))?;
        Ok(match s {
            AIFeatureReadyState::Ready => "Ready",
            AIFeatureReadyState::NotReady => "NotReady",
            AIFeatureReadyState::NotSupportedOnCurrentSystem => "NotSupportedOnCurrentSystem",
            AIFeatureReadyState::DisabledByUser => "DisabledByUser",
            AIFeatureReadyState::CapabilityMissing => "CapabilityMissing",
            AIFeatureReadyState::NotCompatibleWithSystemHardware => {
                "NotCompatibleWithSystemHardware"
            }
            AIFeatureReadyState::OSUpdateNeeded => "OSUpdateNeeded",
            _ => "Unknown",
        }
        .to_string())
    })?
}

/// `LanguageModel.EnsureReadyAsync`: Windows fetches the model. Blocks until it is done.
pub fn ensure_ready(a: &Access, on_progress: impl Fn(f64) + Send + 'static) -> Result<(), String> {
    let a = a.clone();
    in_mta(move || {
        unlocked_here(&a)?;
        let op = LanguageModel::EnsureReadyAsync().map_err(|e| hex(&e))?;
        op.SetProgress(&AsyncOperationProgressHandler::new(
            move |_, p: Ref<f64>| {
                // Reported as 0–1 or 0–100; shown as 0–100.
                let p = *p;
                on_progress(if p <= 1.0 { p * 100.0 } else { p.min(100.0) });
                Ok(())
            },
        ))
        .map_err(|e| hex(&e))?;
        let r = op.join().map_err(|e| hex(&e))?;
        if r.Status().map_err(|e| hex(&e))? == AIFeatureReadyResultState::Success {
            return Ok(());
        }
        let text = r
            .ErrorDisplayText()
            .map(|t| t.to_string())
            .unwrap_or_default();
        let code = r
            .Error()
            .map(|h| format!("{:#010x}", h.0))
            .unwrap_or_default();
        Err(format!("Windows could not get the model. {text} {code}")
            .trim()
            .to_string())
    })?
}

enum Msg {
    Piece(String),
    Done(Result<String, String>),
}

/// Generates an answer, sending pieces of text as Windows reports them.
pub async fn generate(
    access: Access,
    prompt: String,
    temperature: f32,
    cancel: &CancellationToken,
    on_text: &mut (dyn FnMut(&str) + Send),
) -> AppResult<String> {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Msg>();
    let stop = Arc::new(AtomicBool::new(false));
    let stop_worker = Arc::clone(&stop);
    std::thread::spawn(move || {
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        let pieces = tx.clone();
        let result = (|| -> Result<String, String> {
            unlocked_here(&access)?;
            let model = LanguageModel::CreateAsync()
                .and_then(|op| op.join())
                .map_err(|e| format!("Phi Silica could not start ({}).", hex(&e)))?;
            let options = LanguageModelOptions::new().map_err(|e| hex(&e))?;
            options.SetTemperature(temperature).map_err(|e| hex(&e))?;
            let op = model
                .GenerateResponseAsync2(&HSTRING::from(prompt.as_str()), &options)
                .map_err(|e| hex(&e))?;
            op.SetProgress(&AsyncOperationProgressHandler::new(
                move |_, p: Ref<HSTRING>| {
                    let _ = pieces.send(Msg::Piece(p.to_string()));
                    Ok(())
                },
            ))
            .map_err(|e| hex(&e))?;
            loop {
                match op.Status().map_err(|e| hex(&e))? {
                    AsyncStatus::Started => {}
                    AsyncStatus::Canceled => return Ok(String::new()),
                    _ => break,
                }
                if stop_worker.load(Ordering::Relaxed) {
                    let _ = op.Cancel();
                }
                std::thread::sleep(Duration::from_millis(40));
            }
            let r = op.GetResults().map_err(|e| hex(&e))?;
            let status = r.Status().map_err(|e| hex(&e))?;
            if status == LanguageModelResponseStatus::Complete {
                return r.Text().map(|t| t.to_string()).map_err(|e| hex(&e));
            }
            let extended = r
                .ExtendedError()
                .map(|h| format!("{:#010x}", h.0))
                .unwrap_or_default();
            Err(response_error(&status_name(status), &extended))
        })();
        let _ = tx.send(Msg::Done(result));
    });

    let mut sent = String::new();
    loop {
        let msg = tokio::select! {
            m = rx.recv() => m,
            () = cancel.cancelled(), if !stop.load(Ordering::Relaxed) => {
                stop.store(true, Ordering::Relaxed);
                continue;
            }
        };
        match msg {
            Some(Msg::Piece(p)) => {
                let piece = next_piece(&sent, &p).to_string();
                if !piece.is_empty() {
                    on_text(&piece);
                    sent.push_str(&piece);
                }
            }
            Some(Msg::Done(Ok(full))) => {
                if stop.load(Ordering::Relaxed) {
                    return Ok(sent);
                }
                // Anything the progress reports did not carry yet.
                let Some(rest) = full.strip_prefix(sent.as_str()) else {
                    return Ok(sent);
                };
                if !rest.is_empty() {
                    on_text(rest);
                }
                return Ok(full);
            }
            Some(Msg::Done(Err(e))) => return Err(AppError::Provider(e)),
            None => {
                return Err(AppError::Provider(
                    "Phi Silica stopped without an answer.".into(),
                ))
            }
        }
    }
}

fn status_name(s: LanguageModelResponseStatus) -> String {
    match s {
        LanguageModelResponseStatus::BlockedByPolicy => "BlockedByPolicy",
        LanguageModelResponseStatus::PromptLargerThanContext => "PromptLargerThanContext",
        LanguageModelResponseStatus::PromptBlockedByContentModeration => {
            "PromptBlockedByContentModeration"
        }
        LanguageModelResponseStatus::ResponseBlockedByContentModeration => {
            "ResponseBlockedByContentModeration"
        }
        LanguageModelResponseStatus::UnsupportedLanguage => "UnsupportedLanguage",
        LanguageModelResponseStatus::LanguageMismatch => "LanguageMismatch",
        _ => "Error",
    }
    .into()
}

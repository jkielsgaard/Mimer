//! Phi Silica: the small language model built into Windows 11 on Copilot+ PCs, reached through
//! the Windows App SDK (`Microsoft.Windows.AI.Text.LanguageModel`). It runs on the PC's neural
//! processor, so notes never leave the computer.
//!
//! Microsoft only lets an app use it with a Limited Access Feature token tied to the app's
//! package identity, so Mimer only offers it in the Microsoft Store package. The token is not in
//! the program: `scripts/msix/Build-Msix.ps1` writes it to `phi-silica.json` next to `mimer.exe`
//! inside the package. Phi Silica cannot call tools, so the chat works without them, like with
//! other models without tools.
//!
//! The calls into Windows live in `win.rs` (Windows only); everything that decides what to show
//! or send is here and tested on every platform.

#[cfg(windows)]
#[allow(clippy::all, clippy::pedantic)]
mod bindings;
#[cfg(windows)]
mod win;

use crate::ai::providers::types::{LlmRequest, LlmResponse, Role};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio_util::sync::CancellationToken;
use ts_rs::TS;

/// The id of the one Phi Silica provider in the settings.
pub const PHI_ID: &str = "phi-silica";
/// The Limited Access Feature Microsoft gave Mimer access to.
pub const FEATURE_ID: &str = "com.microsoft.windows.ai.languagemodel";
/// The file with the token, next to `mimer.exe` in the Store package.
pub const ACCESS_FILE: &str = "phi-silica.json";
/// Progress (0–100) while Windows gets the model ready.
pub const PROGRESS_EVENT: &str = "phi://progress";
/// The text sent by "Test Phi Silica".
pub const TEST_PROMPT: &str = "Fix the spelling and grammar. Answer with the corrected sentence only.\n\nTeh meeting is on tuesday.";

/// How one line of "Phi Silica on this PC" looks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum CheckState {
    Ok,
    Warn,
    Fail,
    /// Not checked, because an earlier line failed.
    Unknown,
}

/// One line of "Phi Silica on this PC": plain words, and Windows' own answer for a bug report.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PhiCheck {
    pub state: CheckState,
    pub text: String,
    pub code: Option<String>,
}

impl PhiCheck {
    fn new(state: CheckState, text: &str, code: Option<&str>) -> Self {
        Self {
            state,
            text: text.into(),
            code: code.map(str::to_string),
        }
    }

    fn not_checked() -> Self {
        Self::new(CheckState::Unknown, "Not checked yet", None)
    }
}

/// What Windows says about Phi Silica on this PC.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PhiStatus {
    /// False outside the Store package: then nothing about Phi Silica is shown.
    pub shown: bool,
    pub access: PhiCheck,
    pub device: PhiCheck,
    pub model: PhiCheck,
    /// Windows can fetch the model ("Ask Windows to get it").
    pub can_get_model: bool,
}

impl PhiStatus {
    /// True when everything is green and Phi Silica can answer.
    pub fn ready(&self) -> bool {
        self.shown
            && self.access.state == CheckState::Ok
            && self.device.state == CheckState::Ok
            && self.model.state == CheckState::Ok
    }

    fn hidden() -> Self {
        Self {
            shown: false,
            access: PhiCheck::not_checked(),
            device: PhiCheck::not_checked(),
            model: PhiCheck::not_checked(),
            can_get_model: false,
        }
    }
}

/// The answer to "Test Phi Silica".
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PhiTest {
    pub ok: bool,
    pub prompt: String,
    pub answer: String,
    #[ts(type = "number")]
    pub millis: u64,
    /// What went wrong, when it did not work.
    pub message: String,
}

/// The token and the attestation sentence from Microsoft.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Access {
    pub token: String,
    pub attestation: String,
}

/// Reads `phi-silica.json` from the program folder. `None` when it is missing or incomplete.
pub fn read_access(dir: &Path) -> Option<Access> {
    let text = std::fs::read_to_string(dir.join(ACCESS_FILE)).ok()?;
    let a: Access = serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()?;
    let a = Access {
        token: a.token.trim().to_string(),
        attestation: a.attestation.trim().to_string(),
    };
    (!a.token.is_empty() && !a.attestation.is_empty()).then_some(a)
}

/// The access line from what `LimitedAccessFeatures.TryUnlockFeature` answered.
pub fn access_check(unlock: Result<&str, &str>) -> PhiCheck {
    match unlock {
        Ok(s @ ("Available" | "AvailableWithoutToken")) => {
            PhiCheck::new(CheckState::Ok, "Unlocked for Mimer", Some(s))
        }
        Ok(s @ "Unavailable") => PhiCheck::new(
            CheckState::Fail,
            "Windows did not unlock Phi Silica for this copy of Mimer.",
            Some(s),
        ),
        Ok(s) => PhiCheck::new(
            CheckState::Fail,
            "Windows does not know this access for Mimer.",
            Some(s),
        ),
        Err(e) => PhiCheck::new(
            CheckState::Fail,
            "Windows could not check the access.",
            Some(e),
        ),
    }
}

/// The "This PC" and "The model" lines from `LanguageModel.GetReadyState`, and whether Windows
/// can fetch the model.
pub fn ready_checks(state: Result<&str, &str>) -> (PhiCheck, PhiCheck, bool) {
    let pc_ok = || PhiCheck::new(CheckState::Ok, "Copilot+ PC with a neural processor", None);
    match state {
        Ok(s @ "Ready") => (
            pc_ok(),
            PhiCheck::new(CheckState::Ok, "Ready", Some(s)),
            false,
        ),
        Ok(s @ "NotReady") => (
            pc_ok(),
            PhiCheck::new(CheckState::Warn, "Windows has not got it yet.", Some(s)),
            true,
        ),
        Ok(s @ ("NotSupportedOnCurrentSystem" | "NotCompatibleWithSystemHardware")) => (
            PhiCheck::new(
                CheckState::Warn,
                "Phi Silica needs a Copilot+ PC with a neural processor. Use Foundry Local instead.",
                Some(s),
            ),
            PhiCheck::not_checked(),
            false,
        ),
        Ok(s @ "DisabledByUser") => (
            pc_ok(),
            PhiCheck::new(
                CheckState::Fail,
                "Windows AI is turned off on this PC, for example by a company policy. Mimer respects that.",
                Some(s),
            ),
            false,
        ),
        Ok(s @ "OSUpdateNeeded") => (
            pc_ok(),
            PhiCheck::new(
                CheckState::Warn,
                "Windows needs an update first (Settings → Windows Update).",
                Some(s),
            ),
            false,
        ),
        Ok(s @ "CapabilityMissing") => (
            pc_ok(),
            PhiCheck::new(
                CheckState::Fail,
                "This copy of Mimer may not use Windows AI (the package lacks a permission).",
                Some(s),
            ),
            false,
        ),
        Ok(s) => (
            PhiCheck::not_checked(),
            PhiCheck::new(CheckState::Fail, "Windows gave an unknown answer.", Some(s)),
            false,
        ),
        Err(e) => (
            PhiCheck::not_checked(),
            PhiCheck::new(
                CheckState::Fail,
                "Windows could not be asked about the model. The Windows App SDK may be missing.",
                Some(e),
            ),
            false,
        ),
    }
}

/// Puts the status together. `ready` is only asked when the access is unlocked.
pub fn compose(
    shown: bool,
    access: Option<&Access>,
    unlock: impl FnOnce(&Access) -> Result<String, String>,
    ready: impl FnOnce() -> Result<String, String>,
) -> PhiStatus {
    if !shown {
        return PhiStatus::hidden();
    }
    let Some(access) = access else {
        return PhiStatus {
            access: PhiCheck::new(
                CheckState::Fail,
                "This copy of Mimer has no access key for Phi Silica.",
                Some("NoToken"),
            ),
            ..PhiStatus::hidden_shown()
        };
    };
    let unlocked = unlock(access);
    let access = access_check(unlocked.as_deref().map_err(String::as_str));
    if access.state != CheckState::Ok {
        return PhiStatus {
            access,
            ..PhiStatus::hidden_shown()
        };
    }
    let state = ready();
    let (device, model, can_get_model) = ready_checks(state.as_deref().map_err(String::as_str));
    PhiStatus {
        shown: true,
        access,
        device,
        model,
        can_get_model,
    }
}

impl PhiStatus {
    fn hidden_shown() -> Self {
        Self {
            shown: true,
            ..Self::hidden()
        }
    }
}

/// The plain words for a `LanguageModelResponseStatus` that is not `Complete`.
pub fn response_error(status: &str, extended: &str) -> String {
    match status {
        "BlockedByPolicy" => "A policy on this PC does not let Phi Silica answer.".into(),
        "PromptLargerThanContext" => {
            "The text is too long for Phi Silica. Select a shorter part, or use Foundry Local for long notes.".into()
        }
        "PromptBlockedByContentModeration" | "ResponseBlockedByContentModeration" => {
            "Windows' content filter stopped this text, so Phi Silica did not answer.".into()
        }
        "UnsupportedLanguage" | "LanguageMismatch" => {
            "Phi Silica does not support this language yet.".into()
        }
        _ => format!("Phi Silica could not answer ({status} {extended})."),
    }
}

/// One prompt from the system text and the conversation: Phi Silica takes a single text.
pub fn prompt_of(req: &LlmRequest) -> String {
    let mut out = String::new();
    if !req.system.trim().is_empty() {
        out.push_str(req.system.trim());
        out.push_str("\n\n");
    }
    let only_one = req.messages.len() == 1 && req.messages[0].role == Role::User;
    if only_one {
        out.push_str(req.messages[0].content.trim());
        return out;
    }
    for m in &req.messages {
        let who = match m.role {
            Role::User => "User",
            Role::Assistant => "Assistant",
            Role::Tool => "Tool result",
        };
        out.push_str(who);
        out.push_str(": ");
        out.push_str(m.content.trim());
        out.push('\n');
    }
    out.push_str("Assistant:");
    out
}

/// The new text in one progress report. Windows may report each new piece or the whole text so
/// far; both give the same result.
pub fn next_piece<'a>(sent: &str, progress: &'a str) -> &'a str {
    if !sent.is_empty() && progress.len() > sent.len() && progress.starts_with(sent) {
        &progress[sent.len()..]
    } else if progress == sent {
        ""
    } else {
        progress
    }
}

/// True when Phi Silica can be offered: the Store package on Windows.
pub fn offered() -> bool {
    cfg!(windows) && crate::engine::paths::is_packaged()
}

fn program_dir() -> Option<std::path::PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
}

fn not_here() -> AppError {
    AppError::Provider(
        "Phi Silica only works in the Microsoft Store version of Mimer on a Copilot+ PC. Choose another AI under Settings → Built-in AI.".into(),
    )
}

/// The status shown under "Phi Silica on this PC". Blocks while Windows is asked.
pub fn status() -> PhiStatus {
    let access = program_dir().and_then(|d| read_access(&d));
    compose(offered(), access.as_ref(), unlock, ready_state)
}

#[cfg(windows)]
fn unlock(a: &Access) -> Result<String, String> {
    win::unlock(a)
}
#[cfg(not(windows))]
fn unlock(_: &Access) -> Result<String, String> {
    Err("Not Windows".into())
}

#[cfg(windows)]
fn ready_state() -> Result<String, String> {
    win::ready_state()
}
#[cfg(not(windows))]
fn ready_state() -> Result<String, String> {
    Err("Not Windows".into())
}

/// Unlocks the feature and checks that the model is ready, or says why not in plain words.
fn require_ready() -> AppResult<Access> {
    if !offered() {
        return Err(not_here());
    }
    let access = program_dir()
        .and_then(|d| read_access(&d))
        .ok_or_else(not_here)?;
    let s = compose(true, Some(&access), unlock, ready_state);
    if s.ready() {
        return Ok(access);
    }
    let failing = [&s.access, &s.device, &s.model]
        .into_iter()
        .find(|c| c.state != CheckState::Ok)
        .map_or_else(String::new, |c| c.text.clone());
    Err(AppError::Provider(format!(
        "Phi Silica is not ready: {failing} See Settings → Built-in AI."
    )))
}

/// Asks Windows to fetch the model; `on_progress` gets 0–100. Returns the new status.
pub async fn ensure_ready(on_progress: impl Fn(f64) + Send + 'static) -> AppResult<PhiStatus> {
    if !offered() {
        return Err(not_here());
    }
    let access = program_dir()
        .and_then(|d| read_access(&d))
        .ok_or_else(not_here)?;
    let stopped =
        |e: tokio::task::JoinError| AppError::Provider(format!("Phi Silica stopped: {e}"));
    tokio::task::spawn_blocking(move || fetch_model(&access, on_progress))
        .await
        .map_err(stopped)?
        .map_err(AppError::Provider)?;
    tokio::task::spawn_blocking(status).await.map_err(stopped)
}

#[cfg(windows)]
fn fetch_model(a: &Access, on_progress: impl Fn(f64) + Send + 'static) -> Result<(), String> {
    win::ensure_ready(a, on_progress)
}
#[cfg(not(windows))]
fn fetch_model(_: &Access, _: impl Fn(f64) + Send + 'static) -> Result<(), String> {
    Err("Not Windows".into())
}

/// Answers a request, sending the text as it comes. Tools are not used.
pub async fn chat(
    req: &LlmRequest,
    cancel: &CancellationToken,
    on_text: &mut (dyn FnMut(&str) + Send),
) -> AppResult<LlmResponse> {
    let access = tokio::task::spawn_blocking(require_ready)
        .await
        .map_err(|e| AppError::Provider(format!("Phi Silica stopped: {e}")))??;
    let prompt = prompt_of(req);
    let text = generate(access, prompt, req.temperature, cancel, on_text).await?;
    Ok(LlmResponse {
        text,
        tool_calls: vec![],
    })
}

/// "Test Phi Silica": the test sentence, the answer and how long it took.
pub async fn test() -> PhiTest {
    let started = std::time::Instant::now();
    let result = async {
        let access = tokio::task::spawn_blocking(require_ready)
            .await
            .map_err(|e| AppError::Provider(format!("Phi Silica stopped: {e}")))??;
        let mut ignore = |_: &str| {};
        generate(
            access,
            TEST_PROMPT.into(),
            0.2,
            &CancellationToken::new(),
            &mut ignore,
        )
        .await
    }
    .await;
    let millis = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    let prompt = "Fix the spelling: Teh meeting is on tuesday.".to_string();
    match result {
        Ok(answer) => PhiTest {
            ok: !answer.trim().is_empty(),
            prompt,
            answer: answer.trim().to_string(),
            millis,
            message: String::new(),
        },
        Err(e) => PhiTest {
            ok: false,
            prompt,
            answer: String::new(),
            millis,
            message: e.to_string(),
        },
    }
}

#[cfg(windows)]
async fn generate(
    access: Access,
    prompt: String,
    temperature: f32,
    cancel: &CancellationToken,
    on_text: &mut (dyn FnMut(&str) + Send),
) -> AppResult<String> {
    win::generate(access, prompt, temperature, cancel, on_text).await
}

#[cfg(not(windows))]
async fn generate(
    _: Access,
    _: String,
    _: f32,
    _: &CancellationToken,
    _: &mut (dyn FnMut(&str) + Send),
) -> AppResult<String> {
    Err(not_here())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::providers::types::ChatMessage;

    fn access() -> Access {
        Access {
            token: "t".into(),
            attestation: "a".into(),
        }
    }

    #[test]
    fn nothing_is_shown_outside_the_store_package_and_windows_is_not_asked() {
        let s = compose(false, Some(&access()), |_| panic!(), || panic!());
        assert!(!s.shown);
        assert!(!s.ready());
    }

    #[test]
    fn without_a_key_or_unlock_the_rest_is_not_checked() {
        let s = compose(true, None, |_| panic!(), || panic!());
        assert_eq!(s.access.state, CheckState::Fail);
        assert_eq!(s.access.code.as_deref(), Some("NoToken"));
        assert_eq!(s.model.state, CheckState::Unknown);

        let s = compose(
            true,
            Some(&access()),
            |_| Ok("Unavailable".into()),
            || panic!(),
        );
        assert_eq!(s.access.state, CheckState::Fail);
        assert_eq!(s.access.code.as_deref(), Some("Unavailable"));
        assert_eq!(s.device.state, CheckState::Unknown);
    }

    #[test]
    fn a_ready_copilot_pc_is_all_green() {
        let s = compose(
            true,
            Some(&access()),
            |a| {
                assert_eq!(a.token, "t");
                Ok("Available".into())
            },
            || Ok("Ready".into()),
        );
        assert!(s.ready(), "{s:?}");
        assert!(!s.can_get_model);
    }

    #[test]
    fn each_ready_state_says_what_to_do() {
        let (_, model, get) = ready_checks(Ok("NotReady"));
        assert_eq!(model.state, CheckState::Warn);
        assert!(get);
        let (pc, _, get) = ready_checks(Ok("NotSupportedOnCurrentSystem"));
        assert!(pc.text.contains("Foundry Local"));
        assert!(!get);
        let (_, model, _) = ready_checks(Ok("DisabledByUser"));
        assert_eq!(model.state, CheckState::Fail);
        assert!(model.text.contains("respects"));
        let (_, model, _) = ready_checks(Err("0x80040154"));
        assert_eq!(model.code.as_deref(), Some("0x80040154"));
        assert!(model.text.contains("Windows App SDK"));
    }

    #[test]
    fn the_key_file_is_read_and_must_be_complete() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_access(dir.path()).is_none());
        std::fs::write(
            dir.path().join(ACCESS_FILE),
            r#"{"token":" x ","attestation":""}"#,
        )
        .unwrap();
        assert!(read_access(dir.path()).is_none());
        std::fs::write(
            dir.path().join(ACCESS_FILE),
            "\u{feff}{\"token\":\"x\",\"attestation\":\"y has registered\"}",
        )
        .unwrap();
        let a = read_access(dir.path()).unwrap();
        assert_eq!(a.token, "x");
        assert_eq!(a.attestation, "y has registered");
    }

    #[test]
    fn the_conversation_becomes_one_prompt() {
        let req = LlmRequest {
            system: "You fix text.".into(),
            messages: vec![ChatMessage::user("Teh cat")],
            tools: vec![],
            temperature: 0.3,
        };
        assert_eq!(prompt_of(&req), "You fix text.\n\nTeh cat");
        let req = LlmRequest {
            system: String::new(),
            messages: vec![
                ChatMessage::user("Hi"),
                ChatMessage::assistant("Hello", vec![]),
                ChatMessage::user("What is in the note?"),
            ],
            tools: vec![],
            temperature: 0.7,
        };
        assert_eq!(
            prompt_of(&req),
            "User: Hi\nAssistant: Hello\nUser: What is in the note?\nAssistant:"
        );
    }

    #[test]
    fn progress_as_pieces_or_as_the_whole_text_gives_the_same() {
        assert_eq!(next_piece("", "The"), "The");
        assert_eq!(next_piece("The", " meeting"), " meeting");
        assert_eq!(next_piece("The", "The meeting"), " meeting");
        assert_eq!(next_piece("The meeting", "The meeting"), "");
    }

    #[test]
    fn response_errors_are_plain_words() {
        assert!(response_error("PromptLargerThanContext", "").contains("too long"));
        assert!(response_error("Error", "0x1").contains("0x1"));
    }
}

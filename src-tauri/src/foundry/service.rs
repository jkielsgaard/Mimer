//! What the commands do for Foundry Local: list models, download, wake, sleep, remove, and keep
//! the status up to date. The heavy work runs in the helper process (see `helper`); this module
//! starts it, follows what it prints and turns that into a status the screen can show.

use super::{
    installed_file, read_installed, tool_models, write_installed, FoundryInstalled, FoundryModel,
    FoundryStatus, Inner, FOUNDRY_ID, STATUS_EVENT,
};
use crate::engine::process::{self, Launch, Running};
use crate::engine::{self, EngineState, InstallProgress, Phase, Problem};
use crate::error::{AppError, AppResult};
use crate::settings::{self, ProviderConfig};
use crate::state::AppState;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio_util::sync::CancellationToken;

/// How long loading a model may take before Mimer gives up.
const WAKE_TIMEOUT: Duration = Duration::from_secs(20 * 60);
/// How long reading the model list may take.
const CATALOG_TIMEOUT: Duration = Duration::from_secs(180);

fn lock_error() -> AppError {
    AppError::Io("State lock poisoned".into())
}

fn runtime<R: Runtime>(app: &AppHandle<R>) -> tauri::State<'_, AppState> {
    app.state::<AppState>()
}

fn with_inner<R: Runtime, T>(app: &AppHandle<R>, f: impl FnOnce(&mut Inner) -> T) -> Option<T> {
    let state = runtime(app);
    let mut guard = state.foundry.inner.lock().ok()?;
    Some(f(&mut guard))
}

/// Where Foundry Local keeps its files: inside Mimer's own `mimer-ai` folder, so uninstalling
/// Mimer on Windows removes them too.
fn root<R: Runtime>(app: &AppHandle<R>) -> AppResult<PathBuf> {
    Ok(engine::paths::dirs(app)?.root.join("foundry"))
}

fn native<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let resources = app.path().resource_dir().ok();
    let exe = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(std::path::Path::to_path_buf));
    super::native_dir(resources.as_deref(), exe.as_deref())
}

/// Why Foundry Local cannot be used here, or `None` when it can.
pub fn unavailable_reason<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    if cfg!(target_os = "macos") {
        return Some("Foundry Local is not included in the macOS version of Mimer yet.".into());
    }
    if native(app).is_none() {
        return Some(
            "This build of Mimer does not include Foundry Local (its library is missing).".into(),
        );
    }
    None
}

/// A caution that goes with Foundry Local on this system.
fn note() -> Option<String> {
    cfg!(target_os = "linux").then(|| {
        "Foundry Local on Linux is new. On some systems its engine crashed when a model was downloaded. Mimer itself is not affected when that happens (the engine runs in a separate process); use llama.cpp or LM Studio then.".into()
    })
}

// ---------------------------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------------------------

/// The current status, put together from the files on disk and the runtime state.
pub fn status<R: Runtime>(app: &AppHandle<R>) -> FoundryStatus {
    let state = runtime(app);
    let chosen = state.settings_snapshot().ai.foundry.model;
    let (folder, installed, disk) = match root(app) {
        Ok(r) => {
            let list = read_installed(&r);
            (
                r.display().to_string(),
                list,
                engine::service::folder_size(&r),
            )
        }
        Err(_) => (String::new(), Vec::new(), 0),
    };
    let reason = unavailable_reason(app);
    let has_model = installed.iter().any(|m| m.alias == chosen);
    let Ok(inner) = state.foundry.inner.lock() else {
        return FoundryStatus {
            state: EngineState::Error,
            message: "Internal error".into(),
            problem: None,
            install: None,
            installed,
            active_model: None,
            available: reason.is_none(),
            unavailable_reason: reason,
            note: note(),
            folder,
            disk_bytes: disk,
            restart_needed: false,
            log: Vec::new(),
        };
    };
    let st = match inner.phase {
        Phase::Installing => EngineState::Installing,
        Phase::Waking => EngineState::Waking,
        Phase::Awake => EngineState::Awake,
        Phase::Sleeping => EngineState::Sleeping,
        Phase::Idle if inner.problem.is_some() => EngineState::Error,
        Phase::Idle if has_model => EngineState::Asleep,
        Phase::Idle => EngineState::NotInstalled,
    };
    let message = if !inner.message.is_empty() {
        inner.message.clone()
    } else {
        match st {
            EngineState::NotInstalled => "No Foundry Local model is downloaded yet".into(),
            EngineState::Asleep => "Mimer is asleep".into(),
            EngineState::Awake => "Mimer is awake".into(),
            _ => String::new(),
        }
    };
    let log = match &inner.running {
        Some(r) => r.log(),
        None => inner.last_log.clone(),
    };
    let tail: Vec<String> = log
        .iter()
        .skip(log.len().saturating_sub(60))
        .cloned()
        .collect();
    let restart_needed = inner.phase == Phase::Awake
        && inner
            .active_model
            .as_deref()
            .is_some_and(|active| active != chosen);
    FoundryStatus {
        state: st,
        message,
        problem: inner.problem.clone(),
        install: inner.install.clone(),
        installed,
        active_model: inner.active_model.clone(),
        available: reason.is_none(),
        unavailable_reason: reason,
        note: note(),
        folder,
        disk_bytes: disk,
        restart_needed,
        log: tail,
    }
}

/// Sends the status to the screen.
pub fn emit<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.emit(STATUS_EVENT, status(app));
}

fn set_problem<R: Runtime>(app: &AppHandle<R>, problem: Problem) {
    tracing::warn!("Foundry Local: {}", problem.title);
    with_inner(app, |i| {
        i.phase = Phase::Idle;
        i.message = problem.title.clone();
        i.problem = Some(problem);
        i.install = None;
    });
    emit(app);
}

// ---------------------------------------------------------------------------------------------
// Running the helper
// ---------------------------------------------------------------------------------------------

fn parse_lines(lines: &[String]) -> Vec<Value> {
    lines
        .iter()
        .filter(|l| l.starts_with('{'))
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .collect()
}

/// What a helper job ended with.
enum JobEnd {
    /// The helper said it was done (or ready); the last line of the wanted kind.
    Finished(Value),
    /// The user cancelled.
    Cancelled,
    /// It failed: the helper's message, its exit, and its last lines.
    Failed {
        message: Option<String>,
        exit: Option<process::ExitInfo>,
        log: Vec<String>,
    },
    /// It took too long.
    TimedOut(Vec<String>),
}

fn launch<R: Runtime>(
    app: &AppHandle<R>,
    command: &str,
    extra: &[&str],
    log_name: &str,
) -> AppResult<(Running, PathBuf)> {
    let lib = native(app).ok_or_else(|| {
        AppError::Settings(
            unavailable_reason(app).unwrap_or_else(|| "Foundry Local is missing".into()),
        )
    })?;
    let data = root(app)?;
    let exe = std::env::current_exe().map_err(|e| AppError::Io(e.to_string()))?;
    let mut args: Vec<String> = vec![
        super::helper::FLAG.into(),
        command.into(),
        "--lib".into(),
        lib.display().to_string(),
        "--data".into(),
        data.display().to_string(),
    ];
    args.extend(extra.iter().map(|s| (*s).to_string()));
    let launch = Launch {
        server: exe,
        dir: lib,
        args,
        token: String::new(),
        log_file: data.join("logs").join(log_name),
    };
    let running = process::spawn(&launch).map_err(|e| {
        AppError::Io(format!(
            "The Foundry Local helper could not be started: {e}"
        ))
    })?;
    Ok((running, data))
}

/// Follows a helper until a line of type `until` arrives, it fails, is cancelled or times out.
/// `on_progress` gets the newest progress line each time it changes.
async fn follow(
    running: &Running,
    until: &str,
    cancel: &CancellationToken,
    timeout: Duration,
    mut on_progress: impl FnMut(&Value),
) -> JobEnd {
    let started = Instant::now();
    let mut last_progress: Option<Value> = None;
    loop {
        if cancel.is_cancelled() {
            running.stop(Duration::from_secs(5));
            return JobEnd::Cancelled;
        }
        let log = running.log();
        let msgs = parse_lines(&log);
        if let Some(done) = msgs.iter().rev().find(|m| m["type"] == until).cloned() {
            return JobEnd::Finished(done);
        }
        let progress = msgs.iter().rev().find(|m| m["type"] == "progress").cloned();
        if progress != last_progress {
            if let Some(p) = &progress {
                on_progress(p);
            }
            last_progress = progress;
        }
        let error = msgs
            .iter()
            .rev()
            .find(|m| m["type"] == "error")
            .and_then(|m| m["message"].as_str().map(String::from));
        if let Some(exit) = running.exit() {
            // Give the readers a moment: the last lines may arrive just after the exit.
            tokio::time::sleep(Duration::from_millis(150)).await;
            let log = running.log();
            if let Some(done) = parse_lines(&log)
                .into_iter()
                .rev()
                .find(|m| m["type"] == until)
            {
                return JobEnd::Finished(done);
            }
            return JobEnd::Failed {
                message: error,
                exit: Some(exit),
                log,
            };
        }
        if started.elapsed() > timeout {
            let log = running.log();
            running.stop(Duration::from_secs(5));
            return JobEnd::TimedOut(log);
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}

/// Turns a failed helper into a problem the user can act on.
fn problem_from(what: &str, end: JobEnd) -> Option<Problem> {
    match end {
        JobEnd::Finished(_) | JobEnd::Cancelled => None,
        JobEnd::TimedOut(log) => Some(Problem {
            title: format!("{what} took too long"),
            steps: vec![
                "Check the internet connection and try again.".into(),
                "Press Show details and send them if it keeps happening.".into(),
            ],
            details: log.join("\n"),
        }),
        JobEnd::Failed { message, exit, log } => {
            let crashed = exit.is_some_and(|e| e.signal.is_some() || e.code.is_some_and(|c| c < 0));
            let title = if crashed && message.is_none() {
                format!("{what}: the Foundry Local engine crashed")
            } else {
                format!("{what} did not work")
            };
            let mut steps = Vec::new();
            if let Some(m) = &message {
                steps.push(m.clone());
            }
            if crashed {
                steps.push(
                    "The engine stopped without a message. Mimer itself was not affected. Try again; if it repeats, use the built-in AI with llama.cpp or LM Studio instead, and send the details.".into(),
                );
            } else {
                steps.push(
                    "Check the internet connection and that Windows is up to date (Foundry Local needs Windows 11 version 24H2 or later).".into(),
                );
            }
            let mut details = format!(
                "exit: {}",
                exit.map_or("unknown".into(), |e| format!(
                    "code {:?}, signal {:?}",
                    e.code, e.signal
                ))
            );
            details.push('\n');
            details.push_str(&log.join("\n"));
            Some(Problem {
                title,
                steps,
                details,
            })
        }
    }
}

// ---------------------------------------------------------------------------------------------
// The model list
// ---------------------------------------------------------------------------------------------

fn models_from(done: &Value) -> Vec<FoundryModel> {
    done["models"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|m| serde_json::from_value::<FoundryModel>(m.clone()).ok())
                .collect()
        })
        .unwrap_or_default()
}

/// The models Foundry Local offers on this computer that can call tools (the helper reads them
/// from Microsoft's catalog). The answer is kept for the session unless `refresh` is set.
pub async fn catalog<R: Runtime>(
    app: &AppHandle<R>,
    refresh: bool,
) -> AppResult<Vec<FoundryModel>> {
    if !refresh {
        if let Some(Some(list)) = with_inner(app, |i| i.catalog.clone()) {
            return Ok(list);
        }
    }
    if let Some(reason) = unavailable_reason(app) {
        return Err(AppError::Settings(reason));
    }
    let (running, _) = launch(app, "catalog", &[], "catalog.log")?;
    let cancel = CancellationToken::new();
    let end = follow(&running, "catalog", &cancel, CATALOG_TIMEOUT, |_| {}).await;
    running.stop(Duration::from_secs(3));
    match end {
        JobEnd::Finished(done) => {
            let list = tool_models(models_from(&done));
            with_inner(app, |i| i.catalog = Some(list.clone()));
            Ok(list)
        }
        other => {
            let p = problem_from("Reading the model list", other);
            Err(AppError::Provider(
                p.map_or("The model list could not be read".into(), |p| {
                    p.steps.first().cloned().unwrap_or(p.title)
                }),
            ))
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------------------------

/// Starts downloading a model (and the hardware parts first). Returns at once; progress and
/// problems arrive through the status.
pub fn start_install<R: Runtime>(
    app: &AppHandle<R>,
    alias: String,
    use_for_mimer: bool,
) -> AppResult<()> {
    if let Some(reason) = unavailable_reason(app) {
        return Err(AppError::Settings(reason));
    }
    let cancel = CancellationToken::new();
    {
        let state = runtime(app);
        let mut inner = state.foundry.inner.lock().map_err(|_| lock_error())?;
        match inner.phase {
            Phase::Installing => return Ok(()),
            Phase::Awake | Phase::Waking | Phase::Sleeping => {
                return Err(AppError::Conflict(
                    "Put Mimer to sleep before downloading another model".into(),
                ))
            }
            Phase::Idle => {}
        }
        inner.problem = None;
        inner.phase = Phase::Installing;
        inner.message = "Preparing the download…".into();
        inner.install = Some(InstallProgress {
            phase: "hardware".into(),
            file: alias.clone(),
            done: 0,
            total: 100,
        });
        inner.install_cancel = Some(cancel.clone());
    }
    emit(app);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        install_task(&app, &alias, use_for_mimer, &cancel).await;
        with_inner(&app, |i| i.install_cancel = None);
    });
    Ok(())
}

async fn install_task<R: Runtime>(
    app: &AppHandle<R>,
    alias: &str,
    use_for_mimer: bool,
    cancel: &CancellationToken,
) {
    let (running, data) = match launch(app, "install", &["--alias", alias], "install.log") {
        Ok(x) => x,
        Err(e) => {
            set_problem(
                app,
                Problem {
                    title: "The download could not start".into(),
                    steps: vec![e.to_string()],
                    details: String::new(),
                },
            );
            return;
        }
    };
    let app2 = app.clone();
    let alias2 = alias.to_string();
    let end = follow(
        &running,
        "done",
        cancel,
        Duration::from_secs(6 * 60 * 60),
        move |p| {
            let phase = p["phase"].as_str().unwrap_or("model").to_string();
            let pct = p["pct"].as_f64().unwrap_or(0.0).clamp(0.0, 100.0);
            let message = if phase == "hardware" {
                format!("Setting up the hardware parts… {pct:.0}%")
            } else {
                format!("Downloading the model… {pct:.0}%")
            };
            with_inner(&app2, |i| {
                i.message = message;
                i.install = Some(InstallProgress {
                    phase,
                    file: alias2.clone(),
                    done: pct as u64,
                    total: 100,
                });
            });
            emit(&app2);
        },
    )
    .await;
    running.stop(Duration::from_secs(3));
    match end {
        JobEnd::Finished(done) => {
            let size_mb = done["sizeMb"].as_u64().unwrap_or(0);
            let name = with_inner(app, |i| {
                i.catalog
                    .as_ref()
                    .and_then(|c| c.iter().find(|m| m.alias == alias).map(|m| m.name.clone()))
            })
            .flatten()
            .unwrap_or_else(|| alias.to_string());
            let mut list = read_installed(&data);
            list.retain(|m| m.alias != alias);
            list.push(FoundryInstalled {
                alias: alias.to_string(),
                name,
                size_mb,
            });
            if let Err(e) = write_installed(&data, &list) {
                tracing::warn!("could not save {}: {e}", installed_file(&data).display());
            }
            let alias_s = alias.to_string();
            engine::service::change_settings(app, move |s| {
                s.ai.foundry.model = alias_s;
                s.ensure_foundry_provider();
                if use_for_mimer {
                    s.ai.default_provider_id = FOUNDRY_ID.into();
                }
            });
            // The model list now shows where each model runs, with the hardware parts in place.
            with_inner(app, |i| {
                i.phase = Phase::Idle;
                i.message = String::new();
                i.install = None;
                i.catalog = None;
            });
            emit(app);
        }
        JobEnd::Cancelled => {
            with_inner(app, |i| {
                i.phase = Phase::Idle;
                i.message = "The download was cancelled".into();
                i.install = None;
            });
            emit(app);
        }
        other => {
            let problem = problem_from("The download", other).unwrap_or(Problem {
                title: "The download did not work".into(),
                steps: Vec::new(),
                details: String::new(),
            });
            set_problem(app, problem);
        }
    }
}

/// Cancels a running download.
pub fn cancel_install<R: Runtime>(app: &AppHandle<R>) {
    if let Some(Some(t)) = with_inner(app, |i| i.install_cancel.clone()) {
        t.cancel();
    }
}

// ---------------------------------------------------------------------------------------------
// Wake and sleep
// ---------------------------------------------------------------------------------------------

fn not_installed() -> Problem {
    Problem {
        title: "No Foundry Local model is chosen and downloaded".into(),
        steps: vec![
            "Open Settings → Built-in AI.".into(),
            "Choose Foundry Local, pick a model and press Download.".into(),
        ],
        details: String::new(),
    }
}

/// Loads the chosen model. Returns at once; the result arrives in the status.
pub fn wake<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    if let Some(reason) = unavailable_reason(app) {
        return Err(AppError::Settings(reason));
    }
    let state = runtime(app);
    let alias = state.settings_snapshot().ai.foundry.model;
    let data = root(app)?;
    {
        let mut inner = state.foundry.inner.lock().map_err(|_| lock_error())?;
        match inner.phase {
            Phase::Awake | Phase::Waking => return Ok(()),
            Phase::Installing | Phase::Sleeping => {
                return Err(AppError::Conflict(
                    "Wait until Mimer has finished what it is doing".into(),
                ))
            }
            Phase::Idle => {}
        }
        inner.problem = None;
        inner.message = "Starting Foundry Local…".into();
        inner.phase = Phase::Waking;
        inner.last_log.clear();
    }
    if alias.is_empty() || !read_installed(&data).iter().any(|m| m.alias == alias) {
        set_problem(app, not_installed());
        return Ok(());
    }
    let cancel = CancellationToken::new();
    with_inner(app, |i| i.wake_cancel = Some(cancel.clone()));
    emit(app);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        wake_task(&app, &alias, &cancel).await;
        with_inner(&app, |i| i.wake_cancel = None);
    });
    Ok(())
}

async fn wake_task<R: Runtime>(app: &AppHandle<R>, alias: &str, cancel: &CancellationToken) {
    let port = match process::free_port() {
        Ok(p) => p,
        Err(e) => {
            set_problem(
                app,
                Problem {
                    title: "No network port is available".into(),
                    steps: vec![
                        "Mimer needs one free port on this computer (127.0.0.1) to talk to Foundry Local.".into(),
                        "Close programs that use many network ports, or restart the computer.".into(),
                    ],
                    details: e.to_string(),
                },
            );
            return;
        }
    };
    let (running, _) = match launch(
        app,
        "serve",
        &["--alias", alias, "--port", &port.to_string()],
        "serve.log",
    ) {
        Ok(x) => x,
        Err(e) => {
            set_problem(
                app,
                Problem {
                    title: "Foundry Local could not be started".into(),
                    steps: vec![e.to_string()],
                    details: String::new(),
                },
            );
            return;
        }
    };
    let running = Arc::new(running);
    with_inner(app, |i| i.running = Some(running.clone()));
    let app2 = app.clone();
    let started = Instant::now();
    let end = follow(&running, "ready", cancel, WAKE_TIMEOUT, move |_| {
        with_inner(&app2, |i| {
            i.message = format!("Loading the model… {} s", started.elapsed().as_secs());
        });
        emit(&app2);
    })
    .await;
    match end {
        JobEnd::Finished(ready) => {
            let model = ready["model"].as_str().unwrap_or(alias).to_string();
            let url = ready["urls"]
                .as_array()
                .and_then(|u| u.first())
                .and_then(Value::as_str)
                .map_or_else(
                    || format!("http://127.0.0.1:{port}"),
                    |u| u.trim_end_matches('/').to_string(),
                );
            {
                let state = runtime(app);
                let guard = state.settings.write();
                if let Ok(mut s) = guard {
                    if let Some(p) = s.ai.providers.iter_mut().find(|p| p.id == FOUNDRY_ID) {
                        p.base_url = format!("{url}/v1");
                        p.model = model;
                    }
                }
            }
            with_inner(app, |i| {
                i.phase = Phase::Awake;
                i.message = "Mimer is awake".into();
                i.active_model = Some(alias.to_string());
                i.last_used = Instant::now();
            });
            emit(app);
            watch_running(app.clone(), running);
        }
        JobEnd::Cancelled => {
            clear_running(app, &running);
            with_inner(app, |i| {
                i.phase = Phase::Idle;
                i.message = String::new();
            });
            emit(app);
        }
        other => {
            let log = running.log();
            clear_running(app, &running);
            with_inner(app, |i| i.last_log = log);
            let problem = problem_from("Waking Mimer", other).unwrap_or(not_installed());
            set_problem(app, problem);
        }
    }
}

fn clear_running<R: Runtime>(app: &AppHandle<R>, running: &Arc<Running>) {
    running.stop(Duration::from_secs(5));
    with_inner(app, |i| {
        if i.running.as_ref().is_some_and(|r| Arc::ptr_eq(r, running)) {
            i.running = None;
            i.active_model = None;
        }
    });
}

/// Notices when the helper stops by itself and says so.
fn watch_running<R: Runtime>(app: AppHandle<R>, running: Arc<Running>) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;
            let still_ours = with_inner(&app, |i| {
                i.phase == Phase::Awake
                    && i.running.as_ref().is_some_and(|r| Arc::ptr_eq(r, &running))
            })
            .unwrap_or(false);
            if !still_ours {
                return;
            }
            if let Some(exit) = running.exit() {
                let log = running.log();
                clear_running(&app, &running);
                with_inner(&app, |i| i.last_log = log.clone());
                let end = JobEnd::Failed {
                    message: None,
                    exit: Some(exit),
                    log,
                };
                if let Some(mut p) = problem_from("Mimer", end) {
                    p.title = format!("Mimer stopped unexpectedly: {}", p.title);
                    set_problem(&app, p);
                }
                return;
            }
        }
    });
}

/// Unloads the model and frees the memory. Returns when it is done.
pub async fn sleep<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    let running = {
        let state = runtime(app);
        let mut inner = state.foundry.inner.lock().map_err(|_| lock_error())?;
        if let Some(t) = inner.wake_cancel.take() {
            t.cancel();
        }
        if inner.phase == Phase::Installing {
            return Err(AppError::Conflict(
                "A download is running. Cancel it first.".into(),
            ));
        }
        inner.problem = None;
        let running = inner.running.clone();
        if running.is_some() {
            inner.phase = Phase::Sleeping;
            inner.message = "Putting Mimer to sleep…".into();
        } else if inner.phase != Phase::Waking {
            inner.phase = Phase::Idle;
            inner.message = String::new();
        }
        running
    };
    emit(app);
    if let Some(r) = running {
        let app2 = app.clone();
        tokio::task::spawn_blocking(move || clear_running(&app2, &r))
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;
        with_inner(app, |i| {
            i.phase = Phase::Idle;
            i.message = "Mimer is asleep".into();
        });
    }
    emit(app);
    Ok(())
}

/// Stops the helper now, without waiting for the screen: used when Mimer closes.
pub fn shutdown<R: Runtime>(app: &AppHandle<R>) {
    let running = with_inner(app, |i| {
        if let Some(t) = i.wake_cancel.take() {
            t.cancel();
        }
        if let Some(t) = i.install_cancel.take() {
            t.cancel();
        }
        i.running.take()
    })
    .flatten();
    if let Some(r) = running {
        r.stop(Duration::from_secs(3));
    }
}

/// Called when Mimer starts: starts the timer that puts an idle Mimer to sleep.
pub fn startup<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(30)).await;
            let minutes = runtime(&app)
                .settings_snapshot()
                .ai
                .builtin
                .idle_sleep_minutes;
            if minutes == 0 {
                continue;
            }
            let idle = with_inner(&app, |i| {
                i.phase == Phase::Awake
                    && i.last_used.elapsed() >= Duration::from_secs(u64::from(minutes) * 60)
            })
            .unwrap_or(false);
            if idle {
                tracing::info!("putting Foundry Local to sleep after {minutes} idle minutes");
                let _ = sleep(&app).await;
            }
        }
    });
}

// ---------------------------------------------------------------------------------------------
// Remove
// ---------------------------------------------------------------------------------------------

/// What to remove.
#[derive(Debug, Clone, serde::Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase", tag = "kind", content = "alias")]
#[ts(export)]
pub enum FoundryRemove {
    /// One model (its alias).
    Model(String),
    /// All of Foundry Local's files: models and hardware parts.
    All,
}

/// Deletes a model, or all files. Mimer is put to sleep first.
pub async fn remove<R: Runtime>(app: &AppHandle<R>, what: FoundryRemove) -> AppResult<()> {
    sleep(app).await?;
    let data = root(app)?;
    match what {
        FoundryRemove::Model(alias) => {
            let mut list = read_installed(&data);
            if !list.iter().any(|m| m.alias == alias) {
                return Err(AppError::NotFound("That model is not downloaded".into()));
            }
            // Let Foundry Local take its files out of its own cache.
            let (running, _) = launch(app, "remove", &["--alias", &alias], "remove.log")?;
            let end = follow(
                &running,
                "done",
                &CancellationToken::new(),
                Duration::from_secs(120),
                |_| {},
            )
            .await;
            running.stop(Duration::from_secs(3));
            if let JobEnd::Finished(_) = end {
                list.retain(|m| m.alias != alias);
                write_installed(&data, &list).map_err(|e| AppError::Io(e.to_string()))?;
            } else if let Some(p) = problem_from("Removing the model", end) {
                return Err(AppError::Io(p.steps.first().cloned().unwrap_or(p.title)));
            }
        }
        FoundryRemove::All => match std::fs::remove_dir_all(&data) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => {
                return Err(AppError::Io(format!(
                    "Could not delete {}: {e}. If a program still uses the files, close it and try again.",
                    data.display()
                )))
            }
        },
    }
    with_inner(app, |i| {
        i.problem = None;
        i.message = String::new();
        i.catalog = None;
    });
    emit(app);
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// Used by the chat
// ---------------------------------------------------------------------------------------------

/// Checks that Foundry Local is awake before a request goes to it. Other providers are not
/// affected.
pub fn require_awake(state: &AppState, provider: &ProviderConfig) -> AppResult<()> {
    if provider.kind != settings::ProviderKind::FoundryLocal {
        return Ok(());
    }
    let inner = state.foundry.inner.lock().map_err(|_| lock_error())?;
    match inner.phase {
        Phase::Awake => Ok(()),
        Phase::Waking => Err(AppError::Provider(
            "Mimer is still waking up. Wait until the bar says “Mimer is awake”.".into(),
        )),
        _ => Err(AppError::Provider(
            "Mimer is asleep. Press “Wake Mimer” in the Mimer tab to load the model, then try again."
                .into(),
        )),
    }
}

/// Notes that Foundry Local was used just now (for the idle sleep timer).
pub fn touch(state: &AppState) {
    if let Ok(mut inner) = state.foundry.inner.lock() {
        inner.last_used = Instant::now();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn helper_lines_are_read_and_other_output_is_ignored() {
        let lines = vec![
            "some native log line".to_string(),
            r#"{"type":"progress","phase":"model","pct":12.5}"#.to_string(),
            "{broken json".to_string(),
            r#"{"type":"done","sizeMb":593}"#.to_string(),
        ];
        let msgs = parse_lines(&lines);
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[1]["sizeMb"], 593);
    }

    #[test]
    fn a_catalog_line_gives_models_and_skips_bad_entries() {
        let done: Value = serde_json::json!({"type": "catalog", "models": [
            {"alias": "qwen3-4b", "id": "qwen3-4b-generic-gpu:2", "name": "Qwen 3 4B", "sizeMb": 2763,
             "tools": true, "device": "GPU", "license": "apache-2.0", "cached": false},
            {"alias": "broken"}
        ]});
        let list = models_from(&done);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].alias, "qwen3-4b");
        assert!(list[0].tools);
    }

    #[test]
    fn a_crash_without_a_message_is_described_as_a_crash_that_spared_mimer() {
        let end = JobEnd::Failed {
            message: None,
            exit: Some(process::ExitInfo {
                code: None,
                signal: Some(11),
            }),
            log: vec!["last line".into()],
        };
        let p = problem_from("The download", end).unwrap();
        assert!(p.title.contains("crashed"), "{}", p.title);
        assert!(p
            .steps
            .iter()
            .any(|s| s.contains("Mimer itself was not affected")));
        assert!(p.details.contains("last line"));
    }

    #[test]
    fn a_message_from_the_helper_is_shown_first() {
        let end = JobEnd::Failed {
            message: Some("The model could not be downloaded: no network".into()),
            exit: Some(process::ExitInfo {
                code: Some(1),
                signal: None,
            }),
            log: Vec::new(),
        };
        let p = problem_from("The download", end).unwrap();
        assert_eq!(p.title, "The download did not work");
        assert_eq!(p.steps[0], "The model could not be downloaded: no network");
    }

    #[test]
    fn only_foundry_needs_the_foundry_to_be_awake() {
        use crate::settings::{Location, ProviderKind};
        let state = AppState::new(
            settings::Settings::default(),
            std::path::PathBuf::from("settings.json"),
            None,
        );
        let mut cfg = ProviderConfig {
            id: FOUNDRY_ID.into(),
            kind: ProviderKind::FoundryLocal,
            name: "Foundry".into(),
            base_url: "http://127.0.0.1:1/v1".into(),
            model: String::new(),
            location: Location::Local,
            supports_tools: true,
            context_tokens: 8000,
        };
        let err = require_awake(&state, &cfg).unwrap_err().to_string();
        assert!(err.contains("Wake Mimer"), "{err}");
        state.foundry.inner.lock().unwrap().phase = Phase::Awake;
        require_awake(&state, &cfg).unwrap();
        cfg.kind = ProviderKind::LmStudio;
        state.foundry.inner.lock().unwrap().phase = Phase::Idle;
        require_awake(&state, &cfg).unwrap();
    }
}

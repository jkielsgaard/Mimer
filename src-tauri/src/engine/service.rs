//! What the commands do: install, wake, sleep, remove, and keep the status up to date.
//!
//! All heavy work (downloads, unpacking, loading the model) runs in background tasks. The state is
//! short-lived and held under a lock only briefly; every change is sent to the screen as an
//! `engine://status` event.

use super::catalog::{self, ENGINE_BUILD};
use super::diagnose::{self, Context};
use super::download::{self, DownloadSpec};
use super::hardware::{current_os, Backend, Os};
use super::paths::{self, Dirs};
use super::process::{self, Launch};
use super::{
    EngineState, EngineStatus, InstallProgress, InstallRequest, InstalledEngine, InstalledModel,
    Phase, Problem, RemoveWhat, BUILTIN_ID, STATUS_EVENT,
};
use crate::error::{AppError, AppResult};
use crate::settings::{self, BuiltInSettings, ProviderConfig};
use crate::state::AppState;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio_util::sync::CancellationToken;

/// How long loading the model may take before Mimer gives up (a big model on a slow disk).
const WAKE_TIMEOUT: Duration = Duration::from_secs(20 * 60);

fn lock_error() -> AppError {
    AppError::Io("State lock poisoned".into())
}

fn runtime<R: Runtime>(app: &AppHandle<R>) -> tauri::State<'_, AppState> {
    app.state::<AppState>()
}

fn with_inner<R: Runtime, T>(
    app: &AppHandle<R>,
    f: impl FnOnce(&mut super::Inner) -> T,
) -> Option<T> {
    let state = runtime(app);
    let mut guard = state.engine.inner.lock().ok()?;
    Some(f(&mut guard))
}

fn http_client() -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .user_agent(concat!("Mimer/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| AppError::Provider(format!("Could not start the HTTP client: {e}")))
}

// ---------------------------------------------------------------------------------------------
// What is installed
// ---------------------------------------------------------------------------------------------

/// The path of a model by id, when its file is there (a catalog model with the right size, or a
/// custom file).
pub fn model_path(dirs: &Dirs, model_id: &str) -> Option<PathBuf> {
    if let Some(m) = catalog::model(model_id) {
        let p = dirs.models.join(m.file);
        return std::fs::metadata(&p)
            .is_ok_and(|md| md.len() == m.size)
            .then_some(p);
    }
    let file = model_id.strip_prefix("custom:")?;
    if file.is_empty() || file.contains(['/', '\\']) || file.starts_with('.') {
        return None;
    }
    let p = dirs.models.join(file);
    p.is_file().then_some(p)
}

/// The model files in Mimer's folder.
pub fn installed_models(dirs: &Dirs) -> Vec<InstalledModel> {
    let Ok(read) = std::fs::read_dir(&dirs.models) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in read.flatten() {
        let file = entry.file_name().to_string_lossy().to_string();
        if !file.to_lowercase().ends_with(".gguf") {
            continue;
        }
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        match catalog::MODELS
            .iter()
            .find(|m| m.file == file && m.size == size)
        {
            Some(m) => out.push(InstalledModel {
                id: m.id.into(),
                name: m.name.into(),
                file,
                size_bytes: size,
                custom: false,
            }),
            None => out.push(InstalledModel {
                id: format!("custom:{file}"),
                name: file.clone(),
                file,
                size_bytes: size,
                custom: true,
            }),
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// True when the engine for `backend` is completely installed.
pub fn engine_ready(dirs: &Dirs, backend: Backend) -> bool {
    paths::server_path(dirs, backend).is_file() && paths::ready_marker(dirs, backend).is_file()
}

fn folder_size(dir: &Path) -> u64 {
    let Ok(read) = std::fs::read_dir(dir) else {
        return 0;
    };
    read.flatten()
        .map(|e| match e.metadata() {
            Ok(m) if m.is_dir() => folder_size(&e.path()),
            Ok(m) => m.len(),
            Err(_) => 0,
        })
        .sum()
}

// ---------------------------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------------------------

fn dirs_of<R: Runtime>(app: &AppHandle<R>) -> AppResult<Dirs> {
    paths::dirs(app)
}

/// The current status, put together from the files on disk and the runtime state.
pub fn status<R: Runtime>(app: &AppHandle<R>) -> EngineStatus {
    let state = runtime(app);
    let settings = state.settings_snapshot().ai.builtin;
    let dirs = dirs_of(app);
    let (engine, models, folder, folder_note, ready, disk) = match &dirs {
        Ok(d) => {
            let ready = engine_ready(d, settings.backend);
            (
                ready.then(|| InstalledEngine {
                    build: ENGINE_BUILD.into(),
                    backend: settings.backend,
                }),
                installed_models(d),
                d.root.display().to_string(),
                d.note.clone(),
                model_path(d, &settings.model_id).is_some(),
                folder_size(&d.root),
            )
        }
        Err(_) => (None, Vec::new(), String::new(), None, false, 0),
    };
    let installed = engine.is_some() && ready;
    let Ok(inner) = state.engine.inner.lock() else {
        return EngineStatus {
            state: EngineState::Error,
            message: "Internal error".into(),
            problem: None,
            install: None,
            engine,
            models,
            selected_model_ready: ready,
            active_model: None,
            folder,
            folder_note,
            log: Vec::new(),
            restart_needed: false,
            disk_bytes: disk,
        };
    };
    let st = match inner.phase {
        Phase::Installing => EngineState::Installing,
        Phase::Waking => EngineState::Waking,
        Phase::Awake => EngineState::Awake,
        Phase::Sleeping => EngineState::Sleeping,
        Phase::Idle if inner.problem.is_some() => EngineState::Error,
        Phase::Idle if installed => EngineState::Asleep,
        Phase::Idle => EngineState::NotInstalled,
    };
    let message = if !inner.message.is_empty() {
        inner.message.clone()
    } else {
        match st {
            EngineState::NotInstalled => "The built-in AI is not downloaded yet".into(),
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
        && match (&inner.launched_with, &dirs) {
            (Some(args), Ok(d)) => {
                let wanted = model_path(d, &settings.model_id)
                    .map(|m| process::build_args(&settings, &m, inner.port.unwrap_or(0)));
                wanted.is_none_or(|w| !same_launch(args, &w))
            }
            _ => false,
        };
    EngineStatus {
        state: st,
        message,
        problem: inner.problem.clone(),
        install: inner.install.clone(),
        engine,
        models,
        selected_model_ready: ready,
        active_model: inner.active_model.clone(),
        folder,
        folder_note,
        log: tail,
        restart_needed,
        disk_bytes: disk,
    }
}

/// True when two argument lists are the same apart from the port.
fn same_launch(a: &[String], b: &[String]) -> bool {
    let strip = |v: &[String]| {
        let mut out = Vec::new();
        let mut skip = false;
        for x in v {
            if skip {
                skip = false;
                continue;
            }
            if x == "--port" {
                skip = true;
                continue;
            }
            out.push(x.clone());
        }
        out
    };
    strip(a) == strip(b)
}

/// Sends the status to the screen.
pub fn emit<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.emit(STATUS_EVENT, status(app));
}

fn set_problem<R: Runtime>(app: &AppHandle<R>, problem: Problem) {
    tracing::warn!("built-in AI: {}", problem.title);
    with_inner(app, |i| {
        i.phase = Phase::Idle;
        i.message = problem.title.clone();
        i.problem = Some(problem);
        i.install = None;
    });
    emit(app);
}

fn set_progress<R: Runtime>(app: &AppHandle<R>, phase: &str, file: &str, done: u64, total: u64) {
    with_inner(app, |i| {
        i.install = Some(InstallProgress {
            phase: phase.into(),
            file: file.into(),
            done,
            total,
        });
    });
    emit(app);
}

// ---------------------------------------------------------------------------------------------
// Settings changes made by the engine itself
// ---------------------------------------------------------------------------------------------

/// Changes the settings in memory and saves them (unless the settings file could not be read, in
/// which case it is never overwritten).
fn change_settings<R: Runtime>(app: &AppHandle<R>, f: impl FnOnce(&mut settings::Settings)) {
    let state = runtime(app);
    let Ok(mut s) = state.settings.write() else {
        return;
    };
    f(&mut s);
    s.normalize();
    if state.settings_error.is_none() {
        if let Err(e) = settings::save(&state.settings_path, &s) {
            tracing::warn!("could not save the settings: {e}");
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------------------------

fn install_problem(e: &AppError) -> Problem {
    let (title, tip) = match e {
        AppError::Io(_) => (
            "Could not save or unpack the files",
            "Check that there is enough free disk space and that the folder can be written to.",
        ),
        _ => (
            "The download did not finish",
            "Press Download again. It continues where it stopped.",
        ),
    };
    Problem {
        title: title.into(),
        steps: vec![e.to_string(), tip.into()],
        details: e.to_string(),
    }
}

/// Starts downloading the engine and the model the user chose. Returns at once; progress and
/// problems arrive through the status.
pub fn start_install<R: Runtime>(app: &AppHandle<R>, req: InstallRequest) -> AppResult<()> {
    if let Some(reason) = catalog::unavailable_reason() {
        return Err(AppError::Settings(reason));
    }
    let os = current_os();
    if os == Os::Unsupported {
        return Err(AppError::Settings(
            "The built-in AI works on Windows and Linux only".into(),
        ));
    }
    if catalog::engine_files(os, req.backend).is_none() {
        return Err(AppError::Settings(
            "That engine is not available here".into(),
        ));
    }
    if catalog::model(&req.model_id).is_none() && !req.model_id.starts_with("custom:") {
        return Err(AppError::Settings("Unknown model".into()));
    }
    let dirs = dirs_of(app)?;
    let cancel = CancellationToken::new();
    {
        let state = runtime(app);
        let mut inner = state.engine.inner.lock().map_err(|_| lock_error())?;
        if inner.phase != Phase::Idle {
            return Err(AppError::Conflict(
                "Wait until Mimer has finished what it is doing, or press Sleep Mimer first".into(),
            ));
        }
        inner.phase = Phase::Installing;
        inner.problem = None;
        inner.message = "Starting the download…".into();
        inner.install_cancel = Some(cancel.clone());
    }
    // The choices are saved now, so they are kept even if the download is interrupted.
    change_settings(app, |s| {
        s.ai.builtin.cpu = req.cpu;
        s.ai.builtin.gpu = req.gpu;
        s.ai.builtin.backend = req.backend;
        s.ai.builtin.model_id = req.model_id.clone();
    });
    emit(app);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = install_task(&app, &req, &dirs, &cancel).await;
        with_inner(&app, |i| i.install_cancel = None);
        match result {
            Ok(()) => {
                if req.use_for_mimer {
                    change_settings(&app, |s| s.ai.default_provider_id = BUILTIN_ID.into());
                }
                with_inner(&app, |i| {
                    i.phase = Phase::Idle;
                    i.install = None;
                    i.message = String::new();
                    i.problem = None;
                });
                emit(&app);
            }
            Err(e) if cancel.is_cancelled() => {
                tracing::info!("install cancelled: {e}");
                with_inner(&app, |i| {
                    i.phase = Phase::Idle;
                    i.install = None;
                    i.message = "The download was cancelled. Press Download to continue it.".into();
                });
                emit(&app);
            }
            Err(e) => set_problem(&app, install_problem(&e)),
        }
    });
    Ok(())
}

async fn install_task<R: Runtime>(
    app: &AppHandle<R>,
    req: &InstallRequest,
    dirs: &Dirs,
    cancel: &CancellationToken,
) -> AppResult<()> {
    std::fs::create_dir_all(&dirs.root)?;
    let client = http_client()?;
    if !engine_ready(dirs, req.backend) {
        install_engine(app, &client, dirs, req.backend, cancel).await?;
    }
    if model_path(dirs, &req.model_id).is_none() {
        let Some(m) = catalog::model(&req.model_id) else {
            return Err(AppError::NotFound(
                "That model file is not in Mimer's folder. Add it with “Add my own model file”."
                    .into(),
            ));
        };
        let spec = DownloadSpec {
            url: m.url.into(),
            dest: dirs.models.join(m.file),
            size: m.size,
            sha256: Some(m.sha256.into()),
        };
        set_with_message(app, &format!("Downloading {}…", m.name));
        let handle = app.clone();
        let file = m.file.to_string();
        download::download(&client, &spec, cancel, &move |done, total| {
            set_progress(&handle, "model", &file, done, total);
        })
        .await?;
    }
    Ok(())
}

fn set_with_message<R: Runtime>(app: &AppHandle<R>, message: &str) {
    with_inner(app, |i| i.message = message.to_string());
    emit(app);
}

async fn install_engine<R: Runtime>(
    app: &AppHandle<R>,
    client: &reqwest::Client,
    dirs: &Dirs,
    backend: Backend,
    cancel: &CancellationToken,
) -> AppResult<()> {
    let files = catalog::engine_files(current_os(), backend)
        .ok_or_else(|| AppError::Settings("That engine is not available here".into()))?;
    let downloads = dirs.engine.join("_downloads");
    for f in files {
        let spec = DownloadSpec {
            url: f.url(),
            dest: downloads.join(f.name),
            size: f.size,
            sha256: Some(f.sha256.into()),
        };
        set_with_message(app, "Downloading the engine…");
        let handle = app.clone();
        let name = f.name.to_string();
        download::download(client, &spec, cancel, &move |done, total| {
            set_progress(&handle, "engine", &name, done, total);
        })
        .await?;
    }
    set_with_message(app, "Unpacking the engine…");
    set_progress(app, "unpacking", "", 0, 0);
    let target = paths::engine_dir(dirs, backend);
    let temp = target.with_extension("installing");
    let archives: Vec<PathBuf> = files.iter().map(|f| downloads.join(f.name)).collect();
    let (temp_c, target_c) = (temp.clone(), target.clone());
    let dirs_c = dirs.clone();
    tokio::task::spawn_blocking(move || -> AppResult<()> {
        let _ = std::fs::remove_dir_all(&temp_c);
        for a in &archives {
            super::extract::extract_archive(a, &temp_c)?;
        }
        let server = temp_c.join(paths::SERVER_NAME);
        if !server.is_file() {
            return Err(AppError::Io(format!(
                "The engine program ({}) was not in the download. Use Remove files and download again.",
                paths::SERVER_NAME
            )));
        }
        std::fs::write(
            temp_c.join("mimer-engine.ok"),
            format!("{ENGINE_BUILD} {}\n", backend.id()),
        )?;
        let _ = std::fs::remove_dir_all(&target_c);
        std::fs::rename(&temp_c, &target_c)?;
        let _ = std::fs::remove_dir_all(dirs_c.engine.join("_downloads"));
        Ok(())
    })
    .await
    .map_err(|e| AppError::Io(e.to_string()))??;
    Ok(())
}

/// Stops a download in progress. What has been downloaded is kept.
pub fn cancel_install<R: Runtime>(app: &AppHandle<R>) {
    let token = with_inner(app, |i| i.install_cancel.clone()).flatten();
    if let Some(t) = token {
        t.cancel();
    }
}

/// Copies a model file the user has into Mimer's folder and chooses it.
pub fn add_model<R: Runtime>(app: &AppHandle<R>, source: &str) -> AppResult<()> {
    let src = PathBuf::from(source);
    let file = src
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    if !file.to_lowercase().ends_with(".gguf") || !src.is_file() {
        return Err(AppError::InvalidPath(
            "Choose a model file that ends in .gguf".into(),
        ));
    }
    let dirs = dirs_of(app)?;
    let cancel = CancellationToken::new();
    {
        let state = runtime(app);
        let mut inner = state.engine.inner.lock().map_err(|_| lock_error())?;
        if inner.phase != Phase::Idle {
            return Err(AppError::Conflict(
                "Wait until Mimer has finished what it is doing, or press Sleep Mimer first".into(),
            ));
        }
        inner.phase = Phase::Installing;
        inner.problem = None;
        inner.message = format!("Copying {file}…");
        inner.install_cancel = Some(cancel);
    }
    emit(app);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let handle = app.clone();
        let (s, d, f) = (src.clone(), dirs.models.join(&file), file.clone());
        let result = tokio::task::spawn_blocking(move || copy_with_progress(&s, &d, &handle, &f))
            .await
            .map_err(|e| AppError::Io(e.to_string()))
            .and_then(|r| r);
        with_inner(&app, |i| i.install_cancel = None);
        match result {
            Ok(()) => {
                change_settings(&app, |s| s.ai.builtin.model_id = format!("custom:{file}"));
                with_inner(&app, |i| {
                    i.phase = Phase::Idle;
                    i.install = None;
                    i.message = String::new();
                });
                emit(&app);
            }
            Err(e) => set_problem(&app, install_problem(&e)),
        }
    });
    Ok(())
}

fn copy_with_progress<R: Runtime>(
    src: &Path,
    dest: &Path,
    app: &AppHandle<R>,
    file: &str,
) -> AppResult<()> {
    use std::io::{Read, Write};
    if let Some(dir) = dest.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let total = std::fs::metadata(src)?.len();
    let part = dest.with_extension("gguf.part");
    let mut input = std::fs::File::open(src)?;
    let mut out = std::fs::File::create(&part)?;
    let mut buf = vec![0u8; 4 << 20];
    let mut done = 0u64;
    let mut last = Instant::now();
    loop {
        let n = input.read(&mut buf)?;
        if n == 0 {
            break;
        }
        out.write_all(&buf[..n])?;
        done += n as u64;
        if last.elapsed() >= Duration::from_millis(250) {
            set_progress(app, "copying", file, done, total);
            last = Instant::now();
        }
    }
    out.flush()?;
    drop(out);
    std::fs::rename(&part, dest)?;
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// Wake and sleep
// ---------------------------------------------------------------------------------------------

fn not_installed(what: &str) -> Problem {
    Problem {
        title: format!("{what} is not downloaded"),
        steps: vec![
            "Open Settings → Built-in AI.".into(),
            "Choose your graphics card and a model, then press Download.".into(),
        ],
        details: String::new(),
    }
}

fn pid_file(dirs: &Dirs) -> PathBuf {
    dirs.root.join("engine.pid")
}

/// Loads the model: starts the engine and waits until it answers. Returns at once; the result
/// arrives through the status.
pub fn wake<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    let state = runtime(app);
    let b = state.settings_snapshot().ai.builtin;
    let dirs = dirs_of(app)?;
    {
        let mut inner = state.engine.inner.lock().map_err(|_| lock_error())?;
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
        inner.message = "Starting the engine…".into();
        inner.phase = Phase::Waking;
        inner.last_log.clear();
    }
    let server = paths::server_path(&dirs, b.backend);
    if !engine_ready(&dirs, b.backend) {
        set_problem(app, not_installed("The engine"));
        return Ok(());
    }
    let Some(model) = model_path(&dirs, &b.model_id) else {
        set_problem(app, not_installed("The chosen model"));
        return Ok(());
    };
    let cancel = CancellationToken::new();
    with_inner(app, |i| i.wake_cancel = Some(cancel.clone()));
    emit(app);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        wake_task(&app, &b, &dirs, &server, &model, &cancel).await;
        with_inner(&app, |i| i.wake_cancel = None);
    });
    Ok(())
}

fn context_for(b: &BuiltInSettings, dirs_os: Os, port: u16) -> Context {
    Context {
        os: dirs_os,
        backend: b.backend,
        port,
        context_tokens: b.context_tokens,
    }
}

async fn wake_task<R: Runtime>(
    app: &AppHandle<R>,
    b: &BuiltInSettings,
    dirs: &Dirs,
    server: &Path,
    model: &Path,
    cancel: &CancellationToken,
) {
    let port = match process::free_port() {
        Ok(p) => p,
        Err(e) => {
            set_problem(
                app,
                Problem {
                    title: "No network port is available".into(),
                    steps: vec![
                        "Mimer needs one free port on this computer (127.0.0.1) to talk to the engine.".into(),
                        "Close programs that use many network ports, or restart the computer.".into(),
                    ],
                    details: e.to_string(),
                },
            );
            return;
        }
    };
    let token = process::random_token();
    let args = process::build_args(b, model, port);
    let launch = Launch {
        server: server.to_path_buf(),
        dir: paths::engine_dir(dirs, b.backend),
        args: args.clone(),
        token: token.clone(),
        log_file: dirs.logs.join("engine.log"),
    };
    let running = match process::spawn(&launch) {
        Ok(r) => Arc::new(r),
        Err(e) => {
            set_problem(app, diagnose::diagnose_spawn(&e, server));
            return;
        }
    };
    super::set_token(Some(token));
    let _ = std::fs::write(pid_file(dirs), running.pid.to_string());
    with_inner(app, |i| {
        i.running = Some(running.clone());
        i.port = Some(port);
        i.launched_with = Some(args);
        i.message = "Loading the model into memory…".into();
    });
    emit(app);

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            fail_wake(
                app,
                dirs,
                &running,
                Problem {
                    title: "Could not check the engine".into(),
                    steps: vec![e.to_string()],
                    details: e.to_string(),
                },
            );
            return;
        }
    };
    let started = Instant::now();
    let url = format!("http://127.0.0.1:{port}/health");
    let mut ticks = 0u32;
    loop {
        if cancel.is_cancelled() {
            stop_running(app, dirs, &running);
            with_inner(app, |i| {
                i.phase = Phase::Idle;
                i.message = String::new();
            });
            emit(app);
            return;
        }
        if let Some(exit) = running.exit() {
            let log = running.log();
            let problem = diagnose::diagnose(exit.code, &log, &context_for(b, current_os(), port));
            fail_wake(app, dirs, &running, problem);
            return;
        }
        if started.elapsed() > WAKE_TIMEOUT {
            let log = running.log();
            let mut problem = diagnose::diagnose(None, &log, &context_for(b, current_os(), port));
            problem.title = "Loading the model took too long".into();
            problem.steps.insert(
                0,
                "Loading did not finish in 20 minutes. A slow disk or too little memory can cause this."
                    .into(),
            );
            fail_wake(app, dirs, &running, problem);
            return;
        }
        if let Ok(resp) = client.get(&url).send().await {
            if resp.status().is_success() {
                break;
            }
        }
        ticks += 1;
        if ticks.is_multiple_of(4) {
            let secs = started.elapsed().as_secs();
            set_with_message(app, &format!("Loading the model into memory… {secs} s"));
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }

    // Ready: point the provider at this run and start watching the process.
    let model_id = b.model_id.clone();
    {
        let state = runtime(app);
        let guard = state.settings.write();
        if let Ok(mut s) = guard {
            if let Some(p) = s.ai.providers.iter_mut().find(|p| p.id == BUILTIN_ID) {
                p.base_url = format!("http://127.0.0.1:{port}/v1");
            }
        }
    }
    with_inner(app, |i| {
        i.phase = Phase::Awake;
        i.message = "Mimer is awake".into();
        i.active_model = Some(model_id);
        i.last_used = Instant::now();
    });
    emit(app);
    watch_running(app.clone(), dirs.clone(), running, b.clone(), port);
}

fn fail_wake<R: Runtime>(
    app: &AppHandle<R>,
    dirs: &Dirs,
    running: &Arc<process::Running>,
    problem: Problem,
) {
    let log = running.log();
    stop_running(app, dirs, running);
    with_inner(app, |i| i.last_log = log);
    set_problem(app, problem);
}

/// Stops the process and forgets it.
fn stop_running<R: Runtime>(app: &AppHandle<R>, dirs: &Dirs, running: &Arc<process::Running>) {
    running.stop(Duration::from_secs(5));
    super::set_token(None);
    let _ = std::fs::remove_file(pid_file(dirs));
    with_inner(app, |i| {
        if i.running.as_ref().is_some_and(|r| Arc::ptr_eq(r, running)) {
            i.running = None;
            i.port = None;
            i.launched_with = None;
            i.active_model = None;
        }
    });
}

/// Notices when the engine stops by itself (a crash, or killed by the system) and says why.
fn watch_running<R: Runtime>(
    app: AppHandle<R>,
    dirs: Dirs,
    running: Arc<process::Running>,
    b: BuiltInSettings,
    port: u16,
) {
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
                let mut problem =
                    diagnose::diagnose(exit.code, &log, &context_for(&b, current_os(), port));
                problem.title = format!("Mimer stopped unexpectedly: {}", problem.title);
                fail_wake(&app, &dirs, &running, problem);
                return;
            }
        }
    });
}

/// Unloads the model and frees the memory. Returns when it is done.
pub async fn sleep<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    let running = {
        let state = runtime(app);
        let mut inner = state.engine.inner.lock().map_err(|_| lock_error())?;
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
        let dirs = dirs_of(app)?;
        let app2 = app.clone();
        tokio::task::spawn_blocking(move || stop_running(&app2, &dirs, &r))
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

/// Stops the engine now, without waiting for the screen: used when Mimer closes.
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
    super::set_token(None);
    if let Ok(d) = dirs_of(app) {
        let _ = std::fs::remove_file(pid_file(&d));
    }
}

/// Called when Mimer starts: removes an engine that a crashed Mimer left behind, and starts the
/// timer that puts an idle Mimer to sleep.
pub fn startup<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(d) = dirs_of(app) {
        if let Ok(text) = std::fs::read_to_string(pid_file(&d)) {
            if let Ok(pid) = text.trim().parse::<u32>() {
                if process::kill_leftover(pid) {
                    tracing::info!("removed a leftover engine process ({pid})");
                }
            }
            let _ = std::fs::remove_file(pid_file(&d));
        }
    }
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
                tracing::info!("putting the built-in AI to sleep after {minutes} idle minutes");
                let _ = sleep(&app).await;
            }
        }
    });
}

// ---------------------------------------------------------------------------------------------
// Remove
// ---------------------------------------------------------------------------------------------

/// Deletes a model, the engine, or everything. The AI is put to sleep first.
pub async fn remove<R: Runtime>(app: &AppHandle<R>, what: RemoveWhat) -> AppResult<()> {
    sleep(app).await?;
    let dirs = dirs_of(app)?;
    match what {
        RemoveWhat::Model(id) => {
            let installed = installed_models(&dirs);
            let m = installed
                .iter()
                .find(|m| m.id == id)
                .ok_or_else(|| AppError::NotFound("That model is not installed".into()))?;
            let file = dirs.models.join(&m.file);
            std::fs::remove_file(&file)
                .map_err(|e| AppError::Io(format!("Could not delete {}: {e}", file.display())))?;
            let _ = std::fs::remove_file(file.with_extension("gguf.part"));
        }
        RemoveWhat::Engine => {
            remove_dir(&dirs.engine)?;
        }
        RemoveWhat::All => {
            remove_dir(&dirs.root)?;
        }
    }
    with_inner(app, |i| {
        i.problem = None;
        i.message = String::new();
    });
    emit(app);
    Ok(())
}

fn remove_dir(dir: &Path) -> AppResult<()> {
    match std::fs::remove_dir_all(dir) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(AppError::Io(format!(
            "Could not delete {}: {e}. If a program still uses the files, close it and try again.",
            dir.display()
        ))),
    }
}

// ---------------------------------------------------------------------------------------------
// Used by the chat
// ---------------------------------------------------------------------------------------------

/// Checks that the built-in AI is awake before a request goes to it. Other providers are not
/// affected. The error says what to press.
pub fn require_awake(state: &AppState, provider: &ProviderConfig) -> AppResult<()> {
    if provider.kind != crate::settings::ProviderKind::BuiltIn {
        return Ok(());
    }
    let inner = state.engine.inner.lock().map_err(|_| lock_error())?;
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

/// Notes that the built-in AI was used just now (for the idle sleep timer).
pub fn touch(state: &AppState) {
    if let Ok(mut inner) = state.engine.inner.lock() {
        inner.last_used = Instant::now();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::catalog::MODELS;

    fn dirs(root: &Path) -> Dirs {
        Dirs {
            root: root.to_path_buf(),
            engine: root.join("engine"),
            models: root.join("models"),
            logs: root.join("logs"),
            note: None,
        }
    }

    #[test]
    fn a_catalog_model_counts_as_installed_only_with_the_right_size() {
        let d = tempfile::tempdir().unwrap();
        let dirs = dirs(d.path());
        std::fs::create_dir_all(&dirs.models).unwrap();
        let m = &MODELS[2];
        std::fs::write(dirs.models.join(m.file), b"too small").unwrap();
        assert!(model_path(&dirs, m.id).is_none());
        let f = std::fs::File::create(dirs.models.join(m.file)).unwrap();
        f.set_len(m.size).unwrap();
        assert!(model_path(&dirs, m.id).is_some());
        let list = installed_models(&dirs);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, m.id);
        assert!(!list[0].custom);
    }

    #[test]
    fn your_own_model_file_is_found_by_its_custom_id_and_the_id_cannot_leave_the_folder() {
        let d = tempfile::tempdir().unwrap();
        let dirs = dirs(d.path());
        std::fs::create_dir_all(&dirs.models).unwrap();
        std::fs::write(dirs.models.join("mine.gguf"), b"gguf").unwrap();
        std::fs::write(dirs.models.join("notes.txt"), b"x").unwrap();
        assert!(model_path(&dirs, "custom:mine.gguf").is_some());
        assert!(model_path(&dirs, "custom:../mine.gguf").is_none());
        assert!(model_path(&dirs, "custom:..\\mine.gguf").is_none());
        assert!(model_path(&dirs, "custom:").is_none());
        assert!(model_path(&dirs, "custom:missing.gguf").is_none());
        let list = installed_models(&dirs);
        assert_eq!(list.len(), 1, "only .gguf files are models");
        assert!(list[0].custom && list[0].id == "custom:mine.gguf");
    }

    #[test]
    fn the_engine_is_ready_only_with_the_program_and_the_marker() {
        let d = tempfile::tempdir().unwrap();
        let dirs = dirs(d.path());
        let dir = paths::engine_dir(&dirs, Backend::Cpu);
        std::fs::create_dir_all(&dir).unwrap();
        assert!(!engine_ready(&dirs, Backend::Cpu));
        std::fs::write(dir.join(paths::SERVER_NAME), b"x").unwrap();
        assert!(!engine_ready(&dirs, Backend::Cpu), "half-installed");
        std::fs::write(paths::ready_marker(&dirs, Backend::Cpu), b"ok").unwrap();
        assert!(engine_ready(&dirs, Backend::Cpu));
        assert!(!engine_ready(&dirs, Backend::Vulkan));
    }

    #[test]
    fn launch_arguments_are_compared_without_the_port() {
        let a: Vec<String> = ["--model", "m", "--port", "1111", "-c", "8"]
            .map(String::from)
            .to_vec();
        let b: Vec<String> = ["--model", "m", "--port", "2222", "-c", "8"]
            .map(String::from)
            .to_vec();
        let c: Vec<String> = ["--model", "m", "--port", "2222", "-c", "9"]
            .map(String::from)
            .to_vec();
        assert!(same_launch(&a, &b));
        assert!(!same_launch(&a, &c));
    }

    #[test]
    fn install_problems_say_what_went_wrong() {
        let p = install_problem(&AppError::Provider("The download from x failed".into()));
        assert_eq!(p.title, "The download did not finish");
        assert!(p.steps[0].contains("failed"));
        let p = install_problem(&AppError::Io("The disk is full".into()));
        assert!(p.title.contains("save or unpack"));
    }

    #[test]
    fn folder_size_adds_up_files_in_sub_folders() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("a/b")).unwrap();
        std::fs::write(d.path().join("a/b/x"), vec![0u8; 1000]).unwrap();
        std::fs::write(d.path().join("y"), vec![0u8; 24]).unwrap();
        assert_eq!(folder_size(d.path()), 1024);
        assert_eq!(folder_size(&d.path().join("missing")), 0);
    }

    /// Wakes the real engine through the same code the Wake button uses, chats with it through the
    /// provider settings, and puts it to sleep (not run by default). Needs `MIMER_TEST_ENGINE_DIR`
    /// (an unpacked Vulkan or CPU engine) and `MIMER_TEST_MODEL` (a .gguf file):
    /// `cargo test engine::service::tests::real_wake -- --ignored --nocapture`.
    // Uses symbolic links to put the engine and model in place, so it is for Linux only.
    #[cfg(unix)]
    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "needs a downloaded engine and model"]
    async fn real_wake_chat_and_sleep_through_the_service() {
        let engine_src = PathBuf::from(std::env::var("MIMER_TEST_ENGINE_DIR").unwrap());
        let model_src = PathBuf::from(std::env::var("MIMER_TEST_MODEL").unwrap());
        let tmp = tempfile::tempdir().unwrap();
        // Keep everything in the temporary folder, not in the user's own data folder.
        std::env::set_var("XDG_DATA_HOME", tmp.path());
        let app = tauri::test::mock_app();
        let handle = app.handle().clone();
        let mut settings = settings::Settings::default();
        settings.ai.builtin.backend = Backend::Vulkan;
        settings.ai.builtin.model_id = "custom:test-model.gguf".into();
        settings.ai.builtin.context_tokens = 4096;
        settings.ai.default_provider_id = BUILTIN_ID.into();
        settings.normalize();
        handle.manage(AppState::new(
            settings,
            tmp.path().join("settings.json"),
            None,
        ));

        // Put the engine and model where Mimer keeps them.
        let dirs = dirs_of(&handle).unwrap();
        let engine_dir = paths::engine_dir(&dirs, Backend::Vulkan);
        std::fs::create_dir_all(&engine_dir).unwrap();
        for entry in std::fs::read_dir(&engine_src).unwrap().flatten() {
            let target = engine_dir.join(entry.file_name());
            #[cfg(unix)]
            std::os::unix::fs::symlink(entry.path(), target).unwrap();
        }
        std::fs::write(paths::ready_marker(&dirs, Backend::Vulkan), b"ok").unwrap();
        std::fs::create_dir_all(&dirs.models).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&model_src, dirs.models.join("test-model.gguf")).unwrap();
        println!("folder: {}", dirs.root.display());

        let st = status(&handle);
        assert_eq!(st.state, EngineState::Asleep, "{st:?}");
        // Asleep: the chat is refused with a message that says what to press.
        let state = handle.state::<AppState>();
        let cfg = state
            .settings_snapshot()
            .provider(BUILTIN_ID)
            .cloned()
            .unwrap();
        let err = require_awake(&state, &cfg).unwrap_err().to_string();
        assert!(err.contains("Wake Mimer"), "{err}");

        wake(&handle).unwrap();
        let started = Instant::now();
        loop {
            let st = status(&handle);
            if st.state == EngineState::Awake {
                break;
            }
            assert!(st.state == EngineState::Waking, "{st:?}");
            assert!(started.elapsed() < Duration::from_secs(300));
            tokio::time::sleep(Duration::from_millis(300)).await;
        }
        println!("awake after {:?}", started.elapsed());
        require_awake(&state, &cfg).unwrap();

        // The provider now points at the running engine and carries the key.
        let cfg = state
            .settings_snapshot()
            .provider(BUILTIN_ID)
            .cloned()
            .unwrap();
        assert!(settings::is_loopback_url(&cfg.base_url), "{}", cfg.base_url);
        let key = crate::settings::keychain::get_key(BUILTIN_ID).expect("a key while awake");
        let client = reqwest::Client::new();
        let url = format!("{}/chat/completions", cfg.base_url);
        let body = serde_json::json!({"model": cfg.model, "messages": [{"role": "user", "content": "Say hi in one word."}], "max_tokens": 40});
        let denied = client.post(&url).json(&body).send().await.unwrap();
        assert_eq!(denied.status().as_u16(), 401);
        let ok = client
            .post(&url)
            .bearer_auth(&key)
            .json(&body)
            .send()
            .await
            .unwrap();
        assert!(ok.status().is_success());

        // Changing a setting while awake is noticed.
        change_settings(&handle, |s| s.ai.builtin.context_tokens = 8192);
        assert!(status(&handle).restart_needed);
        change_settings(&handle, |s| s.ai.builtin.context_tokens = 4096);
        assert!(!status(&handle).restart_needed);

        let pid = state
            .engine
            .inner
            .lock()
            .unwrap()
            .running
            .as_ref()
            .unwrap()
            .pid;
        sleep(&handle).await.unwrap();
        let st = status(&handle);
        assert_eq!(st.state, EngineState::Asleep, "{st:?}");
        assert!(
            crate::settings::keychain::get_key(BUILTIN_ID).is_none(),
            "the key is gone"
        );
        #[cfg(target_os = "linux")]
        assert!(
            !Path::new(&format!("/proc/{pid}")).exists(),
            "the engine process is gone"
        );
        let err = require_awake(&state, &cfg).unwrap_err().to_string();
        assert!(err.contains("asleep"), "{err}");

        // Wake again, then shutdown (what closing Mimer does) must also stop it.
        wake(&handle).unwrap();
        let started = Instant::now();
        while status(&handle).state != EngineState::Awake {
            assert!(started.elapsed() < Duration::from_secs(300));
            tokio::time::sleep(Duration::from_millis(300)).await;
        }
        let pid = state
            .engine
            .inner
            .lock()
            .unwrap()
            .running
            .as_ref()
            .unwrap()
            .pid;
        shutdown(&handle);
        #[cfg(target_os = "linux")]
        assert!(
            !Path::new(&format!("/proc/{pid}")).exists(),
            "shutdown stops the engine"
        );
    }
}

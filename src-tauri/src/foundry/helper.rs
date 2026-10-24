//! The Foundry Local helper: Mimer started with `--foundry-helper <command>`.
//!
//! Foundry Local is a native library with a lot of code Mimer does not control, so it never runs
//! inside Mimer's own process: a fault in it must not take Mimer (and unsaved work) with it. Mimer
//! starts itself again as a small helper that loads the library, does one job and prints what
//! happens as JSON, one object per line, on standard output. The helper is part of the Mimer
//! program, so it is signed and packaged with it, like everything else in the Store package.
//!
//! Commands: `catalog`, `install --alias A` (hardware parts, then the model), `serve --alias A
//! --port P` (load the model and answer on 127.0.0.1 until it is killed), `remove --alias A`.
//! Options: `--lib DIR` (the folder with the native library) and `--data DIR`.

use foundry_local_sdk::{FoundryLocalConfig, FoundryLocalManager};
use serde_json::{json, Value};
use std::io::Write;
use std::path::PathBuf;

/// The first argument that makes Mimer behave as the helper.
pub const FLAG: &str = "--foundry-helper";

/// Runs the helper when Mimer was started as one and returns its exit code; `None` for a normal
/// start. Called first in `main`, before anything else is set up.
pub fn maybe_run() -> Option<i32> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) != Some(FLAG) {
        return None;
    }
    Some(run(&args[1..]))
}

/// What the helper was asked to do.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Options {
    pub command: String,
    pub lib: Option<PathBuf>,
    pub data: Option<PathBuf>,
    pub alias: Option<String>,
    pub port: Option<u16>,
}

/// Reads `command --lib X --data Y --alias A --port P`. Unknown options are an error.
pub fn parse_args(args: &[String]) -> Result<Options, String> {
    let mut it = args.iter();
    let mut o = Options {
        command: it.next().cloned().ok_or("no command given")?,
        ..Options::default()
    };
    while let Some(flag) = it.next() {
        let value = it.next().ok_or(format!("{flag} needs a value"))?;
        match flag.as_str() {
            "--lib" => o.lib = Some(PathBuf::from(value)),
            "--data" => o.data = Some(PathBuf::from(value)),
            "--alias" => o.alias = Some(value.clone()),
            "--port" => o.port = Some(value.parse().map_err(|_| "--port is not a number")?),
            other => return Err(format!("unknown option {other}")),
        }
    }
    Ok(o)
}

/// Prints one JSON object as a line and flushes, so the parent sees it at once.
fn emit(v: &Value) {
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{v}");
    let _ = out.flush();
}

fn run(args: &[String]) -> i32 {
    let opts = match parse_args(args) {
        Ok(o) => o,
        Err(e) => {
            emit(&json!({"type": "error", "message": format!("bad arguments: {e}")}));
            return 2;
        }
    };
    let rt = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(rt) => rt,
        Err(e) => {
            emit(&json!({"type": "error", "message": format!("no async runtime: {e}")}));
            return 1;
        }
    };
    match rt.block_on(job(opts)) {
        Ok(()) => 0,
        Err(message) => {
            emit(&json!({"type": "error", "message": message}));
            1
        }
    }
}

fn manager(o: &Options) -> Result<std::sync::Arc<FoundryLocalManager>, String> {
    let data = o.data.clone().ok_or("--data is missing")?;
    // The native library does not create its folders itself (it fails when they are missing).
    for d in ["app", "models", "logs"] {
        std::fs::create_dir_all(data.join(d)).map_err(|e| {
            format!(
                "The folder {} could not be made: {e}",
                data.join(d).display()
            )
        })?;
    }
    let path = |d: &str| data.join(d).to_string_lossy().to_string();
    let mut cfg = FoundryLocalConfig::new("Mimer")
        .app_data_dir(path("app"))
        .model_cache_dir(path("models"))
        .logs_dir(path("logs"));
    if let Some(lib) = &o.lib {
        cfg = cfg.library_path(lib.to_string_lossy().to_string());
    }
    if let Some(port) = o.port {
        cfg = cfg.web_service_urls(format!("http://127.0.0.1:{port}"));
    }
    FoundryLocalManager::create(cfg).map_err(|e| format!("Foundry Local could not start: {e}"))
}

/// A file that says the hardware parts were downloaded once. Foundry Local registers them for
/// each process separately, so the model list asks for them again (a quick step when they are
/// already on disk) before it reads the catalog; without it the list shows only the processor.
fn hardware_marker(o: &Options) -> Option<PathBuf> {
    o.data.as_ref().map(|d| d.join("hardware-ready"))
}

/// Downloads (when missing) and registers the hardware parts (NPU / GPU), reporting progress.
async fn hardware(m: &FoundryLocalManager, o: &Options) -> Result<(), String> {
    let result = m
        .download_and_register_eps_with_progress(None, |name: &str, pct: f64| {
            emit(&json!({"type": "progress", "phase": "hardware", "name": name, "pct": pct}));
        })
        .await;
    match result {
        Ok(r) => {
            let eps: Vec<Value> = m
                .discover_eps()
                .unwrap_or_default()
                .iter()
                .map(|e| json!({"name": e.name, "registered": e.is_registered}))
                .collect();
            emit(
                &json!({"type": "hardware", "success": r.success, "status": r.status, "eps": eps}),
            );
            if let Some(path) = hardware_marker(o) {
                let _ = std::fs::write(path, "1");
            }
            Ok(())
        }
        Err(e) => Err(format!("The hardware parts could not be set up: {e}")),
    }
}

async fn job(o: Options) -> Result<(), String> {
    let m = manager(&o)?;
    match o.command.as_str() {
        "catalog" => {
            // Only when the hardware parts were set up before, so the list never starts a big download.
            if hardware_marker(&o).is_some_and(|p| p.exists()) {
                let _ = hardware(&m, &o).await;
            }
            let models = m
                .catalog()
                .get_models()
                .await
                .map_err(|e| format!("The model list could not be read: {e}"))?;
            let mut list = Vec::new();
            for model in &models {
                let Ok(i) = model.info() else { continue };
                let device = i
                    .runtime
                    .as_ref()
                    .map(|r| format!("{:?}", r.device_type))
                    .unwrap_or_default();
                list.push(json!({
                    "alias": model.alias(),
                    "id": i.id,
                    "name": i.display_name.clone().unwrap_or_else(|| model.alias().to_string()),
                    "sizeMb": i.file_size_mb.unwrap_or(0),
                    "tools": i.supports_tool_calling == Some(true),
                    "device": device,
                    "license": i.license,
                    "cached": i.cached,
                    "publisher": i.publisher,
                    "task": i.task,
                    "contextTokens": i.context_length,
                }));
            }
            emit(&json!({"type": "catalog", "models": list}));
        }
        "hardware" => {
            hardware(&m, &o).await?;
            emit(&json!({"type": "done"}));
        }
        "install" => {
            let alias = o.alias.clone().ok_or("--alias is missing")?;
            hardware(&m, &o).await?;
            let model = m
                .catalog()
                .get_model(&alias)
                .await
                .map_err(|e| format!("The model {alias} is not in the catalog: {e}"))?;
            let last = std::sync::atomic::AtomicI64::new(-1);
            model
                .download(Some(move |p: f64| {
                    let step = p as i64;
                    if last.swap(step, std::sync::atomic::Ordering::Relaxed) != step {
                        emit(&json!({"type": "progress", "phase": "model", "pct": p}));
                    }
                }))
                .await
                .map_err(|e| format!("The model could not be downloaded: {e}"))?;
            let i = model.info().map_err(|e| e.to_string())?;
            emit(&json!({"type": "done", "id": i.id, "sizeMb": i.file_size_mb.unwrap_or(0)}));
        }
        "serve" => {
            let alias = o.alias.clone().ok_or("--alias is missing")?;
            hardware(&m, &o).await?;
            let model = m
                .catalog()
                .get_model(&alias)
                .await
                .map_err(|e| format!("The model {alias} is not in the catalog: {e}"))?;
            model
                .load()
                .await
                .map_err(|e| format!("The model could not be loaded: {e}"))?;
            m.start_web_service()
                .await
                .map_err(|e| format!("The local service could not start: {e}"))?;
            let urls = m.urls().map_err(|e| e.to_string())?;
            let device = model
                .info()
                .ok()
                .and_then(|i| i.runtime.as_ref().map(|r| format!("{:?}", r.device_type)))
                .unwrap_or_default();
            emit(&json!({"type": "ready", "urls": urls, "model": model.id(), "device": device}));
            // Answer until Mimer stops this process (Sleep, closing Mimer, or Mimer dying).
            std::future::pending::<()>().await;
        }
        "remove" => {
            let alias = o.alias.clone().ok_or("--alias is missing")?;
            let model = m
                .catalog()
                .get_model(&alias)
                .await
                .map_err(|e| format!("The model {alias} is not in the catalog: {e}"))?;
            model
                .remove_from_cache()
                .await
                .map_err(|e| format!("The model could not be removed: {e}"))?;
            emit(&json!({"type": "done"}));
        }
        other => return Err(format!("unknown command {other}")),
    }
    let _ = m.shutdown();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(s: &str) -> Vec<String> {
        s.split_whitespace().map(String::from).collect()
    }

    #[test]
    fn the_options_are_read() {
        let o = parse_args(&args(
            "serve --lib /l --data /d --alias qwen3-0.6b --port 5000",
        ))
        .unwrap();
        assert_eq!(o.command, "serve");
        assert_eq!(o.lib, Some(PathBuf::from("/l")));
        assert_eq!(o.data, Some(PathBuf::from("/d")));
        assert_eq!(o.alias.as_deref(), Some("qwen3-0.6b"));
        assert_eq!(o.port, Some(5000));
    }

    #[test]
    fn bad_arguments_are_refused() {
        assert!(parse_args(&[]).is_err());
        assert!(parse_args(&args("serve --port x")).is_err());
        assert!(parse_args(&args("serve --nope 1")).is_err());
        assert!(parse_args(&args("serve --alias")).is_err());
    }

    #[test]
    fn a_normal_start_is_not_the_helper() {
        // The test program is not started with the flag.
        assert!(maybe_run().is_none());
    }
}

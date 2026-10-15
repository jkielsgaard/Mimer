//! Mimer backend.

pub mod ai;
pub mod chats;
pub mod commands;
pub mod embeddings;
pub mod engine;
pub mod error;
pub mod export;
pub mod external;
pub mod git;
pub mod import;
pub mod links;
pub mod markdown;
pub mod order;
pub mod projects;
pub mod prompts;
pub mod research;
pub mod search;
pub mod settings;
pub mod state;
pub mod templates;
pub mod vault;

use state::AppState;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{Emitter, Manager};

struct LogGuard(#[allow(dead_code)] Option<tracing_appender::non_blocking::WorkerGuard>);

fn init_logging(dir: Option<std::path::PathBuf>) -> LogGuard {
    let Some(dir) = dir else {
        return LogGuard(None);
    };
    if std::fs::create_dir_all(&dir).is_err() {
        return LogGuard(None);
    }
    let appender = tracing_appender::rolling::daily(dir, "mimer.log");
    let (writer, guard) = tracing_appender::non_blocking(appender);
    let _ = tracing_subscriber::fmt()
        .with_writer(writer)
        .with_ansi(false)
        .try_init();
    LogGuard(Some(guard))
}

/// Builds and runs the application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let guard = init_logging(app.path().app_log_dir().ok());
            app.manage(guard);
            let config_dir = app.path().app_config_dir()?;
            let settings_path = config_dir.join("settings.json");
            let (loaded, error) = match settings::load(&settings_path) {
                Ok(s) => (s, None),
                Err(e) => {
                    tracing::error!("settings: {e}");
                    (settings::Settings::default(), Some(e.to_string()))
                }
            };
            app.manage(AppState::new(loaded, settings_path, error));
            git::autosave::spawn_idle_task(app.handle().clone());
            engine::service::startup(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle().clone();
                let state = app.state::<AppState>();
                if state.current_vault().is_err() {
                    return;
                }
                if state.closing.swap(true, Ordering::SeqCst) {
                    return; // second request: let it close
                }
                api.prevent_close();
                let _ = window.emit("app://close-requested", ());
                let w = window.clone();
                tauri::async_runtime::spawn(async move {
                    // The frontend normally finishes first via `finish_close`; this is the 5 s fallback.
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    commands::app::commit_on_close(&app);
                    let _ = w.destroy();
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::vault::open_vault,
            commands::vault::create_vault,
            commands::vault::forget_vault,
            commands::vault::missing_vaults,
            commands::vault::close_vault,
            commands::vault::get_tree,
            commands::vault::read_note,
            commands::vault::write_note,
            commands::vault::create_note,
            commands::vault::create_folder,
            commands::vault::preview_rename,
            commands::vault::rename_path,
            commands::vault::rename_note_quietly,
            commands::vault::delete_path,
            commands::vault::save_attachment,
            commands::vault::reveal_in_file_manager,
            commands::vault::open_attachment,
            commands::git::commit_now,
            commands::git::file_history,
            commands::git::file_at_commit,
            commands::git::restore_file,
            commands::git::deleted_files,
            commands::git::restore_deleted,
            commands::search::search,
            commands::search::backlinks,
            commands::search::all_tags,
            commands::projects::list_projects,
            commands::projects::create_project,
            commands::projects::update_project,
            commands::projects::delete_project,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::get_default_base_instruction,
            commands::settings::set_api_key,
            commands::settings::has_api_key,
            commands::settings::delete_api_key,
            commands::settings::list_models,
            commands::settings::test_provider,
            commands::ai::ai_chat,
            commands::ai::ai_inline,
            commands::ai::raven_chat,
            commands::ai::ai_cancel,
            commands::ai::get_proposals,
            commands::ai::apply_proposals,
            commands::ai::discard_proposals,
            commands::app::finish_close,
            commands::chats::list_chats,
            commands::chats::load_chat,
            commands::chats::save_chat,
            commands::chats::delete_chat,
            commands::chats::delete_all_chats,
            commands::chats::list_prompts,
            commands::chats::add_prompt,
            commands::chats::remove_prompt,
            commands::index_page::create_index_page,
            commands::research::build_research_prompt,
            commands::devtools::open_devtools,
            commands::order::get_tree_order,
            commands::order::set_folder_order,
            commands::external::open_external,
            commands::images::add_images,
            commands::images::image_usage,
            commands::import::scan_import,
            commands::import::run_import,
            commands::import::cancel_import,
            commands::templates::list_templates,
            commands::templates::create_note_from_template,
            commands::templates::open_daily_note,
            commands::templates::create_standard_note,
            commands::templates::seed_standard_templates,
            commands::templates::save_template_from_note,
            commands::templates::update_vault_config,
            commands::export::export_document,
            commands::export::export_preview_html,
            commands::export::print_window,
            commands::embeddings::get_embedding_status,
            commands::embeddings::start_embedding_index,
            commands::embeddings::cancel_embedding_index,
            commands::embeddings::semantic_search,
            commands::embeddings::hybrid_search,
            commands::engine::engine_hardware,
            commands::engine::engine_catalog,
            commands::engine::engine_status,
            commands::engine::engine_install,
            commands::engine::engine_cancel_install,
            commands::engine::engine_add_model,
            commands::engine::engine_wake,
            commands::engine::engine_sleep,
            commands::engine::engine_remove,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Mimer")
        .run(|app, event| {
            // The built-in AI must never outlive Mimer: it holds gigabytes of memory.
            if matches!(event, tauri::RunEvent::Exit) {
                engine::service::shutdown(app);
            }
        });
}

use crate::error::AppError;
use crate::state::AppState;
use crate::vault::fs_ops::{self, NoteContent};
use crate::vault::ops::{self, RenamePreview, RenameResult};
use crate::vault::session;
use crate::vault::tree::{self, TreeNode};
use crate::vault::{paths, watcher, VaultInfo};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

/// Opens a vault and makes it current. The session steps live in `vault::session`; this adds the
/// window-bound setup: asset scope, file watcher, background index sync and commit events.
fn open_inner(app: &AppHandle, state: &AppState, path: &str) -> Result<VaultInfo, AppError> {
    // Two opens at once would both commit "Recovered uncommitted changes" and race on the branch.
    let _opening = state
        .open_lock
        .lock()
        .map_err(|_| AppError::Io("State lock poisoned".into()))?;
    let emitter = app.clone();
    let vault = session::open_folder(
        state,
        path,
        Box::new(move |sha, message| {
            let _ = emitter.emit(
                "git://committed",
                serde_json::json!({ "sha": sha, "message": message }),
            );
        }),
    )?;
    if let Err(e) = app
        .asset_protocol_scope()
        .allow_directory(&vault.root, true)
    {
        tracing::warn!("could not extend asset scope: {e}");
    }
    match watcher::start(app.clone(), &vault) {
        Ok(h) => {
            if let Ok(mut w) = vault.watcher.lock() {
                *w = Some(h);
            }
        }
        Err(e) => tracing::warn!("file watcher unavailable: {e}"),
    }
    let background = vault.clone();
    let handle = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = background.sync_index() {
            tracing::warn!("index sync failed: {e}");
        }
        let _ = handle.emit("vault://index-updated", serde_json::json!({}));
    });
    let info = vault.info();
    session::install(state, vault)?;
    session::remember(state, &info.path)?;
    Ok(info)
}

#[tauri::command]
pub async fn open_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<VaultInfo, AppError> {
    open_inner(&app, &state, &path)
}

/// Removes a vault from the recent list. The folder on disk is not touched.
#[tauri::command]
pub async fn forget_vault(state: State<'_, AppState>, path: String) -> Result<(), AppError> {
    session::forget(&state, &path)
}

/// The recent vaults whose folder no longer exists.
#[tauri::command]
pub async fn missing_vaults(state: State<'_, AppState>) -> Result<Vec<String>, AppError> {
    Ok(session::missing_vaults(&state))
}

#[tauri::command]
pub async fn create_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    parent: String,
    name: String,
) -> Result<VaultInfo, AppError> {
    let dir = session::create_folder(&parent, &name)?;
    let info = open_inner(&app, &state, &dir.to_string_lossy())?;
    // A new vault starts with folders and templates for meeting notes and quick notes.
    match state.current_vault() {
        Ok(v) => {
            if let Err(e) = crate::templates::standard::seed_defaults(&v) {
                tracing::warn!("could not add the standard templates: {e}");
            }
        }
        Err(e) => tracing::warn!("no vault to add standard templates to: {e}"),
    }
    Ok(state.current_vault().map_or(info, |v| v.info()))
}

#[tauri::command]
pub async fn close_vault(state: State<'_, AppState>) -> Result<(), AppError> {
    session::close_current(&state);
    Ok(())
}

#[tauri::command]
pub async fn get_tree(state: State<'_, AppState>) -> Result<Vec<TreeNode>, AppError> {
    tree::build_tree(&state.current_vault()?.root)
}

#[tauri::command]
pub async fn read_note(state: State<'_, AppState>, path: String) -> Result<NoteContent, AppError> {
    fs_ops::read_note(&state.current_vault()?.root, &path)
}

#[tauri::command]
pub async fn write_note(
    state: State<'_, AppState>,
    path: String,
    content: String,
) -> Result<(), AppError> {
    let v = state.current_vault()?;
    ops::write_note(&v, &path, &content)?;
    crate::trace::record(
        &state,
        &v,
        &crate::trace::Event::NoteWritten { path: &path },
    );
    Ok(())
}

#[tauri::command]
pub async fn create_note(
    state: State<'_, AppState>,
    folder: String,
    name: Option<String>,
) -> Result<String, AppError> {
    let v = state.current_vault()?;
    ops::create_note(&v, &folder, name.as_deref())
}

#[tauri::command]
pub async fn create_folder(
    state: State<'_, AppState>,
    parent: String,
    name: String,
) -> Result<String, AppError> {
    let v = state.current_vault()?;
    ops::create_folder(&v, &parent, &name)
}

#[tauri::command]
pub async fn preview_rename(
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> Result<RenamePreview, AppError> {
    let v = state.current_vault()?;
    ops::preview_rename(&v, &from, &to)
}

#[tauri::command]
pub async fn rename_path(
    state: State<'_, AppState>,
    from: String,
    to: String,
    update_links: bool,
) -> Result<RenameResult, AppError> {
    let v = state.current_vault()?;
    ops::rename_path(&v, &from, &to, update_links)
}

/// Renames a note inside its folder without commits (a new note taking the name of its title).
#[tauri::command]
pub async fn rename_note_quietly(
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> Result<(), AppError> {
    let v = state.current_vault()?;
    ops::rename_note_quietly(&v, &from, &to)
}

#[tauri::command]
pub async fn delete_path(state: State<'_, AppState>, path: String) -> Result<(), AppError> {
    let v = state.current_vault()?;
    ops::delete_path(&v, &path)
}

#[tauri::command]
pub async fn save_attachment(
    state: State<'_, AppState>,
    note_path: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String, AppError> {
    let v = state.current_vault()?;
    ops::save_attachment(&v, &note_path, &file_name, &bytes)
}

#[tauri::command]
pub async fn reveal_in_file_manager(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), AppError> {
    let abs = paths::resolve(&state.current_vault()?.root, &path, None)?;
    app.opener()
        .reveal_item_in_dir(abs)
        .map_err(|e| AppError::Io(e.to_string()))
}

#[tauri::command]
pub async fn open_attachment(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), AppError> {
    let abs = paths::resolve(&state.current_vault()?.root, &path, None)?;
    app.opener()
        .open_path(abs.to_string_lossy(), None::<&str>)
        .map_err(|e| AppError::Io(e.to_string()))
}

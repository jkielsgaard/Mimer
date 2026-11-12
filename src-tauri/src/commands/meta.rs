//! TEMPORARY, for version 0.23 only: the move of pins and "waiting for" from the notes to
//! `.vault/meta.json`, which asks the person first (see `meta::migrate`).

use crate::error::AppError;
use crate::meta::migrate::{self, MigrationCount};
use crate::state::AppState;
use tauri::State;

/// How much in the open vault is still written the old way.
#[tauri::command]
pub async fn meta_migration_status(state: State<'_, AppState>) -> Result<MigrationCount, AppError> {
    let v = state.current_vault()?;
    Ok(migrate::scan(&v))
}

/// Moves it, after the person said yes. Returns how much was moved.
#[tauri::command]
pub async fn meta_migrate(state: State<'_, AppState>) -> Result<MigrationCount, AppError> {
    let v = state.current_vault()?;
    migrate::run(&v)
}

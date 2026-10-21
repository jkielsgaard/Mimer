use crate::chats::{self, ChatSummary, StoredChat};
use crate::error::AppError;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_chats(state: State<'_, AppState>) -> Result<Vec<ChatSummary>, AppError> {
    Ok(chats::list(&state.current_vault()?.root))
}

#[tauri::command]
pub async fn load_chat(state: State<'_, AppState>, id: String) -> Result<StoredChat, AppError> {
    chats::load(&state.current_vault()?.root, &id)
}

#[tauri::command]
pub async fn save_chat(
    state: State<'_, AppState>,
    chat: StoredChat,
) -> Result<StoredChat, AppError> {
    chats::save(&state.current_vault()?.root, chat)
}

#[tauri::command]
pub async fn delete_chat(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    chats::delete(&state.current_vault()?.root, &id)
}

#[tauri::command]
pub async fn delete_all_chats(state: State<'_, AppState>) -> Result<u32, AppError> {
    chats::delete_all(&state.current_vault()?.root)
}

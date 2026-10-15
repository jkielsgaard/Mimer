use crate::chats::{self, ChatSummary, StoredChat};
use crate::error::AppError;
use crate::git::{CommitKind, CommitReason};
use crate::prompts::{self, SavedPrompt};
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

#[tauri::command]
pub async fn list_prompts(state: State<'_, AppState>) -> Result<Vec<SavedPrompt>, AppError> {
    Ok(prompts::list(&state.current_vault()?.root))
}

#[tauri::command]
pub async fn add_prompt(
    state: State<'_, AppState>,
    title: String,
    text: String,
) -> Result<SavedPrompt, AppError> {
    let v = state.current_vault()?;
    let prompt = prompts::add(&v.root, &title, &text)?;
    let reason = CommitReason::new(
        CommitKind::Prompts,
        Some(format!("added \"{}\"", prompt.title)),
    );
    v.commit(reason, Some(&[".vault/prompts.json".to_string()]))?;
    Ok(prompt)
}

#[tauri::command]
pub async fn remove_prompt(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let v = state.current_vault()?;
    if let Some(title) = prompts::remove(&v.root, &id)? {
        let reason = CommitReason::new(CommitKind::Prompts, Some(format!("removed \"{title}\"")));
        v.commit(reason, Some(&[".vault/prompts.json".to_string()]))?;
    }
    Ok(())
}

use crate::ai::proposals::{self, ApplyResult, ProposalSetView};
use crate::ai::{agent, inline, ChatEvent, ChatRequest, InlineRequest};
use crate::error::AppError;
use crate::state::AppState;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

fn register(state: &AppState) -> Result<(Uuid, CancellationToken), AppError> {
    let id = Uuid::new_v4();
    let token = CancellationToken::new();
    state
        .ai_tasks
        .lock()
        .map_err(|_| AppError::Io("State lock poisoned".into()))?
        .insert(id, token.clone());
    Ok((id, token))
}

#[tauri::command]
pub async fn ai_chat(
    app: AppHandle,
    state: State<'_, AppState>,
    request: ChatRequest,
    channel: Channel<ChatEvent>,
) -> Result<Uuid, AppError> {
    let (id, token) = register(&state)?;
    tauri::async_runtime::spawn(async move {
        if let Err(error) = agent::run_chat(&app, request, &channel, token).await {
            let _ = channel.send(ChatEvent::Error { error });
        }
        if let Ok(mut m) = app.state::<AppState>().ai_tasks.lock() {
            m.remove(&id);
        }
    });
    Ok(id)
}

#[tauri::command]
pub async fn ai_inline(
    app: AppHandle,
    state: State<'_, AppState>,
    request: InlineRequest,
    channel: Channel<ChatEvent>,
) -> Result<Uuid, AppError> {
    let (id, token) = register(&state)?;
    tauri::async_runtime::spawn(async move {
        if let Err(error) = inline::run_inline(&app, request, &channel, token).await {
            let _ = channel.send(ChatEvent::Error { error });
        }
        if let Ok(mut m) = app.state::<AppState>().ai_tasks.lock() {
            m.remove(&id);
        }
    });
    Ok(id)
}

#[tauri::command]
pub async fn ai_cancel(state: State<'_, AppState>, task_id: Uuid) -> Result<(), AppError> {
    if let Some(t) = state
        .ai_tasks
        .lock()
        .map_err(|_| AppError::Io("State lock poisoned".into()))?
        .get(&task_id)
    {
        t.cancel();
    }
    Ok(())
}

#[tauri::command]
pub async fn get_proposals(
    state: State<'_, AppState>,
    set_id: Uuid,
) -> Result<ProposalSetView, AppError> {
    let vault = state.current_vault()?;
    let map = state
        .proposals
        .lock()
        .map_err(|_| AppError::Io("State lock poisoned".into()))?;
    let set = map
        .get(&set_id)
        .ok_or_else(|| AppError::NotFound("These proposals are no longer available".into()))?;
    Ok(proposals::view(&vault.root, set))
}

#[tauri::command]
pub async fn apply_proposals(
    state: State<'_, AppState>,
    set_id: Uuid,
    accepted_ids: Vec<Uuid>,
    confirmed_changed_ids: Vec<Uuid>,
) -> Result<ApplyResult, AppError> {
    let vault = state.current_vault()?;
    let set = {
        let map = state
            .proposals
            .lock()
            .map_err(|_| AppError::Io("State lock poisoned".into()))?;
        map.get(&set_id)
            .cloned()
            .ok_or_else(|| AppError::NotFound("These proposals are no longer available".into()))?
    };
    let result = proposals::apply(&vault, &set, &accepted_ids, &confirmed_changed_ids)?;
    let mut map = state
        .proposals
        .lock()
        .map_err(|_| AppError::Io("State lock poisoned".into()))?;
    proposals::forget_applied(&mut map, &set_id, &result.applied_ids);
    Ok(result)
}

#[tauri::command]
pub async fn discard_proposals(state: State<'_, AppState>, set_id: Uuid) -> Result<(), AppError> {
    state
        .proposals
        .lock()
        .map_err(|_| AppError::Io("State lock poisoned".into()))?
        .remove(&set_id);
    Ok(())
}

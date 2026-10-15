//! Idle autosave: commits all changes after a period without edits.

use crate::state::AppState;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

use super::{CommitKind, CommitReason};

/// Records the time of the latest change.
#[derive(Debug, Default)]
pub struct AutosaveState {
    pub last_change: Option<Instant>,
}

impl AutosaveState {
    /// Marks "now" as the latest change.
    pub fn touch(&mut self) {
        self.last_change = Some(Instant::now());
    }

    /// True when `idle` has passed since the latest change.
    pub fn is_idle(&self, idle: Duration) -> bool {
        self.last_change.is_some_and(|t| t.elapsed() >= idle)
    }
}

/// Spawns the background task that commits after the idle period.
pub fn spawn_idle_task(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(20)).await;
            let state = app.state::<AppState>();
            let minutes = state
                .settings
                .read()
                .map(|s| s.git.idle_commit_minutes)
                .unwrap_or(5);
            let Ok(vault) = state.current_vault() else {
                continue;
            };
            let idle = vault
                .autosave
                .lock()
                .map(|a| a.is_idle(Duration::from_secs(u64::from(minutes) * 60)))
                .unwrap_or(false);
            if !idle {
                continue;
            }
            let v = vault.clone();
            let _ = tauri::async_runtime::spawn_blocking(move || {
                let r = v.commit(CommitReason::new(CommitKind::Idle, None), None);
                if let Ok(mut a) = v.autosave.lock() {
                    a.last_change = None;
                }
                r
            })
            .await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idle_detection() {
        let mut a = AutosaveState::default();
        assert!(!a.is_idle(Duration::from_secs(0)));
        a.touch();
        assert!(a.is_idle(Duration::from_secs(0)));
        assert!(!a.is_idle(Duration::from_secs(60)));
    }
}

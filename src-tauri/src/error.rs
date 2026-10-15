//! Application-wide error type. Serialised to the frontend as `{ code, message }`.

use serde::Serialize;
use ts_rs::TS;

/// Every error that can cross the IPC boundary.
#[derive(Debug, Clone, thiserror::Error, Serialize, TS)]
#[serde(tag = "code", content = "message")]
#[ts(export)]
pub enum AppError {
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    InvalidPath(String),
    #[error("{0}")]
    OutsideScope(String),
    #[error("{0}")]
    AlreadyExists(String),
    #[error("{0}")]
    Io(String),
    #[error("{0}")]
    Git(String),
    #[error("{0}")]
    Search(String),
    #[error("{0}")]
    Provider(String),
    /// A cloud provider was requested for a local-only project.
    #[error("{0}")]
    ProviderBlocked(String),
    #[error("{0}")]
    ToolsUnsupported(String),
    #[error("{0}")]
    Settings(String),
    #[error("{0}")]
    Conflict(String),
}

/// Convenience alias used throughout the backend.
pub type AppResult<T> = Result<T, AppError>;

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        if e.kind() == std::io::ErrorKind::NotFound {
            AppError::NotFound(e.to_string())
        } else {
            AppError::Io(e.to_string())
        }
    }
}

impl From<git2::Error> for AppError {
    fn from(e: git2::Error) -> Self {
        AppError::Git(e.message().to_string())
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::Search(e.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError::Provider(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Io(format!("JSON error: {e}"))
    }
}

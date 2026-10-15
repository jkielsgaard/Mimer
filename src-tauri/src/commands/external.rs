use crate::error::AppError;
use tauri::{AppHandle, Runtime};

/// Opens a web, mail or phone address in the user's own program. A failure is returned, so the
/// user is told instead of nothing happening.
#[tauri::command]
pub async fn open_external<R: Runtime>(app: AppHandle<R>, url: String) -> Result<(), AppError> {
    crate::external::check_url(&url)?;
    #[cfg(target_os = "linux")]
    {
        let _ = &app;
        tauri::async_runtime::spawn_blocking(move || crate::external::open_linux(&url))
            .await
            .map_err(|e| AppError::Io(e.to_string()))?
    }
    #[cfg(not(target_os = "linux"))]
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener().open_url(&url, None::<&str>).map_err(|e| {
            AppError::Io(format!(
                "The link could not be opened ({e}). Copy the address and open it in a browser yourself."
            ))
        })
    }
}

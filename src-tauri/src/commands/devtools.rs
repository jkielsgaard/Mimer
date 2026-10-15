/// Opens the web inspector of the main window (the "Inspect element" entry of the right-click menu).
#[tauri::command]
pub async fn open_devtools(window: tauri::WebviewWindow) {
    window.open_devtools();
}

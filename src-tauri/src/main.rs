// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Mimer started again as the Foundry Local helper: no window, no Tauri.
    if let Some(code) = mimer_lib::foundry::helper::maybe_run() {
        std::process::exit(code);
    }
    mimer_lib::run()
}

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WindowInfo {
    label: String,
    file_path: Option<String>,
    title: String,
}

struct WindowRegistry {
    windows: Mutex<HashMap<String, WindowInfo>>,
    session_path: PathBuf,
}

fn get_session_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("window_session.json")
}

#[tauri::command]
fn register_window(
    state: State<WindowRegistry>,
    label: String,
    file_path: Option<String>,
    title: String,
) -> Result<(), String> {
    let mut windows = state.windows.lock().map_err(|e| e.to_string())?;
    windows.insert(
        label.clone(),
        WindowInfo {
            label,
            file_path,
            title,
        },
    );
    Ok(())
}

#[tauri::command]
fn unregister_window(state: State<WindowRegistry>, label: String) -> Result<(), String> {
    let mut windows = state.windows.lock().map_err(|e| e.to_string())?;
    windows.remove(&label);
    Ok(())
}

#[tauri::command]
fn get_all_windows(state: State<WindowRegistry>) -> Result<Vec<WindowInfo>, String> {
    let windows = state.windows.lock().map_err(|e| e.to_string())?;
    Ok(windows.values().cloned().collect())
}

#[tauri::command]
fn update_window_info(
    state: State<WindowRegistry>,
    label: String,
    file_path: Option<String>,
    title: String,
) -> Result<(), String> {
    let mut windows = state.windows.lock().map_err(|e| e.to_string())?;
    if let Some(window_info) = windows.get_mut(&label) {
        window_info.file_path = file_path;
        window_info.title = title;
    }
    Ok(())
}

#[tauri::command]
fn save_window_session(
    state: State<WindowRegistry>,
    file_paths: Vec<String>,
) -> Result<(), String> {
    // Save to file
    let json = serde_json::to_string(&file_paths).map_err(|e| e.to_string())?;

    // Create parent directory if it doesn't exist
    if let Some(parent) = state.session_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&state.session_path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_window_session(state: State<WindowRegistry>) -> Result<Vec<String>, String> {
    // Load from file
    if !state.session_path.exists() {
        return Ok(Vec::new());
    }

    let json = fs::read_to_string(&state.session_path).map_err(|e| e.to_string())?;
    let file_paths: Vec<String> = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    Ok(file_paths)
}

#[tauri::command]
async fn show_close_confirmation(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

    let answer = app
        .dialog()
        .message("You have unsaved changes. Do you want to close without saving?")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancel)
        .blocking_show();

    Ok(answer)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            register_window,
            unregister_window,
            get_all_windows,
            update_window_info,
            save_window_session,
            load_window_session,
            show_close_confirmation,
        ])
        .setup(|app| {
            // Initialize window registry with session path
            let session_path = get_session_path(app.handle());
            app.manage(WindowRegistry {
                windows: Mutex::new(HashMap::new()),
                session_path,
            });

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Get window for devtools and position traffic lights on macOS
            if let Some(_window) = app.get_webview_window("main") {
                #[cfg(debug_assertions)]
                {
                    _window.open_devtools();
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

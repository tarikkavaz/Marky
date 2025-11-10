use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{mpsc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager, State};

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

struct FileWatcherRegistry {
    // Store stop channels for each watcher
    stop_channels: Mutex<HashMap<String, mpsc::Sender<()>>>,
    app_handle: tauri::AppHandle,
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

#[tauri::command]
async fn watch_file(
    state: State<'_, FileWatcherRegistry>,
    file_path: String,
) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    
    // Check if already watching
    {
        let stop_channels = state.stop_channels.lock().map_err(|e| e.to_string())?;
        if stop_channels.contains_key(&file_path) {
            return Ok(()); // Already watching
        }
    }

    // Create channels
    let (event_tx, event_rx) = mpsc::channel();
    let (stop_tx, stop_rx) = mpsc::channel();
    
    // Create watcher
    let mut watcher = RecommendedWatcher::new(
        move |result: Result<Event, notify::Error>| {
            if let Ok(event) = result {
                let _ = event_tx.send(event);
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    // Watch the parent directory (more reliable on macOS than watching individual files)
    let parent = path.parent().ok_or_else(|| "File has no parent directory".to_string())?;
    
    watcher
        .watch(parent, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch directory: {}", e))?;

    // Store stop channel
    {
        let mut stop_channels = state.stop_channels.lock().map_err(|e| e.to_string())?;
        stop_channels.insert(file_path.clone(), stop_tx);
    }

    // Spawn blocking task to handle events and keep watcher alive
    let app_handle = state.app_handle.clone();
    let watched_path = path.clone();
    
    tauri::async_runtime::spawn_blocking(move || {
        // Keep watcher alive by moving it into this task
        let _watcher = watcher;
        
        loop {
            // Use select-like behavior: check stop signal with timeout, then check events
            match stop_rx.recv_timeout(Duration::from_millis(50)) {
                Ok(_) => {
                    break; // Stop watching
                }
                Err(_) => {
                    // Timeout - check for file events
                    match event_rx.try_recv() {
                        Ok(event) => {
                            // Check if this event is for our file
                            let watched_path_str = watched_path.to_string_lossy().to_string();
                            let watched_file_name = watched_path.file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("");
                            
                            let is_relevant = event.paths.iter().any(|p| {
                                // Try multiple comparison methods
                                let event_path_str = p.to_string_lossy().to_string();
                                
                                // Check if filename matches (for directory watching)
                                let event_file_name = p.file_name()
                                    .and_then(|n| n.to_str())
                                    .unwrap_or("");
                                let filename_match = !watched_file_name.is_empty() && 
                                    event_file_name == watched_file_name;
                                
                                // Direct path comparison
                                let direct_match = p == &watched_path || event_path_str == watched_path_str;
                                
                                // Canonical path comparison
                                let canonical_match = if let (Ok(event_canonical), Ok(watched_canonical)) = 
                                    (p.canonicalize(), watched_path.canonicalize()) {
                                    event_canonical == watched_canonical
                                } else {
                                    false
                                };
                                
                                // Case-insensitive comparison (for macOS)
                                #[cfg(target_os = "macos")]
                                let case_insensitive_match = {
                                    event_path_str.to_lowercase() == watched_path_str.to_lowercase() ||
                                    event_file_name.to_lowercase() == watched_file_name.to_lowercase()
                                };
                                #[cfg(not(target_os = "macos"))]
                                let case_insensitive_match = false;
                                
                                filename_match || direct_match || canonical_match || case_insensitive_match
                            });

                            if is_relevant {
                                let app_handle_clone = app_handle.clone();
                                let watched_path_clone = watched_path.clone();
                                let watched_path_str_clone = watched_path_str.clone();
                                
                                match event.kind {
                                    EventKind::Modify(_) | EventKind::Create(_) => {
                                        // Only emit if the file still exists (to avoid false positives on delete)
                                        if watched_path_clone.exists() {
                                            // Spawn async task for debouncing
                                            let app_handle_for_debounce = app_handle_clone.clone();
                                            let watched_path_for_debounce = watched_path_clone.clone();
                                            let watched_path_str_for_debounce = watched_path_str_clone.clone();
                                            
                                            tauri::async_runtime::spawn(async move {
                                                // Debounce: wait a bit before emitting to handle rapid changes
                                                tauri::async_runtime::spawn_blocking(move || {
                                                    std::thread::sleep(Duration::from_millis(100));
                                                }).await.ok();
                                                
                                                // Double-check file still exists after debounce
                                                if watched_path_for_debounce.exists() {
                                                    let _ = app_handle_for_debounce.emit("file-changed", &watched_path_str_for_debounce);
                                                }
                                            });
                                        }
                                    }
                                    EventKind::Remove(_) => {
                                        let _ = app_handle.emit("file-deleted", &watched_path_str);
                                    }
                                    _ => {}
                                }
                            }
                        }
                        Err(mpsc::TryRecvError::Empty) => {
                            // No events available, continue loop
                        }
                        Err(mpsc::TryRecvError::Disconnected) => {
                            // Channel disconnected, stop watching
                            break;
                        }
                    }
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn unwatch_file(
    state: State<'_, FileWatcherRegistry>,
    file_path: String,
) -> Result<(), String> {
    let mut stop_channels = state.stop_channels.lock().map_err(|e| e.to_string())?;
    if let Some(stop_tx) = stop_channels.remove(&file_path) {
        let _ = stop_tx.send(());
    }
    Ok(())
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
            watch_file,
            unwatch_file,
        ])
        .setup(|app| {
            // Initialize window registry with session path
            let session_path = get_session_path(app.handle());
            app.manage(WindowRegistry {
                windows: Mutex::new(HashMap::new()),
                session_path,
            });

            // Initialize file watcher registry
            app.manage(FileWatcherRegistry {
                stop_channels: Mutex::new(HashMap::new()),
                app_handle: app.handle().clone(),
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

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{mpsc, Mutex};
use std::time::Duration;
#[cfg(any(target_os = "macos", target_os = "ios"))]
use tauri::{Emitter, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder};
#[cfg(not(any(target_os = "macos", target_os = "ios")))]
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

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

// Helper function to create a new window (used by both command and menu handler)
async fn create_new_window_internal(app: &tauri::AppHandle) -> Result<String, String> {
    let label = format!("window-{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis());
    let title = "Untitled".to_string();
    
    let url = WebviewUrl::App("/".into());
    
    let builder = WebviewWindowBuilder::new(app, &label, url)
        .title(&title)
        .inner_size(800.0, 1000.0)
        .decorations(true)
        .transparent(true)
        .center()
        .resizable(true);
    
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Visible)
        .hidden_title(false);
    
    let window_result = builder.build();
    
    match window_result {
        Ok(_window) => {
            // Register the window in the registry
            if let Some(window_registry) = app.try_state::<WindowRegistry>() {
                if let Ok(mut windows) = window_registry.windows.lock() {
                    windows.insert(
                        label.clone(),
                        WindowInfo {
                            label: label.clone(),
                            file_path: None,
                            title: title.clone(),
                        },
                    );
                }
            }
            Ok(label)
        }
        Err(e) => Err(format!("Failed to create window: {}", e))
    }
}

#[tauri::command]
async fn create_new_window(
    app: tauri::AppHandle,
    _state: State<'_, WindowRegistry>,
) -> Result<String, String> {
    // Use the internal function
    create_new_window_internal(&app).await
}

// Helper function to create or use a window with a file path
fn create_window_with_file(
    app_handle: &tauri::AppHandle,
    window_registry: &State<WindowRegistry>,
    file_path: PathBuf,
    use_main_window: bool,
) {
    // Check if it's a markdown or text file
    if let Some(ext) = file_path.extension() {
        let ext_str = ext.to_string_lossy().to_lowercase();
        if ext_str == "md" || ext_str == "markdown" || ext_str == "txt" {
            // Allow file access via asset protocol scope (requires protocol-asset feature)
            let asset_protocol_scope = app_handle.asset_protocol_scope();
            let _ = asset_protocol_scope.allow_file(&file_path);
            
            // Convert path to string
            let file_path_str = file_path.to_string_lossy().to_string();
            
            // Create a new window with the file path
            let label = format!("window-{}", std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis());
            let title = file_path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Untitled")
                .to_string();
            
            // Use initialization script to pass file path (like the example)
            let escaped_path = file_path_str.replace('\\', "\\\\").replace('"', "\\\"");
            let init_script = format!("window.openedFile = \"{}\";", escaped_path);
            
            // If use_main_window is true, try to use the existing main window
            if use_main_window {
                if let Some(main_window) = app_handle.get_webview_window("main") {
                    // Use initialization script to set the file path (more reliable than event)
                    // This ensures the file is loaded even if the window isn't fully ready
                    let escaped_path = file_path_str.replace('\\', "\\\\").replace('"', "\\\"");
                    let init_script = format!("window.openedFile = \"{}\";", escaped_path);
                    let _ = main_window.eval(&init_script);
                    // Also emit event as backup
                    let _ = main_window.emit("open-file", &file_path_str);
                    // Update the window title
                    let _ = main_window.set_title(&title);
                    // Register the window in the registry
                    if let Ok(mut windows) = window_registry.windows.lock() {
                        windows.insert(
                            "main".to_string(),
                            WindowInfo {
                                label: "main".to_string(),
                                file_path: Some(file_path_str.clone()),
                                title: title.clone(),
                            },
                        );
                    }
                    return;
                }
            }
            
            // Otherwise, create a new window
            let url = WebviewUrl::App("/".into());
            
            let builder = WebviewWindowBuilder::new(app_handle, &label, url)
                .title(&title)
                .inner_size(800.0, 1000.0)
                .decorations(true)
                .transparent(true)
                .center()
                .resizable(true);
            
            #[cfg(target_os = "macos")]
            let builder = builder
                .title_bar_style(tauri::TitleBarStyle::Visible)
                .hidden_title(false);
            
            let window_result = builder
                .initialization_script(&init_script)
                .build();
            
            // Register the window in the registry
            if let Ok(_window) = window_result {
                if let Ok(mut windows) = window_registry.windows.lock() {
                    windows.insert(
                        label.clone(),
                        WindowInfo {
                            label: label.clone(),
                            file_path: Some(file_path_str.clone()),
                            title: title.clone(),
                        },
                    );
                }
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
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
            create_new_window,
        ])
        .setup(|app| {
            // Prevent app from quitting when all windows are closed (macOS behavior)
            // Keep app running even when all windows are closed
            #[cfg(target_os = "macos")]
            {
                // Use Regular activation policy but handle window close to prevent quit
                app.set_activation_policy(tauri::ActivationPolicy::Regular);
            }
            
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

            // Build native menu with OS-appropriate structure
            let app_handle = app.handle().clone();
            let new_window_id = tauri::menu::MenuId::new("new-window");
            let open_file_id = tauri::menu::MenuId::new("open-file");
            let save_file_id = tauri::menu::MenuId::new("save-file");
            let save_file_as_id = tauri::menu::MenuId::new("save-file-as");
            let about_id = tauri::menu::MenuId::new("about");
            let help_id = tauri::menu::MenuId::new("help");
            let quit_id = tauri::menu::MenuId::new("quit");
            
            #[cfg(target_os = "macos")]
            {
                // macOS: Add items to File menu
                let new_window_item = MenuItem::with_id(
                    &app_handle,
                    new_window_id.clone(),
                    "New Window",
                    true,
                    Some("cmd+n"),
                ).map_err(|e| format!("Failed to create menu item: {}", e))?;
                
                let open_file_item = MenuItem::with_id(
                    &app_handle,
                    open_file_id.clone(),
                    "Open File",
                    true,
                    Some("cmd+o"),
                ).map_err(|e| format!("Failed to create menu item: {}", e))?;
                
                let save_file_item = MenuItem::with_id(
                    &app_handle,
                    save_file_id.clone(),
                    "Save",
                    true,
                    Some("cmd+s"),
                ).map_err(|e| format!("Failed to create menu item: {}", e))?;
                
                let save_file_as_item = MenuItem::with_id(
                    &app_handle,
                    save_file_as_id.clone(),
                    "Save As...",
                    true,
                    Some("cmd+shift+s"),
                ).map_err(|e| format!("Failed to create menu item: {}", e))?;
                
                let about_item = MenuItem::with_id(
                    &app_handle,
                    about_id.clone(),
                    "About Marky",
                    true,
                    None::<&str>,
                ).map_err(|e| format!("Failed to create menu item: {}", e))?;
                
                let help_item = MenuItem::with_id(
                    &app_handle,
                    help_id.clone(),
                    "Help",
                    true,
                    None::<&str>,
                ).map_err(|e| format!("Failed to create menu item: {}", e))?;
                
                let quit_item = MenuItem::with_id(
                    &app_handle,
                    quit_id.clone(),
                    "Quit Marky",
                    true,
                    Some("cmd+q"),
                ).map_err(|e| format!("Failed to create menu item: {}", e))?;
                
                // Edit menu items using PredefinedMenuItem for OS defaults
                let undo_item = PredefinedMenuItem::undo(&app_handle, None)
                    .map_err(|e| format!("Failed to create undo item: {}", e))?;
                let redo_item = PredefinedMenuItem::redo(&app_handle, None)
                    .map_err(|e| format!("Failed to create redo item: {}", e))?;
                let cut_item = PredefinedMenuItem::cut(&app_handle, None)
                    .map_err(|e| format!("Failed to create cut item: {}", e))?;
                let copy_item = PredefinedMenuItem::copy(&app_handle, None)
                    .map_err(|e| format!("Failed to create copy item: {}", e))?;
                let paste_item = PredefinedMenuItem::paste(&app_handle, None)
                    .map_err(|e| format!("Failed to create paste item: {}", e))?;
                let select_all_item = PredefinedMenuItem::select_all(&app_handle, None)
                    .map_err(|e| format!("Failed to create select all item: {}", e))?;
                
                let separator1 = PredefinedMenuItem::separator(&app_handle)
                    .map_err(|e| format!("Failed to create separator: {}", e))?;
                let separator2 = PredefinedMenuItem::separator(&app_handle)
                    .map_err(|e| format!("Failed to create separator: {}", e))?;
                
                let file_menu = Submenu::with_items(
                    &app_handle,
                    "File",
                    true,
                    &[&new_window_item, &open_file_item, &save_file_item, &save_file_as_item, &separator1, &quit_item],
                ).map_err(|e| format!("Failed to create file menu: {}", e))?;
                
                let edit_menu = Submenu::with_items(
                    &app_handle,
                    "Edit",
                    true,
                    &[&undo_item, &redo_item, &separator2, &cut_item, &copy_item, &paste_item, &separator2, &select_all_item],
                ).map_err(|e| format!("Failed to create edit menu: {}", e))?;
                
                let help_menu = Submenu::with_items(
                    &app_handle,
                    "Help",
                    true,
                    &[&help_item, &about_item],
                ).map_err(|e| format!("Failed to create help menu: {}", e))?;
                
                let menu = Menu::with_items(
                    &app_handle,
                    &[&file_menu, &edit_menu, &help_menu],
                ).map_err(|e| format!("Failed to create menu: {}", e))?;
                
                app.handle().set_menu(menu)?;
            }
            
            #[cfg(not(target_os = "macos"))]
            {
                // Windows/Linux: Add "New Window" to Window menu, others to File menu
                let new_window_item = MenuItem::with_id(
                    &app_handle,
                    new_window_id.clone(),
                    "New Window",
                    true,
                    Some("ctrl+n"),
                ).map_err(|e| format!("Failed to create menu item: {}", e))?;
                
                let open_file_item = MenuItem::with_id(
                    &app_handle,
                    open_file_id.clone(),
                    "Open File",
                    true,
                    Some("ctrl+o"),
                ).map_err(|e| format!("Failed to create menu item: {}", e))?;
                
                let save_file_item = MenuItem::with_id(
                    &app_handle,
                    save_file_id.clone(),
                    "Save",
                    true,
                    Some("ctrl+s"),
                ).map_err(|e| format!("Failed to create menu item: {}", e))?;
                
                let save_file_as_item = MenuItem::with_id(
                    &app_handle,
                    save_file_as_id.clone(),
                    "Save As...",
                    true,
                    Some("ctrl+shift+s"),
                ).map_err(|e| format!("Failed to create menu item: {}", e))?;
                
                let about_item = MenuItem::with_id(
                    &app_handle,
                    about_id.clone(),
                    "About Marky",
                    true,
                    None::<&str>,
                ).map_err(|e| format!("Failed to create menu item: {}", e))?;
                
                let help_item = MenuItem::with_id(
                    &app_handle,
                    help_id.clone(),
                    "Help",
                    true,
                    None::<&str>,
                ).map_err(|e| format!("Failed to create menu item: {}", e))?;
                
                let quit_item = MenuItem::with_id(
                    &app_handle,
                    quit_id.clone(),
                    "Quit Marky",
                    true,
                    Some("ctrl+q"),
                ).map_err(|e| format!("Failed to create menu item: {}", e))?;
                
                // Edit menu items using PredefinedMenuItem for OS defaults
                let undo_item = PredefinedMenuItem::undo(&app_handle, None)
                    .map_err(|e| format!("Failed to create undo item: {}", e))?;
                let redo_item = PredefinedMenuItem::redo(&app_handle, None)
                    .map_err(|e| format!("Failed to create redo item: {}", e))?;
                let cut_item = PredefinedMenuItem::cut(&app_handle, None)
                    .map_err(|e| format!("Failed to create cut item: {}", e))?;
                let copy_item = PredefinedMenuItem::copy(&app_handle, None)
                    .map_err(|e| format!("Failed to create copy item: {}", e))?;
                let paste_item = PredefinedMenuItem::paste(&app_handle, None)
                    .map_err(|e| format!("Failed to create paste item: {}", e))?;
                let select_all_item = PredefinedMenuItem::select_all(&app_handle, None)
                    .map_err(|e| format!("Failed to create select all item: {}", e))?;
                
                let separator1 = PredefinedMenuItem::separator(&app_handle)
                    .map_err(|e| format!("Failed to create separator: {}", e))?;
                let separator2 = PredefinedMenuItem::separator(&app_handle)
                    .map_err(|e| format!("Failed to create separator: {}", e))?;
                
                let file_menu = Submenu::with_items(
                    &app_handle,
                    "File",
                    true,
                    &[&open_file_item, &save_file_item, &save_file_as_item, &separator1, &quit_item],
                ).map_err(|e| format!("Failed to create file menu: {}", e))?;
                
                let edit_menu = Submenu::with_items(
                    &app_handle,
                    "Edit",
                    true,
                    &[&undo_item, &redo_item, &separator2, &cut_item, &copy_item, &paste_item, &separator2, &select_all_item],
                ).map_err(|e| format!("Failed to create edit menu: {}", e))?;
                
                let window_menu = Submenu::with_items(
                    &app_handle,
                    "Window",
                    true,
                    &[&new_window_item],
                ).map_err(|e| format!("Failed to create window menu: {}", e))?;
                
                let help_menu = Submenu::with_items(
                    &app_handle,
                    "Help",
                    true,
                    &[&help_item, &about_item],
                ).map_err(|e| format!("Failed to create help menu: {}", e))?;
                
                let menu = Menu::with_items(
                    &app_handle,
                    &[&file_menu, &edit_menu, &window_menu, &help_menu],
                ).map_err(|e| format!("Failed to create menu: {}", e))?;
                
                app.handle().set_menu(menu)?;
            }
            
            // Handle menu events
            let app_handle_clone = app.handle().clone();
            app.handle().on_menu_event(move |_app, event| {
                let app_handle = app_handle_clone.clone();
                
                if event.id() == &new_window_id {
                    tauri::async_runtime::spawn(async move {
                        match create_new_window_internal(&app_handle).await {
                            Ok(_) => {}
                            Err(e) => {
                                eprintln!("Failed to create new window: {}", e);
                            }
                        }
                    });
                } else if event.id() == &open_file_id {
                    // Emit event to all windows
                    let _ = app_handle.emit("menu-open-file", ());
                } else if event.id() == &save_file_id {
                    // Emit event to all windows
                    let _ = app_handle.emit("menu-save-file", ());
                } else if event.id() == &save_file_as_id {
                    // Emit event to all windows
                    let _ = app_handle.emit("menu-save-file-as", ());
                } else if event.id() == &about_id {
                    // Emit event to all windows to show about dialog
                    let _ = app_handle.emit("menu-show-about", ());
                } else if event.id() == &help_id {
                    // Emit event to all windows to show help modal
                    let _ = app_handle.emit("menu-show-help", ());
                } else if event.id() == &quit_id {
                    // Emit event to all windows to quit app
                    let _ = app_handle.emit("menu-quit", ());
                }
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

            // Handle file open events from command-line arguments (Windows/Linux only)
            // On macOS, files come through RunEvent::Opened instead
            #[cfg(any(windows, target_os = "linux"))]
            {
                let app_handle = app.handle().clone();
                let window_registry = app.state::<WindowRegistry>();
                let mut files = Vec::new();
                
                // Parse command-line arguments for file paths
                for maybe_file in std::env::args().skip(1) {
                    // Skip flags like -f or --flag
                    if maybe_file.starts_with('-') {
                        continue;
                    }
                    
                    // Handle `file://` path URLs and skip other URLs
                    if let Ok(url) = url::Url::parse(&maybe_file) {
                        if let Ok(path) = url.to_file_path() {
                            files.push(path);
                        }
                    } else {
                        // Treat as direct file path
                        files.push(PathBuf::from(maybe_file));
                    }
                }
                
                // Process each file - use main window for first file, create new windows for others
                let mut is_first = true;
                for file_path in files {
                    if file_path.exists() && file_path.is_file() {
                        create_window_with_file(&app_handle, &window_registry, file_path, is_first);
                        is_first = false;
                    }
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            #[cfg(not(any(target_os = "macos", target_os = "ios")))]
            let _ = (app_handle, event);
            // Handle file open events when app is already running (macOS/iOS Apple Events)
            // Also handles when app is launched fresh with a file on macOS
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let RunEvent::Opened { urls } = event {
                // Convert URLs to file paths using Tauri's built-in method
                let files: Vec<PathBuf> = urls
                    .into_iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .collect();
                
                // Process each file - use main window for first file, create new windows for others
                // State should always be available here since setup has completed
                if let Some(window_registry) = app_handle.try_state::<WindowRegistry>() {
                    let mut is_first = true;
                    let mut should_hide_main = false;
                    
                    // Check if main window exists and is empty (no file loaded)
                    if is_first {
                        if let Some(main_window) = app_handle.get_webview_window("main") {
                            let is_empty = if let Ok(windows) = window_registry.windows.lock() {
                                windows.get("main")
                                    .map(|info| info.file_path.is_none())
                                    .unwrap_or(true)
                            } else {
                                true
                            };
                            
                            if is_empty {
                                // Hide main window temporarily to prevent showing empty window
                                should_hide_main = true;
                                let _ = main_window.hide();
                            }
                        }
                    }
                    
                    for file_path in files {
                        if file_path.exists() && file_path.is_file() {
                            create_window_with_file(app_handle, &window_registry, file_path, is_first);
                            
                            // Show main window after first file is loaded
                            if is_first && should_hide_main {
                                // Small delay to ensure file is loaded before showing
                                let app_handle_clone = app_handle.clone();
                                tauri::async_runtime::spawn(async move {
                                    std::thread::sleep(Duration::from_millis(200));
                                    if let Some(main_window) = app_handle_clone.get_webview_window("main") {
                                        let _ = main_window.show();
                                    }
                                });
                            }
                            
                            is_first = false;
                        }
                    }
                } else {
                    // Fallback: spawn async task if state isn't available (shouldn't happen)
                    let app_handle_clone = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        // Wait a bit for state to be ready
                        std::thread::sleep(Duration::from_millis(100));
                        if let Some(window_registry) = app_handle_clone.try_state::<WindowRegistry>() {
                            let mut is_first = true;
                            for file_path in files {
                                if file_path.exists() && file_path.is_file() {
                                    create_window_with_file(&app_handle_clone, &window_registry, file_path, is_first);
                                    is_first = false;
                                }
                            }
                        }
                    });
                }
            }
        });
}

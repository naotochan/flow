use tauri::{
    menu::{CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuItem, MenuItemBuilder},
    AppHandle, Emitter, Manager,
};

use crate::config;
use crate::AppState;

const TRAY_RECENT_COUNT: usize = 8;
const TRAY_LABEL_MAX: usize = 40;

const MODE_ORDER: &[(&str, &str)] = &[
    ("raw", "Raw"),
    ("format", "Format"),
    ("email", "Email"),
    ("translate", "Translate"),
    ("code", "Code"),
];

fn truncate_label(text: &str) -> String {
    let trimmed = text.trim().replace('\n', " ");
    let mut chars = trimmed.chars();
    let short: String = chars.by_ref().take(TRAY_LABEL_MAX).collect();
    if chars.next().is_some() {
        format!("{short}…")
    } else if short.is_empty() {
        "(empty)".to_string()
    } else {
        short
    }
}

/// Rebuild tray menu from current settings + history. Safe to call after each recognition.
pub fn rebuild_tray_menu(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let active_mode = app
        .try_state::<AppState>()
        .and_then(|state| {
            state
                .settings
                .try_lock()
                .ok()
                .map(|s| s.active_mode_id.clone())
        })
        .unwrap_or_else(|| "format".to_string());

    let settings_item = MenuItemBuilder::with_id("settings", "Settings...").build(app)?;
    let history_item = MenuItemBuilder::with_id("history", "History...").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let mode_items: Vec<CheckMenuItem<tauri::Wry>> = MODE_ORDER
        .iter()
        .map(|(id, label)| {
            CheckMenuItemBuilder::with_id(format!("mode:{id}"), *label)
                .checked(active_mode == *id)
                .build(app)
        })
        .collect::<Result<Vec<_>, _>>()?;

    let recent = crate::history::load_history().unwrap_or_default();
    let recent_items: Vec<MenuItem<tauri::Wry>> = recent
        .into_iter()
        .take(TRAY_RECENT_COUNT)
        .map(|entry| {
            let id = format!("history-copy:{}", entry.id);
            MenuItemBuilder::with_id(&id, truncate_label(&entry.text)).build(app)
        })
        .collect::<Result<Vec<_>, _>>()?;

    let mut builder = MenuBuilder::new(app)
        .item(&settings_item)
        .item(&history_item)
        .separator();

    for item in &mode_items {
        builder = builder.item(item);
    }

    if !recent_items.is_empty() {
        builder = builder.separator();
        for item in &recent_items {
            builder = builder.item(item);
        }
    }

    let menu = builder.separator().item(&quit_item).build()?;

    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(menu))?;
    }

    Ok(())
}

fn set_active_mode(app: &AppHandle, mode_id: &str) {
    let mode_id = mode_id.to_string();
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Some(state) = app.try_state::<AppState>() else {
            return;
        };
        let mut settings = state.settings.lock().await;
        if !settings.modes.iter().any(|m| m.id == mode_id)
            && !config::default_modes().iter().any(|m| m.id == mode_id)
        {
            log::warn!("Unknown mode id from tray: {}", mode_id);
            return;
        }
        settings.active_mode_id = mode_id.clone();
        config::normalize_modes(&mut settings);
        if let Err(e) = config::save_settings(&settings) {
            log::warn!("Failed to save mode from tray: {}", e);
            return;
        }
        drop(settings);
        log::info!("Active mode set from tray: {}", mode_id);
        if let Err(e) = rebuild_tray_menu(&app) {
            log::warn!("Failed to rebuild tray after mode change: {}", e);
        }
        let _ = app.emit("settings-changed", ());
    });
}

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    rebuild_tray_menu(app)?;

    if let Some(tray) = app.tray_by_id("main") {
        tray.on_menu_event(move |app, event| {
            let id = event.id().as_ref();
            match id {
                "settings" => {
                    if let Some(window) = app.get_webview_window("settings") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = app.emit("open-section", "general");
                    }
                }
                "history" => {
                    if let Some(window) = app.get_webview_window("settings") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = app.emit("open-section", "history");
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                other if other.starts_with("mode:") => {
                    let mode_id = &other["mode:".len()..];
                    set_active_mode(app, mode_id);
                }
                other if other.starts_with("history-copy:") => {
                    let entry_id = &other["history-copy:".len()..];
                    if let Ok(entries) = crate::history::load_history() {
                        if let Some(entry) = entries.iter().find(|e| e.id == entry_id) {
                            if let Err(e) = crate::clipboard::paste::copy_text(&entry.text) {
                                log::warn!("Tray history copy failed: {}", e);
                            }
                        }
                    }
                }
                _ => {}
            }
        });
    }

    Ok(())
}

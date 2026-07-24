use tauri::{
    menu::{
        CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuItem, MenuItemBuilder, SubmenuBuilder,
    },
    AppHandle, Emitter, Manager,
};

use crate::config;
use crate::AppState;

const TRAY_RECENT_COUNT: usize = 8;
const TRAY_LABEL_MAX: usize = 40;

const MODE_ORDER: &[&str] = &["raw", "format", "email", "translate", "code"];

struct TrayStrings {
    settings: &'static str,
    history: &'static str,
    history_show_all: &'static str,
    undo_paste: &'static str,
    quit: &'static str,
    empty: &'static str,
}

fn tray_strings(ui_language: &str) -> TrayStrings {
    if ui_language == "en" {
        TrayStrings {
            settings: "Settings...",
            history: "History",
            history_show_all: "Show All History...",
            undo_paste: "Undo Last Paste",
            quit: "Quit",
            empty: "(empty)",
        }
    } else {
        TrayStrings {
            settings: "設定...",
            history: "履歴",
            history_show_all: "履歴をすべて表示...",
            undo_paste: "直前のペーストを取り消す",
            quit: "終了",
            empty: "(空)",
        }
    }
}

fn mode_label(ui_language: &str, mode_id: &str) -> String {
    let label = match (ui_language == "en", mode_id) {
        (true, "raw") => "Raw",
        (true, "format") => "Format",
        (true, "email") => "Email",
        (true, "translate") => "Translate",
        (true, "code") => "Code",
        (false, "raw") => "そのまま",
        (false, "format") => "整形",
        (false, "email") => "メール",
        (false, "translate") => "翻訳",
        (false, "code") => "コード",
        _ => mode_id,
    };
    label.to_string()
}

fn truncate_label(text: &str, empty_label: &str) -> String {
    let trimmed = text.trim().replace('\n', " ");
    let mut chars = trimmed.chars();
    let short: String = chars.by_ref().take(TRAY_LABEL_MAX).collect();
    if chars.next().is_some() {
        format!("{short}…")
    } else if short.is_empty() {
        empty_label.to_string()
    } else {
        short
    }
}

/// Rebuild tray menu from current settings + history. Safe to call after each recognition.
pub fn rebuild_tray_menu(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let (active_mode, history_enabled, retention_days, paste_undoable, ui_language) = app
        .try_state::<AppState>()
        .and_then(|state| {
            state.settings.try_lock().ok().map(|s| {
                (
                    s.active_mode_id.clone(),
                    s.history_enabled,
                    s.history_retention_days,
                    state
                        .paste_undoable
                        .load(std::sync::atomic::Ordering::SeqCst),
                    s.ui_language.clone(),
                )
            })
        })
        .unwrap_or_else(|| {
            (
                "format".to_string(),
                true,
                0,
                false,
                "ja".to_string(),
            )
        });

    let t = tray_strings(&ui_language);

    let settings_item = MenuItemBuilder::with_id("settings", t.settings).build(app)?;
    let undo_item = MenuItemBuilder::with_id("undo-paste", t.undo_paste)
        .enabled(paste_undoable)
        .build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", t.quit).build(app)?;
    let history_show_all =
        MenuItemBuilder::with_id("history-show-all", t.history_show_all).build(app)?;

    let mode_items: Vec<CheckMenuItem<tauri::Wry>> = MODE_ORDER
        .iter()
        .map(|id| {
            CheckMenuItemBuilder::with_id(format!("mode:{id}"), mode_label(&ui_language, id))
                .checked(active_mode == *id)
                .build(app)
        })
        .collect::<Result<Vec<_>, _>>()?;

    let recent_items: Vec<MenuItem<tauri::Wry>> = if history_enabled {
        crate::history::load_history_pruned(retention_days)
            .unwrap_or_default()
            .into_iter()
            .take(TRAY_RECENT_COUNT)
            .map(|entry| {
                let id = format!("history-copy:{}", entry.id);
                MenuItemBuilder::with_id(&id, truncate_label(&entry.text, t.empty)).build(app)
            })
            .collect::<Result<Vec<_>, _>>()?
    } else {
        Vec::new()
    };

    // History submenu: hover reveals recent entries (macOS menu bar pattern).
    let mut history_builder = SubmenuBuilder::with_id(app, "history", t.history);
    if recent_items.is_empty() {
        let empty_item = MenuItemBuilder::with_id("history-empty", t.empty)
            .enabled(false)
            .build(app)?;
        history_builder = history_builder.item(&empty_item);
    } else {
        for item in &recent_items {
            history_builder = history_builder.item(item);
        }
    }
    let history_submenu = history_builder
        .separator()
        .item(&history_show_all)
        .build()?;

    let mut builder = MenuBuilder::new(app)
        .item(&settings_item)
        .item(&history_submenu)
        .item(&undo_item)
        .separator();

    for item in &mode_items {
        builder = builder.item(item);
    }

    let menu = builder.separator().item(&quit_item).build()?;

    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(menu))?;
    }

    Ok(())
}

/// Remember whether the last Flow paste can be undone via Cmd+Z, and refresh tray.
pub fn mark_paste_undoable(app: &AppHandle, undoable: bool) {
    if let Some(state) = app.try_state::<AppState>() {
        state
            .paste_undoable
            .store(undoable, std::sync::atomic::Ordering::SeqCst);
    }
    if let Err(e) = rebuild_tray_menu(app) {
        log::warn!("Failed to rebuild tray after paste undo flag: {}", e);
    }
}

fn undo_last_paste(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    if !state
        .paste_undoable
        .swap(false, std::sync::atomic::Ordering::SeqCst)
    {
        return;
    }

    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        // Prefer returning focus to the previous app if Settings was open.
        if let Some(window) = app.get_webview_window("settings") {
            let _ = window.hide();
            std::thread::sleep(std::time::Duration::from_millis(150));
        }
        if let Err(e) = crate::clipboard::paste::simulate_undo() {
            log::warn!("Undo last paste failed: {}", e);
            // Re-enable if simulation failed so the user can retry.
            if let Some(state) = app.try_state::<AppState>() {
                state
                    .paste_undoable
                    .store(true, std::sync::atomic::Ordering::SeqCst);
            }
        } else {
            log::info!("Undid last paste via Cmd+Z");
        }
        if let Err(e) = rebuild_tray_menu(&app) {
            log::warn!("Failed to rebuild tray after undo: {}", e);
        }
    });
}

pub fn set_active_mode(app: &AppHandle, mode_id: &str) {
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

fn open_history_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = app.emit("open-section", "history");
    }
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
                "undo-paste" => {
                    undo_last_paste(app);
                }
                "history-show-all" => {
                    open_history_settings(app);
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

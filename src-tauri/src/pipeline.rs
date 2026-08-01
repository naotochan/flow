use tauri::{AppHandle, Emitter, Manager};

use crate::api::{claude, whisper};
use crate::audio;
use crate::clipboard;
use crate::config::{AppSettings, LanguageMode};
use crate::AppState;

/// Restore clipboard text saved at the start of a replace-selection session.
pub fn restore_clipboard_backup(app_handle: &AppHandle) {
    let backup = {
        let state = app_handle.state::<AppState>();
        let taken = match state.clipboard_backup.lock() {
            Ok(mut g) => g.take(),
            Err(_) => None,
        };
        taken
    };
    if backup.is_none() {
        return;
    }
    let handle = app_handle.clone();
    let _ = handle.run_on_main_thread(move || {
        std::thread::sleep(std::time::Duration::from_millis(60));
        if let Err(e) = clipboard::paste::restore_clipboard(backup.as_deref()) {
            log::warn!("Clipboard restore failed: {}", e);
        } else {
            log::info!("Clipboard restored after replace-selection session");
        }
    });
}

/// Hide the overlay window and reset its size.
fn hide_overlay(app_handle: &AppHandle) {
    if let Some(overlay) = app_handle.get_webview_window("overlay") {
        let _ = overlay.hide();
        // Reset to default pill size
        let _ = overlay.set_size(tauri::LogicalSize::new(200.0, 44.0));
    }
}

/// Resize overlay to show transcription result text.
fn resize_overlay_for_result(app_handle: &AppHandle) {
    if let Some(overlay) = app_handle.get_webview_window("overlay") {
        let _ = overlay.set_size(tauri::LogicalSize::new(500.0, 44.0));
        // Re-center on screen
        if let Ok(Some(monitor)) = overlay.primary_monitor() {
            let screen = monitor.size();
            let scale = monitor.scale_factor();
            let win_w = 500.0;
            let win_h = 44.0;
            let x = (screen.width as f64 / scale - win_w) / 2.0;
            let y = screen.height as f64 / scale - win_h - 80.0;
            let _ = overlay.set_position(tauri::PhysicalPosition::new(
                (x * scale) as i32,
                (y * scale) as i32,
            ));
        }
    }
}

#[derive(Clone, serde::Serialize)]
pub struct RecordingStateEvent {
    pub state: String, // "idle", "recording", "processing"
}

#[derive(Clone, serde::Serialize)]
pub struct TranscriptionResultEvent {
    pub text: String,
    pub raw_text: String,
    pub language: String,
}

#[derive(Clone, serde::Serialize)]
pub struct ErrorEvent {
    pub message: String,
}

/// RMS threshold below which audio is considered silence.
///
/// Empirically, speech captured from the MacBook Pro built-in mic lands around
/// RMS 0.005–0.015, while a genuinely silent tap is ~0.0003. The previous
/// 0.008 threshold sat right inside the speech range and silently dropped a
/// large fraction of real dictation. 0.002 clears true silence while letting
/// quiet speech through; downstream hallucination filtering handles any noise
/// that slips past.
const SILENCE_RMS_THRESHOLD: f32 = 0.002;

/// Short, ambiguous phrases that are treated as hallucinations only when they
/// make up the ENTIRE utterance. These could conceivably be real if the user
/// actually said just this, so we require an exact (whole-string) match.
const HALLUCINATION_EXACT: &[&str] = &[
    "ありがとうございました",
    "ありがとうございます",
    "お疲れ様でした",
    "おやすみなさい",
    "Thank you.",
    "Goodbye.",
    "you",
    "...",
    // Whisper echoes the initial prompt back when fed silence or noise. These
    // must stay in sync with the prompts in api/whisper.rs.
    "音声入力による文章の書き取りです",
    "This is a voice dictation transcription.",
];

/// Marker phrases that are virtually never real dictation. Whisper emits these
/// (often with extra words prepended/appended) when fed silence or noise, e.g.
/// "字幕をご覧いただきまして、ご視聴ありがとうございました。". We filter the
/// result if it CONTAINS any of these anywhere, to catch such variants.
const HALLUCINATION_CONTAINS: &[&str] = &[
    "ご視聴ありがとうございました",
    "ご視聴ありがとうございます",
    "ご清聴ありがとうございました",
    "ご清聴ありがとうございます",
    "最後までご視聴",
    "チャンネル登録",
    "高評価とチャンネル",
    "字幕をご覧",
    "字幕作成",
    "thank you for watching",
    "thanks for watching",
    "please subscribe",
];

fn is_hallucination(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return true;
    }

    // Normalize: drop trailing punctuation/whitespace and lowercase
    // (lowercasing only affects ASCII; Japanese is unchanged).
    let normalized = trimmed
        .trim_end_matches(&['.', '!', '?', '。', '！', '？', ' ', '　'][..])
        .to_lowercase();

    // 1. Whole-utterance exact match for ambiguous short phrases.
    let exact_hit = HALLUCINATION_EXACT.iter().any(|phrase| {
        let p = phrase
            .trim_end_matches(&['.', '!', '?', '。', '！', '？'][..])
            .to_lowercase();
        normalized == p
    });
    if exact_hit {
        return true;
    }

    // 2. Substring match for unambiguous "viewing/subtitle" markers, which
    //    catches prefixed/suffixed hallucination variants.
    HALLUCINATION_CONTAINS
        .iter()
        .any(|marker| normalized.contains(&marker.to_lowercase()))
}

pub async fn handle_recording_complete(
    audio_samples: Vec<f32>,
    sample_rate: u32,
    channels: u16,
    settings: &AppSettings,
    app_handle: &AppHandle,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if audio_samples.is_empty() {
        restore_clipboard_backup(app_handle);
        return Ok(());
    }

    // 0. Silence detection — skip STT if audio is too quiet
    let rms = (audio_samples.iter().map(|s| s * s).sum::<f32>() / audio_samples.len() as f32).sqrt();
    if rms < SILENCE_RMS_THRESHOLD {
        log::info!("Audio too quiet (RMS={:.5}), skipping STT", rms);
        restore_clipboard_backup(app_handle);
        hide_overlay(app_handle);
        let _ = app_handle.emit(
            "recording-state",
            RecordingStateEvent {
                state: "idle".to_string(),
            },
        );
        return Ok(());
    }
    log::info!("Audio RMS: {:.5}", rms);

    // 1. Emit processing state
    let _ = app_handle.emit(
        "recording-state",
        RecordingStateEvent {
            state: "processing".to_string(),
        },
    );

    // 2. Encode to WAV
    let wav_bytes = audio::encode_wav(&audio_samples, sample_rate, channels)
        .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> { e.to_string().into() })?;
    log::info!("WAV encoded: {} bytes", wav_bytes.len());

    // 3. Determine language
    let language = match settings.language.mode {
        LanguageMode::Japanese => Some("ja"),
        LanguageMode::English => Some("en"),
        LanguageMode::Auto => None,
    };

    // 4. Transcribe with STT
    let raw_text = whisper::transcribe(wav_bytes, &settings.stt, language).await?;
    log::info!("STT result: {}", raw_text);

    // Check for hallucination or empty result
    if is_hallucination(&raw_text) {
        log::info!("Filtered hallucination: '{}'", raw_text.trim());
        restore_clipboard_backup(app_handle);
        hide_overlay(app_handle);
        let _ = app_handle.emit(
            "recording-state",
            RecordingStateEvent {
                state: "idle".to_string(),
            },
        );
        return Ok(());
    }

    if raw_text.trim().is_empty() {
        restore_clipboard_backup(app_handle);
        hide_overlay(app_handle);
        let _ = app_handle.emit(
            "recording-state",
            RecordingStateEvent {
                state: "idle".to_string(),
            },
        );
        return Ok(());
    }

    // 5. Post-process with LLM mode (raw skips LLM)
    let mode = crate::config::resolve_active_mode(&settings);
    // An empty prompt would hand the LLM the dictation with no instructions,
    // so a mode whose prompt has been cleared falls back to raw output.
    let mut final_text = if mode.use_llm && !mode.system_prompt.trim().is_empty() {
        let lang_str = language.unwrap_or(&settings.language.primary);
        let prompt = crate::config::render_mode_prompt(&mode.system_prompt, lang_str);
        log::info!("LLM mode: {}", mode.id);
        match claude::post_process(&raw_text, &settings.llm, &prompt).await {
            Ok(processed) => processed,
            Err(e) => {
                log::warn!("LLM post-processing failed: {}, using raw text", e);
                raw_text.clone()
            }
        }
    } else {
        raw_text.clone()
    };

    // 5b. Apply replacement dictionary / snippets (after LLM so paste/history match UI).
    let replaced = crate::config::apply_replacements(&final_text, &settings.replacements);
    if replaced != final_text {
        log::info!(
            "Replacements applied ({} → {} chars)",
            final_text.len(),
            replaced.len()
        );
        final_text = replaced;
    }

    log::info!("Final text: {}", final_text);

    // 6. Copy and paste FIRST, before touching the overlay window.
    //
    // Resizing/repositioning the overlay (step 7) can activate our app on
    // macOS and steal key focus from the target app, so a Cmd+V issued
    // afterwards would land in the overlay instead of where the user is
    // typing. Pasting first avoids that race entirely.
    // (Must run on the main thread for macOS enigo/HIToolbox.)
    //
    // replace_selection implies paste even if auto_paste is off (otherwise
    // the captured selection would be left on the clipboard unused).
    let should_paste = settings.auto_paste || settings.replace_selection;
    if should_paste {
        let text_for_paste = final_text.clone();
        let handle = app_handle.clone();
        let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();

        handle
            .run_on_main_thread(move || {
                let result = clipboard::paste::copy_and_paste(&text_for_paste)
                    .map_err(|e| e.to_string());
                let _ = tx.send(result);
            })
            .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> {
                e.to_string().into()
            })?;

        rx.await
            .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> {
                e.to_string().into()
            })?
            .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> { e.into() })?;

        crate::tray::menu::mark_paste_undoable(app_handle, true);
    }

    // Restore the user's prior clipboard (best-effort) after paste settles.
    restore_clipboard_backup(app_handle);

    // 7. Resize overlay and emit transcription result for display.
    resize_overlay_for_result(app_handle);
    let language_label = language.unwrap_or("auto").to_string();
    let _ = app_handle.emit(
        "transcription-result",
        TranscriptionResultEvent {
            text: final_text.clone(),
            raw_text: raw_text.clone(),
            language: language_label.clone(),
        },
    );

    // Persist to recognition history (best-effort), unless privacy mode disables it.
    if settings.history_enabled {
        match crate::history::push_entry(
            &final_text,
            &raw_text,
            &language_label,
            settings.history_retention_days,
        ) {
            Ok(entry) => {
                let _ = app_handle.emit("history-updated", entry);
                if let Err(e) = crate::tray::menu::rebuild_tray_menu(app_handle) {
                    log::warn!("Failed to refresh tray history menu: {}", e);
                }
            }
            Err(e) => log::warn!("Failed to save history: {}", e),
        }
    }

    // 8. Return to idle
    let _ = app_handle.emit(
        "recording-state",
        RecordingStateEvent {
            state: "idle".to_string(),
        },
    );

    // 9. Hide overlay after a brief delay so user can see the result
    let handle_for_hide = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        hide_overlay(&handle_for_hide);
    });

    Ok(())
}

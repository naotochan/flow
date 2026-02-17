use tauri::{AppHandle, Emitter, Manager};

use crate::api::{claude, whisper};
use crate::audio;
use crate::clipboard;
use crate::config::{AppSettings, LanguageMode};

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
/// Typical speech RMS is 0.01–0.3; background noise is usually < 0.005.
const SILENCE_RMS_THRESHOLD: f32 = 0.008;

/// Known Whisper hallucination phrases (common in Japanese/English).
/// If the STT result exactly matches one of these, treat it as empty.
const HALLUCINATION_PHRASES: &[&str] = &[
    "ご清聴ありがとうございました",
    "ご視聴ありがとうございました",
    "ありがとうございました",
    "ありがとうございます",
    "お疲れ様でした",
    "おやすみなさい",
    "字幕作成:iiiiiiiiiiiiiii",
    "字幕作成:KBS京都",
    "Thank you for watching.",
    "Thank you for watching!",
    "Thanks for watching.",
    "Thanks for watching!",
    "Thank you.",
    "Goodbye.",
    "you",
    "...",
];

fn is_hallucination(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return true;
    }
    HALLUCINATION_PHRASES.iter().any(|&phrase| {
        trimmed.eq_ignore_ascii_case(phrase)
            || trimmed.trim_end_matches(&['.', '!', '。', '！'][..]) == phrase.trim_end_matches(&['.', '!', '。', '！'][..])
    })
}

pub async fn handle_recording_complete(
    audio_samples: Vec<f32>,
    sample_rate: u32,
    channels: u16,
    settings: &AppSettings,
    app_handle: &AppHandle,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if audio_samples.is_empty() {
        return Ok(());
    }

    // 0. Silence detection — skip STT if audio is too quiet
    let rms = (audio_samples.iter().map(|s| s * s).sum::<f32>() / audio_samples.len() as f32).sqrt();
    if rms < SILENCE_RMS_THRESHOLD {
        log::info!("Audio too quiet (RMS={:.5}), skipping STT", rms);
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
        hide_overlay(app_handle);
        let _ = app_handle.emit(
            "recording-state",
            RecordingStateEvent {
                state: "idle".to_string(),
            },
        );
        return Ok(());
    }

    // 5. Post-process with LLM (optional)
    let final_text = if settings.llm.enabled {
        let lang_str = language.unwrap_or(&settings.language.primary);
        match claude::post_process(&raw_text, &settings.llm, lang_str).await {
            Ok(processed) => processed,
            Err(e) => {
                log::warn!("LLM post-processing failed: {}, using raw text", e);
                raw_text.clone()
            }
        }
    } else {
        raw_text.clone()
    };

    log::info!("Final text: {}", final_text);

    // 6. Resize overlay and emit transcription result
    resize_overlay_for_result(app_handle);
    let _ = app_handle.emit(
        "transcription-result",
        TranscriptionResultEvent {
            text: final_text.clone(),
            raw_text: raw_text.clone(),
            language: language.unwrap_or("auto").to_string(),
        },
    );

    // 7. Copy and paste (must run on main thread for macOS enigo/HIToolbox)
    if settings.auto_paste {
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

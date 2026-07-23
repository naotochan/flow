//! Feedback sounds for recording start / success / error.
//!
//! Drop short audio files into `src-tauri/sounds/` (bundled) or
//! `~/Library/Application Support/com.flow.app/sounds/` (override without rebuild):
//! - `start.wav` / `start.aiff` / `start.caf` / `start.mp3`
//! - `done.*`
//! - `error.*`
//!
//! Missing files are a no-op (wiring works; assets can land later).

use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};

const EXTENSIONS: &[&str] = &["wav", "aiff", "aif", "caf", "mp3"];

#[derive(Debug, Clone, Copy)]
pub enum SoundKind {
    Start,
    Done,
    Error,
}

impl SoundKind {
    fn stem(self) -> &'static str {
        match self {
            SoundKind::Start => "start",
            SoundKind::Done => "done",
            SoundKind::Error => "error",
        }
    }
}

/// Play a feedback sound if enabled and a matching file exists.
pub fn play(app: &AppHandle, kind: SoundKind, enabled: bool) {
    if !enabled {
        return;
    }

    let Some(path) = resolve_sound_path(app, kind) else {
        log::debug!("Sound {:?} not found (place file under sounds/)", kind);
        return;
    };

    // Fire-and-forget; afplay is macOS-native and supports wav/aiff/caf/mp3.
    match Command::new("afplay").arg(&path).spawn() {
        Ok(_) => log::debug!("Playing sound {:?} from {}", kind, path.display()),
        Err(e) => log::warn!("Failed to play sound {:?}: {}", kind, e),
    }
}

fn resolve_sound_path(app: &AppHandle, kind: SoundKind) -> Option<PathBuf> {
    let stem = kind.stem();

    // 1. User override in Application Support (no rebuild needed)
    let override_dir = crate::paths::app_support_dir().join("sounds");
    if let Some(p) = find_in_dir(&override_dir, stem) {
        return Some(p);
    }

    // 2. Bundled resources (src-tauri/sounds → Resources/sounds)
    if let Ok(resource_dir) = app.path().resource_dir() {
        if let Some(p) = find_in_dir(&resource_dir.join("sounds"), stem) {
            return Some(p);
        }
    }

    // 3. Dev: next to Cargo.toml / cwd
    let candidates = [
        PathBuf::from("src-tauri/sounds"),
        PathBuf::from("sounds"),
    ];
    for dir in candidates {
        if let Some(p) = find_in_dir(&dir, stem) {
            return Some(p);
        }
    }

    None
}

fn find_in_dir(dir: &Path, stem: &str) -> Option<PathBuf> {
    if !dir.is_dir() {
        return None;
    }
    for ext in EXTENSIONS {
        let path = dir.join(format!("{stem}.{ext}"));
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

//! Application support / data paths for Flow.
//!
//! Bundle ID is `com.flow.desktop`. Support files live under `com.flow.app`.
//! On first launch after rename, we migrate from the legacy Whisper Dictation dir.

use std::fs;
use std::path::PathBuf;

pub const APP_SUPPORT_DIR: &str = "com.flow.app";
pub const LEGACY_APP_SUPPORT_DIR: &str = "com.whisper-dictation.app";

pub const LOG_DIR_NAME: &str = "Flow";
pub const LOG_FILE_NAME: &str = "flow.log";

/// `~/Library/Application Support/com.flow.app` (with one-time migration).
pub fn app_support_dir() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    let new_dir = base.join(APP_SUPPORT_DIR);
    let old_dir = base.join(LEGACY_APP_SUPPORT_DIR);

    if !new_dir.exists() && old_dir.exists() {
        match fs::rename(&old_dir, &new_dir) {
            Ok(()) => {
                eprintln!(
                    "[flow] Migrated app data: {} → {}",
                    LEGACY_APP_SUPPORT_DIR, APP_SUPPORT_DIR
                );
            }
            Err(e) => {
                eprintln!(
                    "[flow] Could not rename legacy app data ({}). Falling back to copy: {}",
                    e, LEGACY_APP_SUPPORT_DIR
                );
                if let Err(copy_err) = copy_dir_recursive(&old_dir, &new_dir) {
                    eprintln!("[flow] Legacy data copy failed: {}", copy_err);
                }
            }
        }
    }

    let _ = fs::create_dir_all(&new_dir);
    new_dir
}

fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &to)?;
        } else {
            fs::copy(entry.path(), to)?;
        }
    }
    Ok(())
}

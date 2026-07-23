use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

const MAX_ENTRIES: usize = 50;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub text: String,
    pub raw_text: String,
    pub language: String,
    /// Unix timestamp (ms)
    pub created_at: i64,
}

fn history_path() -> PathBuf {
    crate::paths::app_support_dir().join("history.json")
}

pub fn load_history() -> Result<Vec<HistoryEntry>, Box<dyn std::error::Error>> {
    let path = history_path();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path)?;
    let entries: Vec<HistoryEntry> = serde_json::from_str(&content)?;
    Ok(entries)
}

fn save_history(entries: &[HistoryEntry]) -> Result<(), Box<dyn std::error::Error>> {
    let path = history_path();
    let content = serde_json::to_string_pretty(entries)?;
    fs::write(&path, content)?;
    Ok(())
}

/// Prepend a successful transcription. Newest first. Caps at MAX_ENTRIES.
pub fn push_entry(
    text: &str,
    raw_text: &str,
    language: &str,
) -> Result<HistoryEntry, Box<dyn std::error::Error>> {
    let entry = HistoryEntry {
        id: Uuid::new_v4().to_string(),
        text: text.to_string(),
        raw_text: raw_text.to_string(),
        language: language.to_string(),
        created_at: chrono_now_ms(),
    };
    let mut entries = load_history().unwrap_or_default();
    entries.insert(0, entry.clone());
    if entries.len() > MAX_ENTRIES {
        entries.truncate(MAX_ENTRIES);
    }
    save_history(&entries)?;
    Ok(entry)
}

pub fn clear_history() -> Result<(), Box<dyn std::error::Error>> {
    save_history(&[])?;
    Ok(())
}

pub fn delete_entry(id: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut entries = load_history()?;
    entries.retain(|e| e.id != id);
    save_history(&entries)?;
    Ok(())
}

fn chrono_now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

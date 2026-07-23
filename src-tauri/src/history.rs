use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

const MAX_ENTRIES: usize = 50;
const MS_PER_DAY: i64 = 24 * 60 * 60 * 1000;

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

/// Drop entries older than `retention_days`. `0` means no age-based pruning.
/// Returns whether the list changed (caller may persist).
pub fn prune_by_retention(entries: &mut Vec<HistoryEntry>, retention_days: u32) -> bool {
    if retention_days == 0 {
        return false;
    }
    let cutoff = chrono_now_ms() - (retention_days as i64) * MS_PER_DAY;
    let before = entries.len();
    entries.retain(|e| e.created_at >= cutoff);
    entries.len() != before
}

/// Load history and apply retention prune (persists if anything expired).
pub fn load_history_pruned(retention_days: u32) -> Result<Vec<HistoryEntry>, Box<dyn std::error::Error>> {
    let mut entries = load_history()?;
    if prune_by_retention(&mut entries, retention_days) {
        save_history(&entries)?;
    }
    Ok(entries)
}

/// Prepend a successful transcription. Newest first. Caps at MAX_ENTRIES.
pub fn push_entry(
    text: &str,
    raw_text: &str,
    language: &str,
    retention_days: u32,
) -> Result<HistoryEntry, Box<dyn std::error::Error>> {
    let entry = HistoryEntry {
        id: Uuid::new_v4().to_string(),
        text: text.to_string(),
        raw_text: raw_text.to_string(),
        language: language.to_string(),
        created_at: chrono_now_ms(),
    };
    let mut entries = load_history().unwrap_or_default();
    prune_by_retention(&mut entries, retention_days);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prune_keeps_recent_only() {
        let now = chrono_now_ms();
        let mut entries = vec![
            HistoryEntry {
                id: "old".into(),
                text: "a".into(),
                raw_text: "a".into(),
                language: "ja".into(),
                created_at: now - 10 * MS_PER_DAY,
            },
            HistoryEntry {
                id: "new".into(),
                text: "b".into(),
                raw_text: "b".into(),
                language: "ja".into(),
                created_at: now - 1 * MS_PER_DAY,
            },
        ];
        assert!(prune_by_retention(&mut entries, 7));
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, "new");
    }

    #[test]
    fn prune_zero_is_noop() {
        let mut entries = vec![HistoryEntry {
            id: "x".into(),
            text: "a".into(),
            raw_text: "a".into(),
            language: "ja".into(),
            created_at: 0,
        }];
        assert!(!prune_by_retention(&mut entries, 0));
        assert_eq!(entries.len(), 1);
    }
}

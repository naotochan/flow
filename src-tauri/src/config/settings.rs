use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub stt: SttConfig,
    pub llm: LlmConfig,
    pub activation_mode: ActivationMode,
    pub hotkey: HotkeyConfig,
    pub language: LanguageConfig,
    pub auto_paste: bool,
    /// When true, Cmd+C the current selection before recording and paste over it.
    /// Empty selection falls back to insert-at-cursor. Clipboard is restored after.
    #[serde(default)]
    pub replace_selection: bool,
    #[serde(default)]
    pub local_stt_server: LocalSttServerConfig,
    #[serde(default)]
    pub onboarding_completed: bool,
    #[serde(default)]
    pub onboarding_step: u32,
    #[serde(default = "default_ui_language")]
    pub ui_language: String,
    #[serde(default = "default_appearance")]
    pub appearance: String,
    /// Phrase replacements / snippets applied after STT (+ optional LLM).
    #[serde(default)]
    pub replacements: Vec<ReplacementRule>,
    /// Active post-process mode id (`raw` / `format` / `email` / `translate` / `code`).
    #[serde(default = "default_active_mode_id")]
    pub active_mode_id: String,
    /// Post-process mode presets (system prompts). Empty on load → filled with builtins.
    #[serde(default)]
    pub modes: Vec<PostProcessMode>,
    /// When false, do not persist recognition results (and clear existing on disable).
    #[serde(default = "default_true")]
    pub history_enabled: bool,
    /// Auto-delete entries older than this many days. `0` = keep until max count.
    #[serde(default)]
    pub history_retention_days: u32,
    /// Optional global shortcuts per mode id (e.g. `"email" → "ctrl+1"`).
    /// Chord / function keys only (no standalone modifiers — those need EventTap).
    #[serde(default)]
    pub mode_hotkeys: std::collections::HashMap<String, String>,
}

/// One LLM post-processing mode (prompt preset).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostProcessMode {
    pub id: String,
    /// User-visible label for custom modes. Left empty for builtins, whose
    /// labels are localized in the UI and tray instead.
    #[serde(default)]
    pub name: String,
    /// When false, skip LLM and keep STT (+ dictionary) only.
    pub use_llm: bool,
    /// System prompt template. Use `{language}` for the STT language hint.
    #[serde(default)]
    pub system_prompt: String,
    #[serde(default = "default_true")]
    pub builtin: bool,
}

fn default_active_mode_id() -> String {
    "format".to_string()
}

/// Built-in mode presets shipped with the app.
pub fn default_modes() -> Vec<PostProcessMode> {
    vec![
        PostProcessMode {
            id: "raw".into(),
            name: String::new(),
            use_llm: false,
            system_prompt: String::new(),
            builtin: true,
        },
        PostProcessMode {
            id: "format".into(),
            name: String::new(),
            use_llm: true,
            system_prompt: FORMAT_PROMPT.into(),
            builtin: true,
        },
        PostProcessMode {
            id: "email".into(),
            name: String::new(),
            use_llm: true,
            system_prompt: EMAIL_PROMPT.into(),
            builtin: true,
        },
        PostProcessMode {
            id: "translate".into(),
            name: String::new(),
            use_llm: true,
            system_prompt: TRANSLATE_PROMPT.into(),
            builtin: true,
        },
        PostProcessMode {
            id: "code".into(),
            name: String::new(),
            use_llm: true,
            system_prompt: CODE_PROMPT.into(),
            builtin: true,
        },
    ]
}

const FORMAT_PROMPT: &str = r#"You are a speech-to-text post-processor. The user dictated the following text.
Your job:
1. Insert proper punctuation (periods, commas, question marks)
2. Fix capitalization
3. Recognize spoken commands: "new line"/"改行" -> actual newline, "new paragraph"/"新しい段落" -> double newline
4. For Japanese: insert appropriate 。、！？ punctuation
5. For English: standard English punctuation
6. Return ONLY the corrected text, no explanation or wrapping.
Language: {language}"#;

const EMAIL_PROMPT: &str = r#"You are a speech-to-text post-processor that turns dictation into a polished email body.
Your job:
1. Fix punctuation, capitalization, and spoken commands ("new line"/"改行", "new paragraph"/"新しい段落")
2. Structure as a clear email (greeting if implied, body paragraphs, closing if present)
3. Keep the user's meaning; do not invent recipients, facts, or subject lines
4. Return ONLY the email text, no explanation or wrapping.
Language: {language}"#;

const TRANSLATE_PROMPT: &str = r#"You are a speech-to-text post-processor that translates dictated speech.
Your job:
1. Lightly clean punctuation and spoken commands ("new line"/"改行" -> newline)
2. If the text is primarily Japanese, translate to natural English; if primarily English, translate to natural Japanese; otherwise translate to English
3. Fix obvious STT errors while translating; do not add explanations
4. Return ONLY the translation.
Source language hint: {language}"#;

const CODE_PROMPT: &str = r#"You are a speech-to-text post-processor for code and technical identifiers.
Your job:
1. Preserve code tokens, identifiers, paths, URLs, and symbols as spoken
2. Use minimal prose punctuation; do not rewrite code as sentences
3. Recognize spoken commands: "new line"/"改行" -> newline, "new paragraph"/"新しい段落" -> double newline
4. Return ONLY the corrected text, no explanation or wrapping.
Language: {language}"#;

/// Resolve the active mode, falling back to `format` (or a synthetic raw).
pub fn resolve_active_mode(settings: &AppSettings) -> PostProcessMode {
    let modes = if settings.modes.is_empty() {
        default_modes()
    } else {
        settings.modes.clone()
    };
    modes
        .into_iter()
        .find(|m| m.id == settings.active_mode_id)
        .unwrap_or_else(|| {
            default_modes()
                .into_iter()
                .find(|m| m.id == "format")
                .expect("format mode exists")
        })
}

/// Ensure builtin modes exist, custom modes are well-formed, and `llm.enabled`
/// stays in sync with raw vs LLM modes.
pub fn normalize_modes(settings: &mut AppSettings) {
    if settings.modes.is_empty() {
        settings.modes = default_modes();
        // Migrate older installs that only had llm.enabled.
        if !settings.llm.enabled {
            settings.active_mode_id = "raw".into();
        } else if settings.active_mode_id.is_empty() {
            settings.active_mode_id = default_active_mode_id();
        }
    } else {
        let stored = std::mem::take(&mut settings.modes);

        // Builtins first in their canonical order, so adding a builtin later
        // doesn't strand it after the user's custom modes in the tray.
        let mut ordered: Vec<PostProcessMode> = default_modes()
            .into_iter()
            .map(|def| {
                match stored.iter().find(|m| m.id == def.id) {
                    // The prompt is the only field the UI lets you edit on a
                    // builtin; everything else stays ours, so a hand-edited
                    // settings file can't turn a builtin into a deletable mode.
                    Some(saved) => PostProcessMode {
                        system_prompt: saved.system_prompt.clone(),
                        ..def
                    },
                    None => def,
                }
            })
            .collect();

        for mode in stored {
            if ordered.iter().any(|m| m.id == mode.id) {
                continue; // builtin (already merged above) or duplicate id
            }
            if mode.id.trim().is_empty() {
                continue;
            }
            let name = if mode.name.trim().is_empty() {
                mode.id.clone()
            } else {
                mode.name.clone()
            };
            ordered.push(PostProcessMode {
                name,
                builtin: false,
                ..mode
            });
        }

        settings.modes = ordered;
    }

    // A deleted custom mode must not leave the app pointing at a mode that is
    // no longer there, nor keep its global shortcut registered.
    if settings.active_mode_id.is_empty()
        || !settings
            .modes
            .iter()
            .any(|m| m.id == settings.active_mode_id)
    {
        settings.active_mode_id = default_active_mode_id();
    }
    let known_ids: Vec<String> = settings.modes.iter().map(|m| m.id.clone()).collect();
    settings.mode_hotkeys.retain(|id, _| known_ids.contains(id));

    let use_llm = resolve_active_mode(settings).use_llm;
    settings.llm.enabled = use_llm;
}

/// Render `{language}` in a mode prompt template.
pub fn render_mode_prompt(template: &str, language: &str) -> String {
    template.replace("{language}", language)
}

/// One dictionary entry: replace all occurrences of `from` with `to`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplacementRule {
    pub id: String,
    pub from: String,
    pub to: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

/// Apply enabled replacement rules (longest `from` first to avoid partial clashes).
pub fn apply_replacements(text: &str, rules: &[ReplacementRule]) -> String {
    let mut active: Vec<&ReplacementRule> = rules
        .iter()
        .filter(|r| r.enabled && !r.from.is_empty())
        .collect();
    active.sort_by(|a, b| b.from.len().cmp(&a.from.len()));

    let mut out = text.to_string();
    for rule in active {
        if out.contains(&rule.from) {
            out = out.replace(&rule.from, &rule.to);
        }
    }
    out
}

fn default_ui_language() -> String {
    "ja".to_string()
}

fn default_appearance() -> String {
    "system".to_string()
}

/// STT (Speech-to-Text) provider configuration.
/// Supports OpenAI Whisper API and any OpenAI-compatible local server
/// (e.g. LM Studio, faster-whisper-server, Ollama with whisper).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SttConfig {
    pub provider: SttProvider,
    pub api_key: String,
    /// Base URL for the API. Examples:
    /// - OpenAI: "https://api.openai.com/v1"
    /// - LM Studio: "http://localhost:1234/v1"
    /// - Local whisper server: "http://localhost:8080/v1"
    pub base_url: String,
    /// Model name. Examples: "whisper-1", "whisper-large-v3"
    pub model: String,
    /// Selected preset key (e.g. "openai", "lm_studio", "local_whisper")
    #[serde(default)]
    pub preset: String,
    /// Per-preset API keys so switching presets doesn't lose keys
    #[serde(default)]
    pub preset_api_keys: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SttProvider {
    OpenaiCloud,
    LocalApi,
}

/// LLM provider for post-processing.
/// Supports Claude API, OpenAI API, and any OpenAI-compatible local server
/// (e.g. LM Studio, Ollama).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmConfig {
    pub enabled: bool,
    pub provider: LlmProvider,
    pub api_key: String,
    /// Base URL for the API. Examples:
    /// - Claude: "https://api.anthropic.com"
    /// - OpenAI: "https://api.openai.com/v1"
    /// - LM Studio: "http://localhost:1234/v1"
    /// - Ollama: "http://localhost:11434/v1"
    pub base_url: String,
    /// Model name. Examples:
    /// - "claude-haiku-4-5-20251001"
    /// - "gpt-4o-mini"
    /// - "llama3.2" (Ollama)
    /// - "lmstudio-community/Meta-Llama-3-8B" (LM Studio)
    pub model: String,
    /// Selected preset key (e.g. "claude", "openai", "ollama", "lm_studio")
    #[serde(default)]
    pub preset: String,
    /// Per-preset API keys so switching presets doesn't lose keys
    #[serde(default)]
    pub preset_api_keys: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LlmProvider {
    Claude,
    OpenaiCompatible,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ActivationMode {
    Hold,
    DoubleTap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyConfig {
    pub key: String,
    pub double_tap_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguageConfig {
    pub mode: LanguageMode,
    pub primary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LanguageMode {
    Auto,
    Japanese,
    English,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalSttServerConfig {
    pub model: String,
    pub port: u16,
    pub host: String,
    #[serde(default)]
    pub python_path: String,
}

impl Default for LocalSttServerConfig {
    fn default() -> Self {
        Self {
            model: "base".to_string(),
            port: 8080,
            host: "127.0.0.1".to_string(),
            python_path: String::new(),
        }
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            stt: SttConfig {
                provider: SttProvider::OpenaiCloud,
                api_key: String::new(),
                base_url: "https://api.openai.com/v1".to_string(),
                model: "whisper-1".to_string(),
                preset: "openai".to_string(),
                preset_api_keys: std::collections::HashMap::new(),
            },
            llm: LlmConfig {
                enabled: true,
                provider: LlmProvider::Claude,
                api_key: String::new(),
                base_url: "https://api.anthropic.com".to_string(),
                model: "claude-haiku-4-5-20251001".to_string(),
                preset: "claude".to_string(),
                preset_api_keys: std::collections::HashMap::new(),
            },
            activation_mode: ActivationMode::Hold,
            hotkey: HotkeyConfig {
                key: "f5".to_string(),
                double_tap_ms: 300,
            },
            language: LanguageConfig {
                mode: LanguageMode::Auto,
                primary: "ja".to_string(),
            },
            auto_paste: true,
            replace_selection: false,
            local_stt_server: LocalSttServerConfig::default(),
            onboarding_completed: false,
            onboarding_step: 0,
            ui_language: "ja".to_string(),
            appearance: "system".to_string(),
            replacements: Vec::new(),
            active_mode_id: default_active_mode_id(),
            modes: default_modes(),
            history_enabled: true,
            history_retention_days: 0,
            mode_hotkeys: std::collections::HashMap::new(),
        }
    }
}

fn settings_path() -> PathBuf {
    crate::paths::app_support_dir().join("settings.json")
}

pub fn load_settings() -> Result<AppSettings, Box<dyn std::error::Error>> {
    let path = settings_path();
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let content = fs::read_to_string(&path)?;
    let mut settings: AppSettings = serde_json::from_str(&content)?;
    normalize_modes(&mut settings);
    if migrate_legacy_python_path(&mut settings) {
        let _ = save_settings(&settings);
    }
    Ok(settings)
}

/// Rewrite absolute python_path left over from the Whisper Dictation → Flow rename.
/// Directory migration alone leaves the old path string in settings.json, so STT
/// falls back to system Python (no faster_whisper) while /health still looks fine.
fn migrate_legacy_python_path(settings: &mut AppSettings) -> bool {
    let old = &settings.local_stt_server.python_path;
    if old.is_empty() || !old.contains(crate::paths::LEGACY_APP_SUPPORT_DIR) {
        return false;
    }
    let fixed = old.replace(
        crate::paths::LEGACY_APP_SUPPORT_DIR,
        crate::paths::APP_SUPPORT_DIR,
    );
    let fixed_path = PathBuf::from(&fixed);
    let fallback = crate::paths::app_support_dir()
        .join("venv")
        .join("bin")
        .join("python");
    settings.local_stt_server.python_path = if fixed_path.exists() {
        fixed
    } else if fallback.exists() {
        fallback.to_string_lossy().to_string()
    } else {
        String::new()
    };
    true
}

pub fn save_settings(settings: &AppSettings) -> Result<(), Box<dyn std::error::Error>> {
    let path = settings_path();
    let mut normalized = settings.clone();
    normalize_modes(&mut normalized);
    let content = serde_json::to_string_pretty(&normalized)?;
    fs::write(&path, content)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(from: &str, to: &str) -> ReplacementRule {
        ReplacementRule {
            id: "1".into(),
            from: from.into(),
            to: to.into(),
            enabled: true,
        }
    }

    #[test]
    fn replaces_simple_phrase() {
        let rules = vec![rule("なると", "ナルト")];
        assert_eq!(apply_replacements("今日はなるとを見た", &rules), "今日はナルトを見た");
    }

    #[test]
    fn longest_match_wins() {
        let rules = vec![
            rule("なる", "成"),
            rule("なると", "ナルト"),
        ];
        assert_eq!(apply_replacements("なると", &rules), "ナルト");
    }

    #[test]
    fn skips_disabled_and_empty_from() {
        let mut disabled = rule("foo", "bar");
        disabled.enabled = false;
        let empty = rule("", "x");
        let rules = vec![disabled, empty, rule("a", "b")];
        assert_eq!(apply_replacements("a foo", &rules), "b foo");
    }

    #[test]
    fn normalize_migrates_disabled_llm_to_raw() {
        let mut s = AppSettings::default();
        s.modes.clear();
        s.llm.enabled = false;
        normalize_modes(&mut s);
        assert_eq!(s.active_mode_id, "raw");
        assert!(!resolve_active_mode(&s).use_llm);
    }

    #[test]
    fn render_prompt_substitutes_language() {
        assert_eq!(
            render_mode_prompt("Lang: {language}", "ja"),
            "Lang: ja"
        );
    }

    fn custom(id: &str, name: &str) -> PostProcessMode {
        PostProcessMode {
            id: id.into(),
            name: name.into(),
            use_llm: true,
            system_prompt: "do a thing".into(),
            builtin: false,
        }
    }

    #[test]
    fn normalize_keeps_custom_modes_after_builtins() {
        let mut s = AppSettings::default();
        s.modes = vec![custom("custom-1", "議事録")];
        s.active_mode_id = "custom-1".into();
        normalize_modes(&mut s);

        let ids: Vec<&str> = s.modes.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["raw", "format", "email", "translate", "code", "custom-1"]
        );
        assert_eq!(s.active_mode_id, "custom-1");
        assert_eq!(resolve_active_mode(&s).system_prompt, "do a thing");
    }

    #[test]
    fn normalize_restores_builtin_flag_but_keeps_edited_prompt() {
        let mut s = AppSettings::default();
        s.modes = vec![PostProcessMode {
            id: "format".into(),
            name: "renamed".into(),
            use_llm: false,
            system_prompt: "my own prompt".into(),
            builtin: false,
        }];
        normalize_modes(&mut s);

        let format = s.modes.iter().find(|m| m.id == "format").unwrap();
        assert!(format.builtin, "a builtin must not become deletable");
        assert!(format.use_llm, "builtin flags come from the definition");
        assert!(format.name.is_empty(), "builtins stay localized in the UI");
        assert_eq!(format.system_prompt, "my own prompt");
    }

    #[test]
    fn normalize_recovers_from_a_deleted_active_mode() {
        let mut s = AppSettings::default();
        s.modes = vec![custom("custom-1", "議事録")];
        s.active_mode_id = "custom-gone".into();
        s.mode_hotkeys.insert("custom-gone".into(), "ctrl+1".into());
        s.mode_hotkeys.insert("custom-1".into(), "ctrl+2".into());
        normalize_modes(&mut s);

        assert_eq!(s.active_mode_id, "format");
        assert!(!s.mode_hotkeys.contains_key("custom-gone"));
        assert_eq!(s.mode_hotkeys.get("custom-1").map(String::as_str), Some("ctrl+2"));
    }

    #[test]
    fn normalize_labels_and_dedupes_custom_modes() {
        let mut s = AppSettings::default();
        s.modes = vec![
            custom("custom-1", ""),
            custom("custom-1", "duplicate"),
            custom("  ", "no id"),
        ];
        normalize_modes(&mut s);

        let customs: Vec<&PostProcessMode> = s.modes.iter().filter(|m| !m.builtin).collect();
        assert_eq!(customs.len(), 1);
        assert_eq!(customs[0].name, "custom-1", "unnamed falls back to the id");
    }
}

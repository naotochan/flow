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
}

/// One LLM post-processing mode (prompt preset).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostProcessMode {
    pub id: String,
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
            use_llm: false,
            system_prompt: String::new(),
            builtin: true,
        },
        PostProcessMode {
            id: "format".into(),
            use_llm: true,
            system_prompt: FORMAT_PROMPT.into(),
            builtin: true,
        },
        PostProcessMode {
            id: "email".into(),
            use_llm: true,
            system_prompt: EMAIL_PROMPT.into(),
            builtin: true,
        },
        PostProcessMode {
            id: "translate".into(),
            use_llm: true,
            system_prompt: TRANSLATE_PROMPT.into(),
            builtin: true,
        },
        PostProcessMode {
            id: "code".into(),
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

/// Ensure builtin modes exist and sync `llm.enabled` with raw vs LLM modes.
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
        // Merge any missing builtin ids (forward-compat when we add modes).
        let defaults = default_modes();
        for def in defaults {
            if !settings.modes.iter().any(|m| m.id == def.id) {
                settings.modes.push(def);
            }
        }
    }
    if settings.active_mode_id.is_empty() {
        settings.active_mode_id = default_active_mode_id();
    }
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
    Ok(settings)
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
}

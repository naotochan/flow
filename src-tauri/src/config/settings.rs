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
            local_stt_server: LocalSttServerConfig::default(),
            onboarding_completed: false,
            onboarding_step: 0,
            ui_language: "ja".to_string(),
            appearance: "system".to_string(),
        }
    }
}

fn settings_path() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("com.whisper-dictation.app");
    fs::create_dir_all(&dir).ok();
    dir.join("settings.json")
}

pub fn load_settings() -> Result<AppSettings, Box<dyn std::error::Error>> {
    let path = settings_path();
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let content = fs::read_to_string(&path)?;
    let settings: AppSettings = serde_json::from_str(&content)?;
    Ok(settings)
}

pub fn save_settings(settings: &AppSettings) -> Result<(), Box<dyn std::error::Error>> {
    let path = settings_path();
    let content = serde_json::to_string_pretty(settings)?;
    fs::write(&path, content)?;
    Ok(())
}

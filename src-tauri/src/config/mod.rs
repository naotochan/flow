mod settings;

pub use settings::{
    AppSettings, ActivationMode, LanguageMode,
    SttConfig, LlmConfig, LlmProvider, apply_replacements,
};
pub use settings::{load_settings, save_settings};

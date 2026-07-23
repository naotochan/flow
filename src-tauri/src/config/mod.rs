mod settings;

pub use settings::{
    AppSettings, ActivationMode, LanguageMode,
    SttConfig, LlmConfig, LlmProvider, apply_replacements,
    default_modes, normalize_modes, resolve_active_mode, render_mode_prompt,
};
pub use settings::{load_settings, save_settings};

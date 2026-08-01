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
    /// Discard recordings shorter than this before they ever reach STT. Guards
    /// against an accidental hotkey brush, which is prime hallucination fuel.
    /// `0` disables the check.
    #[serde(default = "default_min_recording_ms")]
    pub min_recording_ms: u32,
    /// Strip hesitation sounds ("えーと", "um") from the transcript, and ask
    /// the LLM to do the same in modes that run one. Off by default: it edits
    /// the user's words, so it has to be opted into.
    #[serde(default)]
    pub remove_fillers: bool,
}

/// Long enough to drop a stray key brush, short enough to keep "了解です".
fn default_min_recording_ms() -> u32 {
    500
}

/// Matches the settings slider. A hand-edited file with a huge value here
/// would otherwise discard every recording, with no clue why.
pub const MAX_MIN_RECORDING_MS: u32 = 5_000;

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

impl PostProcessMode {
    /// Whether this mode actually calls the LLM.
    ///
    /// An empty prompt would hand the LLM the dictation with no instructions
    /// at all, so a mode whose prompt has been cleared falls back to raw
    /// output. Both the recording pipeline and the mic test go through here so
    /// the test can't take a different path than the real thing.
    pub fn runs_llm(&self) -> bool {
        self.use_llm && !self.system_prompt.trim().is_empty()
    }
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
            // An empty name is left empty on purpose: writing the id in here
            // would overwrite the text box the moment the user clears it to
            // retype. The UI and tray each supply their own placeholder.
            ordered.push(PostProcessMode {
                name: mode.name.trim().to_string(),
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
    let known: std::collections::HashSet<&str> =
        settings.modes.iter().map(|m| m.id.as_str()).collect();
    settings
        .mode_hotkeys
        .retain(|id, _| known.contains(id.as_str()));

    settings.min_recording_ms = settings.min_recording_ms.min(MAX_MIN_RECORDING_MS);

    let use_llm = resolve_active_mode(settings).use_llm;
    settings.llm.enabled = use_llm;
}

/// Render `{language}` in a mode prompt template, appending the filler-removal
/// instruction when the user asked for it.
///
/// Appended rather than baked into each preset so it also reaches custom modes
/// the user wrote themselves.
pub fn render_mode_prompt(template: &str, language: &str, remove_fillers: bool) -> String {
    let rendered = template.replace("{language}", language);
    if remove_fillers {
        // Own paragraph: every preset ends on a "Return ONLY ..." line, and an
        // instruction glued to that reads as part of it.
        format!("{rendered}\n\n{FILLER_INSTRUCTION}")
    } else {
        rendered
    }
}

const FILLER_INSTRUCTION: &str = "Additionally: delete filler words, hesitation sounds and false starts (\"えー\", \"あのー\", \"えーと\", \"um\", \"uh\", \"hmm\"). Keep the wording of the actual content unchanged, and never touch what is inside a code token, identifier, path or URL.";

/// Hesitation sounds dropped at a clause boundary. Matched with repeated
/// characters collapsed, so "えー" covers the drawn out "えーーー" too, and the
/// longest match wins so "ええーと" cannot be read as "えー" + "と".
///
/// Deliberately excluded: "まあ", "なんか", "その" and bare "あの", which carry
/// meaning at least as often as they stall ("あの人", "なんか食べたい"). LLM
/// modes still catch those from context — this list only has to be safe.
const FILLER_JA: &[&str] = &[
    "えーっと",
    "えーと",
    "ええと",
    "えっと",
    "えー",
    "あのー",
    "あのう",
    "あー",
    "あぁ",
    "うーんと",
    "うーん",
    "んーと",
    "んー",
    "そのー",
    "そのう",
];

/// Matched case-insensitively against a whole word whose repeated letters have
/// been collapsed, so one entry covers "Um", "umm" and "Ummm" alike — and
/// "under" keeps its "u", because the word there is "under".
///
/// "er"/"erm" are left out: they would take "Err" with them, which is real
/// dictation in code mode.
const FILLER_EN: &[&str] = &["um", "uh", "uhm", "hm"];

/// Trailing characters swallowed along with a filler, so "えーと、明日" does
/// not become "、明日".
///
/// Sentence punctuation is in here too: a stop *behind* a filler ends the
/// filler and nothing else ("Hmm. Let me check"). One in front of it is a
/// different matter — that belongs to the words before it, and only the tail
/// gets eaten, so "終わりです。えーと、次は" keeps its 。
const FILLER_TRAIL: &[char] = &[
    'ー', '〜', '～', '、', '，', ',', '…', '。', '．', '.', '！', '!', '？', '?', ':', ';', '：',
    '；',
];

/// Whether a filler starting right after `prev` is at a clause boundary.
///
/// Fillers are stalls at the head of a phrase, and requiring that position is
/// what keeps "へえー" and "いえーい" intact — their "えー" sits mid-word.
///
/// Opening brackets are not boundaries: "(um)" is a written aside, and removing
/// the word from inside it would leave the brackets behind, empty.
fn is_clause_boundary(prev: Option<char>) -> bool {
    match prev {
        None => true,
        Some(c) => {
            c.is_whitespace()
                || matches!(
                    c,
                    '、' | '。'
                        | '，'
                        | '．'
                        | '！'
                        | '？'
                        | '!'
                        | '?'
                        | ','
                        | '.'
                        | ':'
                        | ';'
                        | '…'
                        | '」'
                        | '』'
                        | '）'
                        | ')'
                )
        }
    }
}

/// Remove hesitation sounds from a transcript.
///
/// Runs before the LLM (and instead of it, in `raw` mode) so the text is clean
/// even when no model is in the loop. Conservative by design: it only fires at
/// a clause boundary, so anything it misses is left for the LLM instruction.
pub fn strip_fillers(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;

    while i < chars.len() {
        if is_clause_boundary(out.chars().last()) {
            if let Some(len) = match_filler(&chars, i) {
                i += len;
                // Swallow the filler's own tail ("えーと、", "um,"). Newlines
                // are structure here, not spacing — modes act on them — so one
                // only goes when the filler sat on a line of its own and the
                // line break would otherwise be left as a blank line.
                // One line break at most: past that they are the user's own
                // paragraph breaks, and modes act on those.
                let mut spare_line_break = out.is_empty() || out.ends_with(['\n', '\r']);
                while i < chars.len() {
                    let c = chars[i];
                    let is_line_break = c == '\n' || c == '\r';
                    let is_tail = FILLER_TRAIL.contains(&c)
                        || (c.is_whitespace() && (!is_line_break || spare_line_break));
                    if !is_tail {
                        break;
                    }
                    if c == '\n' {
                        spare_line_break = false;
                    }
                    i += 1;
                }
                // Nothing follows on this line, so the comma in front of the
                // filler now separates nothing ("はい、えーと。"). It only goes
                // where a filler was actually removed — a "、" the user dictated
                // at the end of a line is theirs to keep.
                if matches!(chars.get(i), None | Some('\n') | Some('\r')) {
                    while out.ends_with(|c: char| {
                        matches!(c, '、' | '，' | ',')
                            || (c.is_whitespace() && c != '\n' && c != '\r')
                    }) {
                        out.pop();
                    }
                }
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }

    // A leading "." or "、" is the user's own (".env file") and nothing here
    // put it there, so only whitespace goes.
    out.trim().to_string()
}

/// Length in `char`s of the filler at `start`, or `None` if there is none.
fn match_filler(chars: &[char], start: usize) -> Option<usize> {
    // Japanese: longest match, so a drawn out "ええーと" is one filler rather
    // than "えー" with a stray "と" left behind.
    let mut longest = 0;
    let mut cut_short = 0;
    for filler in FILLER_JA {
        let Some(len) = match_collapsed(chars, start, filler) else {
            continue;
        };
        if filler_ends_here(filler, chars.get(start + len)) {
            longest = longest.max(len);
        } else {
            cut_short = cut_short.max(len);
        }
    }
    // A longer entry matched but does not end where it matched, so this is
    // "えーと" + "ですね" and not "えー" + "とですね". Falling back to the
    // shorter entry would put a "と" the speaker never said at the head of the
    // text; leaving the stall in is the lesser evil, and in every mode but
    // `raw` the filler instruction still gets it.
    if cut_short > longest {
        return None;
    }
    if longest > 0 {
        return Some(longest);
    }

    // English: take the whole word, then collapse repeated letters so a drawn
    // out "Ummm" reads as "um". Comparing whole words is also what keeps
    // "umbrella" and "her" intact.
    let word_len = chars[start..]
        .iter()
        .take_while(|c| c.is_ascii_alphabetic())
        .count();
    if word_len == 0 {
        return None;
    }
    // Glued to a digit or a hyphen it is part of something else ("UH-60"), and
    // in all caps it is far more likely an acronym than a drawn out "um".
    if matches!(chars.get(start + word_len), Some(c) if c.is_ascii_digit() || *c == '-' || *c == '_' || *c == '\'')
    {
        return None;
    }
    if word_len > 1
        && chars[start..start + word_len]
            .iter()
            .all(|c| c.is_ascii_uppercase())
    {
        return None;
    }
    let word: String = chars[start..start + word_len]
        .iter()
        .flat_map(|c| c.to_lowercase())
        .collect();
    if FILLER_EN.contains(&collapse_repeats(&word).as_str()) {
        return Some(word_len);
    }
    None
}

/// Match `filler` at `start` treating any run of one character as a single
/// character ("えーーーと" == "えーと"), returning how many `char`s of the
/// input that consumed.
///
/// The entry's own runs are counted too, or one of them would swallow what the
/// next expected character needs and "ええと" would fail to match itself.
fn match_collapsed(chars: &[char], start: usize, filler: &str) -> Option<usize> {
    let expected: Vec<char> = filler.chars().collect();
    let mut i = start;
    let mut j = 0;

    while j < expected.len() {
        let c = expected[j];
        let need = expected[j..].iter().take_while(|e| **e == c).count();
        let have = chars[i..].iter().take_while(|e| **e == c).count();
        if have < need {
            return None;
        }
        i += have;
        j += need;
    }
    Some(i - start)
}

/// Characters no Japanese word begins with, so seeing one at the head of what
/// is left means a word — or a filler — was cut in half.
const NEVER_STARTS_A_WORD: &[char] = &[
    'ー', '〜', '～', 'ん', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'っ', 'ゃ', 'ゅ', 'ょ',
];

/// Whether a Japanese filler that matched really ends where it matched.
///
/// The entries overlap with real words in both directions, and matching one is
/// not on its own proof that the speaker stalled there.
fn filler_ends_here(filler: &str, next: Option<&char>) -> bool {
    let Some(next) = next else {
        return true;
    };
    // "あー" in "あーっと" leaves a "っ" nothing can start with: the match
    // landed inside a drawn out filler, not at the end of one.
    if NEVER_STARTS_A_WORD.contains(next) {
        return false;
    }
    // An entry ending in one of those characters cannot itself be the head of
    // a longer word, so it is done here — which is what keeps "あのーそうです
    // ね" catchable without a comma to lean on.
    if matches!(filler.chars().last(), Some(c) if NEVER_STARTS_A_WORD.contains(&c)) {
        return true;
    }
    // The rest double as the start of real words — "そのう" of "そのうち",
    // "えーと" of "えーとりあえず" — so more hiragana means the word simply
    // continues and removing the entry would eat its head.
    !('ぁ'..='ん').contains(next)
}

/// "ummm" → "um". Only ever used to look a word up in [`FILLER_EN`]; the text
/// itself is never rewritten this way.
fn collapse_repeats(word: &str) -> String {
    let mut out = String::with_capacity(word.len());
    for c in word.chars() {
        if !out.ends_with(c) {
            out.push(c);
        }
    }
    out
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
            min_recording_ms: default_min_recording_ms(),
            remove_fillers: false,
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
            render_mode_prompt("Lang: {language}", "ja", false),
            "Lang: ja"
        );
    }

    #[test]
    fn render_prompt_appends_filler_instruction_only_when_enabled() {
        assert!(!render_mode_prompt("Base", "ja", false).contains("filler"));
        let with = render_mode_prompt("Base", "ja", true);
        assert!(with.starts_with("Base"));
        assert!(with.contains("filler"));
    }

    #[test]
    fn strips_japanese_fillers_at_clause_boundaries() {
        assert_eq!(strip_fillers("えーと、明日の会議です"), "明日の会議です");
        assert_eq!(
            strip_fillers("これは、あのー、テストです"),
            "これは、テストです"
        );
        assert_eq!(strip_fillers("うーん そうですね"), "そうですね");
        // Consecutive stalls collapse in one pass.
        assert_eq!(strip_fillers("えー、あのー、はい"), "はい");
    }

    #[test]
    fn keeps_words_that_merely_contain_a_filler() {
        // The "えー" here is mid-word, not a stall.
        assert_eq!(strip_fillers("へえー、すごい"), "へえー、すごい");
        assert_eq!(strip_fillers("いえーい"), "いえーい");
        // Excluded from the list precisely because they carry meaning.
        assert_eq!(strip_fillers("あの人に伝えて"), "あの人に伝えて");
        assert_eq!(strip_fillers("まあ、いいか"), "まあ、いいか");
        assert_eq!(strip_fillers("なんか食べたい"), "なんか食べたい");
    }

    #[test]
    fn strips_english_fillers_as_whole_words_only() {
        assert_eq!(strip_fillers("Um, I think so"), "I think so");
        assert_eq!(strip_fillers("I uh need a break"), "I need a break");
        assert_eq!(strip_fillers("Hmm. Let me check"), "Let me check");
        // Substrings of real words stay put.
        assert_eq!(
            strip_fillers("Her umbrella is under it"),
            "Her umbrella is under it"
        );
        // Drawn out fillers collapse to the same entry.
        assert_eq!(strip_fillers("Ummm... okay"), "okay");
        assert_eq!(strip_fillers("Uhh, right"), "right");
        // Code mode dictates this one for real.
        assert_eq!(strip_fillers("Err(e) means failure"), "Err(e) means failure");
    }

    #[test]
    fn drawn_out_fillers_leave_nothing_behind() {
        // A shorter entry matching the head would leave "と、明日".
        assert_eq!(strip_fillers("ええーと、明日"), "明日");
        assert_eq!(strip_fillers("えーーーと、明日"), "明日");
        assert_eq!(strip_fillers("ええーっと、はい"), "はい");
        assert_eq!(strip_fillers("んーと、そうですね"), "そうですね");
        // An entry whose own head repeats has to match itself first of all.
        assert_eq!(strip_fillers("ええと、はい"), "はい");
        assert_eq!(strip_fillers("えええと、はい"), "はい");
    }

    #[test]
    fn every_japanese_entry_matches_itself() {
        for filler in FILLER_JA {
            assert_eq!(strip_fillers(&format!("{filler}、はい")), "はい", "{filler}");
            assert_eq!(strip_fillers(filler), "", "{filler}");
        }
    }

    #[test]
    fn a_filler_that_heads_a_real_word_is_left_alone() {
        // "そのう" is the start of "そのうち", not a stall on its own.
        assert_eq!(strip_fillers("そのうち行きます"), "そのうち行きます");
        assert_eq!(strip_fillers("そのうえで判断します"), "そのうえで判断します");
        assert_eq!(strip_fillers("あのうさぎ可愛い"), "あのうさぎ可愛い");
        assert_eq!(strip_fillers("あのうちに帰る"), "あのうちに帰る");
        // A word starts here, so the filler really did end.
        assert_eq!(strip_fillers("えーと明日の会議です"), "明日の会議です");
        // No comma to lean on, and none needed.
        assert_eq!(strip_fillers("あのーそうですね"), "そうですね");
    }

    #[test]
    fn an_ambiguous_stall_is_left_whole_rather_than_halved() {
        // "えーと" + "ですね" and "えー" + "とりあえず" look alike from here,
        // and dropping the shorter entry would head the text with a "と" that
        // was never said. Leaving the stall in is what the LLM instruction is
        // for; cutting one in half is not recoverable.
        assert_eq!(strip_fillers("えーとですね、始めます"), "えーとですね、始めます");
        assert_eq!(strip_fillers("えーっとちょっと待って"), "えーっとちょっと待って");
        assert_eq!(strip_fillers("えーとりあえず進めます"), "えーとりあえず進めます");
        assert_eq!(strip_fillers("うーんとても良い"), "うーんとても良い");
        assert_eq!(strip_fillers("えーとえーと、はい"), "えーとえーと、はい");
        // Same for a match that landed inside a drawn out filler: taking "あー"
        // out of "あーっと" would leave a "っ" no word can start with.
        assert_eq!(strip_fillers("あーっと、はい"), "あーっと、はい");
        assert_eq!(strip_fillers("あーん、痛い"), "あーん、痛い");
    }

    #[test]
    fn stripping_is_idempotent() {
        for text in [
            "えーと、明日の会議です",
            "メモ\nえーと\n\n本文",
            "はい、えーと。",
            "そのうち行きます",
            "Um, I think so",
        ] {
            let once = strip_fillers(text);
            assert_eq!(strip_fillers(&once), once, "{text}");
        }
    }

    #[test]
    fn leading_punctuation_is_the_users_own() {
        // Nothing was removed here, so nothing may be trimmed either.
        assert_eq!(strip_fillers(".env file"), ".env file");
        assert_eq!(strip_fillers("…そして次は"), "…そして次は");
        assert_eq!(strip_fillers("、そうですね"), "、そうですね");
    }

    #[test]
    fn trailing_filler_leaves_no_dangling_comma() {
        assert_eq!(strip_fillers("はい、えーと。"), "はい");
        assert_eq!(strip_fillers("そうですね、えーと"), "そうですね");
        assert_eq!(strip_fillers("I think so, um."), "I think so");
        // The end of a line is the end of a clause just as much.
        assert_eq!(strip_fillers("明日は、えーと\n晴れです"), "明日は\n晴れです");
        assert_eq!(strip_fillers("a, um\nb"), "a\nb");
        // Nothing was removed here, so the comma is the user's own.
        assert_eq!(strip_fillers("これは、"), "これは、");
        assert_eq!(strip_fillers("りんご、みかん、\nそれと"), "りんご、みかん、\nそれと");
    }

    #[test]
    fn acronyms_and_hyphenated_words_are_not_fillers() {
        assert_eq!(
            strip_fillers("This is a UH-60 helicopter"),
            "This is a UH-60 helicopter"
        );
        assert_eq!(strip_fillers("The UM system is fine"), "The UM system is fine");
        // Removing the word would leave the brackets standing empty.
        assert_eq!(strip_fillers("(um) yes"), "(um) yes");
    }

    #[test]
    fn newlines_are_structure_not_spacing() {
        // The line the filler sat on goes with it, rather than becoming blank.
        assert_eq!(strip_fillers("メモ\nえーと\n本文"), "メモ\n本文");
        assert_eq!(strip_fillers("えーと\n明日は晴れです"), "明日は晴れです");
        // A filler mid-line must not pull the following line up, and must not
        // leave the space it sat behind at the end of the line either.
        assert_eq!(strip_fillers("明日は晴れ えーと\n次の話"), "明日は晴れ\n次の話");
        assert_eq!(
            strip_fillers("明日は晴れ\u{3000}えーと\n次の話"),
            "明日は晴れ\n次の話"
        );
        assert_eq!(strip_fillers("一行目\nえーと、二行目"), "一行目\n二行目");
        assert_eq!(strip_fillers("明日は、えーと\r\n晴れです"), "明日は\r\n晴れです");
        // The blank line is the user's paragraph break, not the filler's.
        assert_eq!(strip_fillers("メモ\nえーと\n\n本文"), "メモ\n\n本文");
    }

    #[test]
    fn a_colon_behind_a_filler_goes_with_it() {
        // Every other separator is swallowed; these must not be left standing.
        assert_eq!(strip_fillers("Um: yes"), "yes");
        assert_eq!(strip_fillers("a; um; b"), "a; b");
    }

    #[test]
    fn sentence_punctuation_survives_a_neighbouring_filler() {
        // The 。belongs to "終わりです", not to the filler after it.
        assert_eq!(
            strip_fillers("終わりです。えーと、次は"),
            "終わりです。次は"
        );
    }

    #[test]
    fn all_filler_utterance_becomes_empty() {
        assert_eq!(strip_fillers("えーと、あのー"), "");
        assert_eq!(strip_fillers("um, uh"), "");
    }

    #[test]
    fn text_without_fillers_is_untouched() {
        let text = "本日はお集まりいただきありがとうございます。";
        assert_eq!(strip_fillers(text), text);
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
        assert!(
            customs[0].name.is_empty(),
            "an empty name stays empty so the user can retype it"
        );
    }

    #[test]
    fn a_cleared_prompt_stops_calling_the_llm() {
        let mut mode = custom("custom-1", "議事録");
        assert!(mode.runs_llm());
        mode.system_prompt = "   \n".into();
        assert!(!mode.runs_llm());
    }
}

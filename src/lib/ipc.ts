import { invoke } from "@tauri-apps/api/core";

export interface SttConfig {
  provider: "openai_cloud" | "local_api";
  api_key: string;
  base_url: string;
  model: string;
  preset: string;
  preset_api_keys: Record<string, string>;
}

export interface LlmConfig {
  enabled: boolean;
  provider: "claude" | "openai_compatible";
  api_key: string;
  base_url: string;
  model: string;
  preset: string;
  preset_api_keys: Record<string, string>;
}

export interface HotkeyConfig {
  key: string;
  double_tap_ms: number;
}

export interface LanguageConfig {
  mode: "auto" | "japanese" | "english";
  primary: string;
}

export interface LocalSttServerConfig {
  model: string;
  port: number;
  host: string;
  python_path: string;
}

export type AppAppearance = "system" | "light" | "dark";

export interface ReplacementRule {
  id: string;
  from: string;
  to: string;
  enabled: boolean;
}

export type PostProcessModeId =
  | "raw"
  | "format"
  | "email"
  | "translate"
  | "code";

export interface PostProcessMode {
  id: string;
  /** User-typed label for custom modes; empty for builtins (localized in UI). */
  name: string;
  use_llm: boolean;
  system_prompt: string;
  builtin: boolean;
}

/** Builtin ids only — custom modes are read from `settings.modes` at runtime. */
export const POST_PROCESS_MODE_IDS: PostProcessModeId[] = [
  "raw",
  "format",
  "email",
  "translate",
  "code",
];

export interface AppSettings {
  stt: SttConfig;
  llm: LlmConfig;
  activation_mode: "hold" | "double_tap";
  hotkey: HotkeyConfig;
  language: LanguageConfig;
  auto_paste: boolean;
  /** @default false */
  replace_selection: boolean;
  local_stt_server: LocalSttServerConfig;
  onboarding_completed: boolean;
  onboarding_step: number;
  ui_language: "ja" | "en";
  /** @default "system" */
  appearance: AppAppearance;
  /** @default [] */
  replacements: ReplacementRule[];
  /** @default "format" */
  active_mode_id: string;
  /** @default builtin presets */
  modes: PostProcessMode[];
  /** @default true — when false, do not persist recognition history */
  history_enabled: boolean;
  /** @default 0 — auto-delete after N days; 0 = keep until max count */
  history_retention_days: number;
  /** Optional mode → hotkey map (e.g. `{ email: "ctrl+1" }`) */
  mode_hotkeys: Record<string, string>;
  /** @default 500 — discard recordings shorter than this; 0 disables */
  min_recording_ms: number;
  /** @default false — strip "えーと" / "um" from the transcript and ask the LLM to do the same */
  remove_fillers: boolean;
}

export const getSettings = () => invoke<AppSettings>("get_settings");

export const saveSettings = (settings: AppSettings) =>
  invoke("save_settings", { settings });

export const testMicrophone = () => invoke<string>("test_microphone");
export interface SttTestResult {
  raw_text: string;
  processed_text: string | null;
}
export const testMicrophoneStt = () => invoke<SttTestResult>("test_microphone_stt");

export const checkSttServer = () => invoke<boolean>("check_stt_server");
export const startSttServer = () => invoke<void>("start_stt_server");
export const stopSttServer = () => invoke<void>("stop_stt_server");
export const checkDownloadedModels = () => invoke<string[]>("check_downloaded_models");
export const downloadModel = (model: string) => invoke<void>("download_model", { model });
export const cancelDownload = () => invoke<void>("cancel_download");
export const setupLocalWhisper = () => invoke<void>("setup_local_whisper");
export const checkVenvExists = () => invoke<boolean>("check_venv_exists");
export const openSystemPreferences = (pane: string) =>
  invoke<void>("open_system_preferences", { pane });

export interface PermissionStatus {
  accessibility: boolean;
  microphone: boolean;
  input_monitoring: boolean;
}
export const checkPermissions = () => invoke<PermissionStatus>("check_permissions");

/** Payload of the `hotkey-permission-status` event, emitted every ~20s while
 * the app runs post-onboarding so the UI can warn if the hotkey has silently
 * stopped working (permission revoked, or never actually granted). */
export interface HotkeyPermissionStatus {
  accessibility: boolean;
  input_monitoring: boolean;
  ok: boolean;
}
export const initializeHotkeys = () => invoke<void>("initialize_hotkeys");
export const saveOnboardingStep = (step: number) =>
  invoke<void>("save_onboarding_step", { step });
export const setHotkeyTestMode = (enabled: boolean) =>
  invoke<void>("set_hotkey_test_mode", { enabled });
export const getBuildNumber = () => invoke<string>("get_build_number");

export interface HistoryEntry {
  id: string;
  text: string;
  raw_text: string;
  language: string;
  created_at: number;
}

export const getHistory = () => invoke<HistoryEntry[]>("get_history");
export const clearHistory = () => invoke<void>("clear_history");
export const deleteHistoryEntry = (id: string) =>
  invoke<void>("delete_history_entry", { id });
export const copyHistoryText = (text: string) =>
  invoke<void>("copy_history_text", { text });
export const pasteHistoryText = (text: string) =>
  invoke<void>("paste_history_text", { text });

// Preset configurations for common providers
export const STT_PRESETS = {
  openai: {
    provider: "openai_cloud" as const,
    base_url: "https://api.openai.com/v1",
    model: "whisper-1",
  },
  lm_studio: {
    provider: "local_api" as const,
    base_url: "http://localhost:1234/v1",
    model: "whisper-large-v3",
  },
  local_whisper: {
    provider: "local_api" as const,
    base_url: "http://localhost:8080/v1",
    model: "whisper-large-v3",
  },
};

export const LLM_PRESETS = {
  claude: {
    provider: "claude" as const,
    base_url: "https://api.anthropic.com",
    model: "claude-haiku-4-5-20251001",
  },
  openai: {
    provider: "openai_compatible" as const,
    base_url: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  openrouter: {
    provider: "openai_compatible" as const,
    base_url: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
  },
  ollama: {
    provider: "openai_compatible" as const,
    base_url: "http://localhost:11434/v1",
    model: "llama3.2",
  },
  lm_studio: {
    provider: "openai_compatible" as const,
    base_url: "http://localhost:1234/v1",
    model: "loaded-model",
  },
};

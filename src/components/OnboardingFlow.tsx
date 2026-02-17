import { useState, useEffect, useRef, useCallback } from "react";
import {
  AppSettings,
  STT_PRESETS,
  SttConfig,
  getSettings,
  saveOnboardingStep,
  setupLocalWhisper,
  downloadModel,
  checkDownloadedModels,
  checkVenvExists,
  openSystemPreferences,
  checkPermissions,
  initializeHotkeys,
  setHotkeyTestMode,
  PermissionStatus,
} from "../lib/ipc";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { useRecordingState } from "../hooks/useRecordingState";
import { translations, t, UILanguage } from "../lib/i18n";

const T = translations.onboarding;

/* ─── Helpers (shared with SettingsPanel) ─── */

function formatHotkeyLabel(key: string): string {
  const SPECIAL_LABELS: Record<string, string> = {
    right_shift: "Right Shift",
    left_shift: "Left Shift",
    left_cmd: "Left Cmd",
    right_cmd: "Right Cmd",
    left_ctrl: "Left Ctrl",
    right_ctrl: "Right Ctrl",
    left_option: "Left Option",
    right_option: "Right Option",
    tab: "Tab",
  };
  if (SPECIAL_LABELS[key]) return SPECIAL_LABELS[key];
  return key
    .split("+")
    .map((part) => {
      if (part === "ctrl") return "Ctrl";
      if (part === "meta" || part === "cmd") return "Cmd";
      if (part === "alt") return "Alt";
      if (part === "shift") return "Shift";
      if (part.startsWith("f") && /^f\d+$/.test(part)) return part.toUpperCase();
      if (part === "space") return "Space";
      return part.toUpperCase();
    })
    .join(" + ");
}

function hotkeyFromEvent(e: KeyboardEvent): string | null | undefined {
  if (e.code === "Escape") return null;

  // Standalone modifier keys — map to specific key names for CGEventTap
  const STANDALONE_MODIFIERS: Record<string, string> = {
    ShiftRight: "right_shift",
    ShiftLeft: "left_shift",
    MetaLeft: "left_cmd",
    MetaRight: "right_cmd",
    ControlLeft: "left_ctrl",
    ControlRight: "right_ctrl",
    AltLeft: "left_option",
    AltRight: "right_option",
  };

  const standalone = STANDALONE_MODIFIERS[e.code];
  if (standalone) {
    const otherMods =
      (e.code.startsWith("Shift") ? false : e.shiftKey) ||
      (e.code.startsWith("Meta") ? false : e.metaKey) ||
      (e.code.startsWith("Control") ? false : e.ctrlKey) ||
      (e.code.startsWith("Alt") ? false : e.altKey);
    if (!otherMods) return standalone;
    return undefined; // keep waiting
  }

  const parts: string[] = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.metaKey) parts.push("meta");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");

  let keyName: string;
  if (e.code.startsWith("Key")) keyName = e.code.slice(3).toLowerCase();
  else if (e.code.startsWith("Digit")) keyName = e.code.slice(5);
  else if (e.code.startsWith("F") && /^F\d+$/.test(e.code)) keyName = e.code.toLowerCase();
  else keyName = e.code.toLowerCase();

  parts.push(keyName);
  return parts.join("+");
}

const SAMPLE_TEXT: Record<string, string> = {
  japanese:
    "明日の午後3時から会議があります。資料の準備をお願いします。場所は第2会議室で、参加者は5名の予定です。",
  english:
    "We have a meeting scheduled for tomorrow at 3 PM. Please prepare the documents in advance. It will be held in Conference Room B with five attendees.",
};

/* ─── Step: Welcome ─── */

function StepWelcome({ lang }: { lang: UILanguage }) {
  const W = T.welcome;
  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 mb-4">
          <img src="/app-icon.png" alt="Whisper Dictation" className="w-16 h-16" />
        </div>
        <h3 className="text-xl font-semibold text-slate-700 mb-2">
          {t(W.title, lang)}
        </h3>
        <p className="text-sm text-slate-400 leading-relaxed">
          {t(W.description, lang)}
        </p>
      </div>

      <div className="space-y-2.5 mt-6">
        {W.features.map((feature, i) => (
          <div key={i} className="flex items-start gap-3 bg-slate-50 rounded-lg px-3.5 py-2.5 border border-slate-100">
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center mt-0.5">
              <svg className="w-3 h-3 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-slate-600">{t(feature, lang)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Step: Permissions ─── */

function StepPermissions({ lang }: { lang: UILanguage }) {
  const P = T.permissions;

  const [permStatus, setPermStatus] = useState<PermissionStatus | null>(null);

  useEffect(() => {
    const poll = () => {
      checkPermissions().then(setPermStatus).catch(() => {});
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);

  const permissions = [
    { key: "accessibility" as const, ...P.accessibility },
    { key: "input_monitoring" as const, ...P.inputMonitoring },
    { key: "microphone" as const, ...P.microphone },
  ];

  const isGranted = (key: string): boolean | null => {
    if (!permStatus) return null;
    if (key === "accessibility") return permStatus.accessibility;
    if (key === "microphone") return permStatus.microphone;
    if (key === "input_monitoring") return permStatus.input_monitoring;
    return null;
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-slate-700 mb-1">
          {t(P.title, lang)}
        </h3>
        <p className="text-sm text-slate-400">
          {t(P.description, lang)}
        </p>
      </div>

      <div className="space-y-3">
        {permissions.map((perm) => {
          const granted = isGranted(perm.key);
          return (
            <div
              key={perm.key}
              className={`flex items-center justify-between rounded-lg px-4 py-3 border transition-colors ${
                granted
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-slate-50 border-slate-100"
              }`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0 mr-3">
                {granted !== null && (
                  <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                    granted ? "bg-emerald-500" : "bg-slate-200"
                  }`}>
                    {granted ? (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {t(perm.label, lang)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {t(perm.description, lang)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => openSystemPreferences(perm.key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  granted
                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    : "bg-violet-100 text-violet-700 hover:bg-violet-200"
                }`}
              >
                {t(P.openSettings, lang)}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        {t(P.note, lang)}
      </p>
    </div>
  );
}

/* ─── Step: Local Whisper Setup ─── */

function LocalWhisperSetup({ settings, save, lang }: { settings: AppSettings; save: (s: AppSettings) => void; lang: UILanguage }) {
  const S = T.stt;
  const [setupStep, setSetupStep] = useState<"idle" | "venv" | "pip" | "download" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    Promise.all([checkVenvExists(), checkDownloadedModels()]).then(([venvExists, models]) => {
      if (venvExists && models.length > 0) {
        setSetupStep("done");
        setMessage(t(S.localWhisperReady, lang));
      }
    }).catch(() => {});
  }, [lang]);

  useEffect(() => {
    const unlisten = listen<{ step: string; message: string }>("setup-progress", (event) => {
      const { step, message: msg } = event.payload;
      setSetupStep(step as typeof setupStep);
      setMessage(msg);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    const unlisten = listen<{ status: string; progress: number; message: string }>("download-progress", (event) => {
      const { status, progress, message: msg } = event.payload;
      setDownloadProgress(progress);
      setMessage(msg);
      if (status === "done") {
        setSetupStep("done");
        setMessage(t(S.localWhisperReady, lang));
        // Sync React state with Rust-side model change ("base")
        save({ ...settings, local_stt_server: { ...settings.local_stt_server, model: "base" } });
      } else if (status === "error") {
        setSetupStep("error");
      }
    });
    return () => { unlisten.then((f) => f()); };
  }, [lang]);

  const handleSetup = async () => {
    try {
      await setupLocalWhisper();
      setSetupStep("download");
      setMessage("Downloading base model...");
      setDownloadProgress(0);
      await downloadModel("base");
    } catch (e) {
      setSetupStep("error");
      setMessage(String(e));
    }
  };

  const isRunning = setupStep === "venv" || setupStep === "pip" || setupStep === "download";

  return (
    <div className="space-y-3">
      {setupStep === "done" ? (
        <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {message}
        </div>
      ) : (
        <>
          {!isRunning && setupStep !== "error" && (
            <button
              onClick={handleSetup}
              className="w-full bg-violet-500 text-white hover:bg-violet-600 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {t(S.setupLocalWhisper, lang)}
            </button>
          )}

          {isRunning && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-violet-600 font-medium">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {message}
              </div>
              {setupStep === "download" && (
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div
                    className="bg-violet-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {setupStep === "error" && (
            <div className="space-y-2">
              <p className="text-sm text-rose-500">{message}</p>
              <button
                onClick={handleSetup}
                className="w-full bg-slate-100 text-slate-600 hover:bg-slate-200 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {t(S.retry, lang)}
              </button>
            </div>
          )}
        </>
      )}

      <p className="text-[11px] text-slate-400">
        {t(S.localWhisperNote, lang)}
      </p>
    </div>
  );
}

/* ─── Step: STT ─── */

function StepStt({
  settings,
  save,
  lang,
}: {
  settings: AppSettings;
  save: (s: AppSettings) => void;
  lang: UILanguage;
}) {
  const S = T.stt;

  const updateStt = (patch: Partial<SttConfig>) => {
    const merged = { ...settings.stt, ...patch };
    if (patch.api_key !== undefined && !patch.preset_api_keys) {
      merged.preset_api_keys = {
        ...(settings.stt.preset_api_keys ?? {}),
        [merged.preset || "openai"]: patch.api_key,
      };
    }
    save({ ...settings, stt: merged });
  };

  const applySttPreset = (key: keyof typeof STT_PRESETS) => {
    const preset = STT_PRESETS[key];
    const oldPreset = settings.stt.preset || "openai";
    const updatedKeys = {
      ...(settings.stt.preset_api_keys ?? {}),
      [oldPreset]: settings.stt.api_key,
    };
    const restoredKey = updatedKeys[key] ?? "";
    updateStt({
      ...preset,
      api_key: restoredKey,
      preset: key,
      preset_api_keys: updatedKeys,
    });
  };

  const isLocalWhisper = settings.stt.preset === "local_whisper";
  const isLocal = settings.stt.provider === "local_api";

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-slate-700 mb-1">
          {t(S.title, lang)}
        </h3>
        <p className="text-sm text-slate-400">
          {t(S.description, lang)}
        </p>
      </div>

      {/* Provider tabs */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-400">
          {t(S.provider, lang)}
        </label>
        <div className="flex gap-2">
          {(
            Object.entries(STT_PRESETS) as [
              keyof typeof STT_PRESETS,
              (typeof STT_PRESETS)[keyof typeof STT_PRESETS],
            ][]
          ).map(([key]) => (
            <button
              key={key}
              className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                settings.stt.preset === key
                  ? "bg-violet-100 text-violet-700 font-medium ring-1 ring-violet-200"
                  : "bg-slate-50 text-slate-500 hover:bg-slate-100"
              }`}
              onClick={() => applySttPreset(key)}
            >
              {key === "openai"
                ? "OpenAI"
                : key === "lm_studio"
                  ? "LM Studio"
                  : lang === "ja" ? "ローカルモデル" : "Local Model"}
            </button>
          ))}
        </div>
      </div>

      {/* OpenAI / LM Studio fields */}
      {!isLocalWhisper && (
        <>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-400">
              {t(S.model, lang)}
            </label>
            <input
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300"
              value={settings.stt.model}
              onChange={(e) => updateStt({ model: e.target.value })}
            />
          </div>

          {isLocal && (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-400">
                {t(S.baseUrl, lang)}
              </label>
              <input
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300"
                value={settings.stt.base_url}
                onChange={(e) => updateStt({ base_url: e.target.value })}
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-400">
              {t(S.apiKey, lang)}
            </label>
            <input
              type="password"
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300"
              value={settings.stt.api_key}
              onChange={(e) => updateStt({ api_key: e.target.value })}
              placeholder={isLocal ? lang === "ja" ? "（不要）" : "(not required)" : "sk-..."}
            />
          </div>
        </>
      )}

      {/* Local Whisper setup */}
      {isLocalWhisper && <LocalWhisperSetup settings={settings} save={save} lang={lang} />}

      {/* Tip */}
      <p className="text-[11px] text-slate-400 leading-relaxed">
        {t(S.tip, lang)}
      </p>
    </div>
  );
}

/* ─── Step: Hotkey ─── */

function StepHotkey({
  settings,
  save,
  lang,
  initialCapturing,
  onHotkeySet,
}: {
  settings: AppSettings;
  save: (s: AppSettings) => void;
  lang: UILanguage;
  initialCapturing: boolean;
  onHotkeySet: () => void;
}) {
  const H = T.hotkey;
  const [capturing, setCapturing] = useState(initialCapturing);
  const [detected, setDetected] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const update = useCallback(
    (patch: Partial<AppSettings>) => save({ ...settings, ...patch }),
    [settings, save]
  );

  // Enable hotkey test mode while on this step (suppresses actual recording)
  useEffect(() => {
    setHotkeyTestMode(true).catch(() => {});
    return () => { setHotkeyTestMode(false).catch(() => {}); };
  }, []);

  // Listen for hotkey detection events (test mode emits these instead of recording)
  useEffect(() => {
    const unlisten = listen<string>("hotkey-detected", (event) => {
      if (event.payload === "pressed") {
        setDetected(true);
      } else {
        // Show feedback briefly then hide
        setTimeout(() => setDetected(false), 1500);
      }
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setCapturing(false);
        return;
      }
      const key = hotkeyFromEvent(e);
      if (!key) return;
      update({ hotkey: { ...settings.hotkey, key } });
      onHotkeySet();
      setCapturing(false);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturing, settings.hotkey, update]);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-slate-700 mb-1">
          {t(H.title, lang)}
        </h3>
        <p className="text-sm text-slate-400">
          {t(H.description, lang)}
        </p>
      </div>

      {/* Activation Mode */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-400">
          {t(H.activationMode, lang)}
        </label>
        <div className="flex gap-2">
          {(["hold", "double_tap"] as const).map((mode) => (
            <button
              key={mode}
              className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                settings.activation_mode === mode
                  ? "bg-violet-100 text-violet-700 font-medium ring-1 ring-violet-200"
                  : "bg-slate-50 text-slate-500 hover:bg-slate-100"
              }`}
              onClick={() => update({ activation_mode: mode })}
            >
              {mode === "hold" ? t(H.holdToRecord, lang) : t(H.doubleTap, lang)}
            </button>
          ))}
        </div>
      </div>

      {/* Key capture */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-400">
          {t(H.hotkeyLabel, lang)}
        </label>
        <button
          ref={buttonRef}
          onClick={() => setCapturing(true)}
          className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${
            capturing
              ? "bg-violet-50 text-violet-500 ring-2 ring-violet-300 animate-pulse"
              : "bg-white border border-slate-200 text-slate-700 hover:border-violet-300"
          }`}
        >
          {capturing
            ? t(H.pressAKey, lang)
            : formatHotkeyLabel(settings.hotkey.key)}
        </button>
      </div>

      {/* Double-tap interval */}
      {settings.activation_mode === "double_tap" && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-400">
            {lang === "ja" ? "ダブルタップ間隔" : "Double-tap interval"}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={150}
              max={600}
              step={50}
              value={settings.hotkey.double_tap_ms}
              onChange={(e) => update({ hotkey: { ...settings.hotkey, double_tap_ms: Number(e.target.value) } })}
              className="flex-1 accent-violet-500"
            />
            <span className="text-xs text-slate-500 w-14 text-right">{settings.hotkey.double_tap_ms}ms</span>
          </div>
          <p className="text-[11px] text-slate-400">
            {lang === "ja"
              ? "2回押しの間隔です。短いほど素早い操作が必要です。"
              : "Time window between two presses. Shorter = faster taps required."}
          </p>
        </div>
      )}

      {/* Hotkey detection feedback */}
      {detected && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 animate-pulse">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {lang === "ja" ? "ホットキー検出OK" : "Hotkey detected OK"}
        </div>
      )}
    </div>
  );
}

/* ─── Step: Test ─── */

function StepTest({ settings, lang }: { settings: AppSettings; lang: UILanguage }) {
  const Te = T.test;
  const { state, lastRawTranscription, lastTranscription, error, clearResults } =
    useRecordingState();

  // Clear any leftover results from previous steps (e.g. hotkey step leaking recordings)
  useEffect(() => {
    clearResults();
  }, []);

  const sttLang = settings.language.mode || "english";
  const sampleText = SAMPLE_TEXT[sttLang] || SAMPLE_TEXT.english;

  const hotkeyLabel = formatHotkeyLabel(settings.hotkey.key);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-slate-700 mb-1">
          {t(Te.title, lang)}
        </h3>
        <p className="text-sm text-slate-400">
          {t(Te.description, lang)}
        </p>
      </div>

      {/* Sample text */}
      <div className="space-y-2">
        <p className="text-[10px] text-slate-400 uppercase tracking-wider">
          {t(Te.tryReading, lang)}
        </p>
        <p className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 leading-relaxed">
          {sampleText}
        </p>
      </div>

      {/* Recording status */}
      <div className="space-y-3">
        {state === "recording" && (
          <div className="flex items-center gap-2 text-sm text-rose-500 font-medium">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
            </span>
            {t(Te.recording, lang)}
          </div>
        )}
        {state === "processing" && (
          <div className="flex items-center gap-2 text-sm text-amber-500 font-medium">
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {t(Te.processing, lang)}
          </div>
        )}
        {state === "idle" && (
          <p className="text-sm text-slate-400">
            {Te.pressToStart[lang](hotkeyLabel, settings.activation_mode)}
          </p>
        )}

        {error && <p className="text-sm text-rose-500">{error}</p>}

        {lastRawTranscription && (
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2">
            <div>
              <p className="text-[10px] text-slate-400 mb-0.5">Raw STT</p>
              <p className="text-sm text-slate-600">{lastRawTranscription}</p>
            </div>
            {settings.llm.enabled &&
              lastTranscription &&
              lastTranscription !== lastRawTranscription && (
                <div className="border-t border-slate-100 pt-2">
                  <p className="text-[10px] text-violet-400 mb-0.5">After LLM</p>
                  <p className="text-sm text-slate-700">{lastTranscription}</p>
                </div>
              )}
          </div>
        )}
      </div>

      {/* Tip */}
      <p className="text-[11px] text-slate-400 leading-relaxed whitespace-pre-line">
        {t(T.test.tip, lang)}
      </p>
    </div>
  );
}

/* ─── Main Onboarding Flow ─── */

export function OnboardingFlow({
  settings,
  save,
  onComplete,
}: {
  settings: AppSettings;
  save: (s: AppSettings) => void;
  onComplete?: () => void;
}) {
  const [step, setStepRaw] = useState(settings.onboarding_step || 0);
  const [version, setVersion] = useState("");
  const hotkeyTouchedRef = useRef(false);
  const lang: UILanguage = settings.ui_language || "ja";

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  // Persist step to settings so it survives app restart (e.g. after granting permissions).
  // Uses a dedicated IPC to only update onboarding_step, avoiding race conditions
  // with other concurrent save calls (e.g. hotkey changes from StepHotkey).
  const setStep = (s: number) => {
    setStepRaw(s);
    saveOnboardingStep(s).catch(() => {});
  };

  // If resuming past the permissions page, initialize hotkeys (they weren't registered at startup)
  useEffect(() => {
    if ((settings.onboarding_step || 0) > 1) {
      initializeHotkeys().catch(() => {});
    }
  }, []);

  const setLang = (l: UILanguage) => {
    save({ ...settings, ui_language: l });
  };

  const STEPS = [
    t(T.steps.welcome, lang),
    t(T.steps.permissions, lang),
    t(T.steps.stt, lang),
    t(T.steps.hotkey, lang),
    t(T.steps.test, lang),
  ];

  const handleComplete = async () => {
    if (onComplete) {
      onComplete();
    } else {
      const latest = await getSettings();
      save({ ...latest, onboarding_completed: true, onboarding_step: 0 });
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-white">
      <div className="w-full max-w-md px-6">
        {/* Language toggle */}
        <div className="flex justify-end mb-4">
          <div className="flex gap-1 bg-slate-50 rounded-lg p-0.5">
            {(["ja", "en"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  lang === l
                    ? "bg-white text-slate-700 shadow-sm"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {l === "ja" ? "日本語" : "English"}
              </button>
            ))}
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((_label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                  i === step
                    ? "bg-violet-500 text-white"
                    : i < step
                      ? "bg-violet-100 text-violet-600"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {i < step ? "✓" : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-8 h-0.5 ${
                    i < step ? "bg-violet-200" : "bg-slate-100"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="mb-8">
          {step === 0 && <StepWelcome lang={lang} />}
          {step === 1 && <StepPermissions lang={lang} />}
          {step === 2 && <StepStt settings={settings} save={save} lang={lang} />}
          {step === 3 && <StepHotkey settings={settings} save={save} lang={lang} initialCapturing={!hotkeyTouchedRef.current} onHotkeySet={() => { hotkeyTouchedRef.current = true; }} />}
          {step === 4 && <StepTest settings={settings} lang={lang} />}
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors"
            >
              {t(T.nav.back, lang)}
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => {
                // After permissions page, initialize hotkeys (triggers macOS permission dialogs)
                if (step === 1) {
                  initializeHotkeys().catch(() => {});
                }
                // After hotkey page, reload hotkeys so the test step uses the newly configured key
                if (step === 3) {
                  initializeHotkeys().catch(() => {});
                }
                setStep(step + 1);
              }}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-violet-500 text-white hover:bg-violet-600 transition-colors"
            >
              {t(T.nav.next, lang)}
            </button>
          ) : (
            <button
              onClick={handleComplete}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-violet-500 text-white hover:bg-violet-600 transition-colors"
            >
              {t(T.nav.complete, lang)}
            </button>
          )}
        </div>

        {/* Version */}
        {version && (
          <p className="text-center text-[11px] text-slate-300 mt-4">v{version}</p>
        )}
      </div>
    </div>
  );
}

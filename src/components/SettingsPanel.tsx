import { useState, useEffect, useRef } from "react";
import {
  AppSettings,
  STT_PRESETS,
  LLM_PRESETS,
  SttConfig,
  LlmConfig,
  LocalSttServerConfig,
  checkSttServer,
  startSttServer,
  stopSttServer,
  checkDownloadedModels,
  downloadModel,
  cancelDownload,
  checkVenvExists,
  setupLocalWhisper,
  getSettings,
} from "../lib/ipc";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useSettings } from "../hooks/useSettings";
import { useRecordingState } from "../hooks/useRecordingState";
import { OnboardingFlow } from "./OnboardingFlow";
import { translations, t, UILanguage } from "../lib/i18n";

const TS = translations.settings;

type Section = "general" | "transcription" | "post_processing" | "test";

/* ─── Sub-panels ─── */

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

function hotkeyFromEvent(e: KeyboardEvent): string | null {
  // Escape = cancel
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

  // If a modifier key is pressed alone (no other modifiers held), register it as standalone
  const standalone = STANDALONE_MODIFIERS[e.code];
  if (standalone) {
    const otherMods =
      (e.code.startsWith("Shift") ? false : e.shiftKey) ||
      (e.code.startsWith("Meta") ? false : e.metaKey) ||
      (e.code.startsWith("Control") ? false : e.ctrlKey) ||
      (e.code.startsWith("Alt") ? false : e.altKey);
    if (!otherMods) return standalone;
    // If other modifiers are held, keep waiting for a non-modifier key
    return "";
  }

  const parts: string[] = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.metaKey) parts.push("meta");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");

  // Map event.code to a short key name
  let keyName: string;
  if (e.code.startsWith("Key")) {
    keyName = e.code.slice(3).toLowerCase(); // KeyA → a
  } else if (e.code.startsWith("Digit")) {
    keyName = e.code.slice(5); // Digit1 → 1
  } else if (e.code.startsWith("F") && /^F\d+$/.test(e.code)) {
    keyName = e.code.toLowerCase(); // F5 → f5
  } else {
    // Space, Enter, Backspace, Tab, etc.
    keyName = e.code.toLowerCase();
  }

  parts.push(keyName);
  return parts.join("+");
}

function HotkeyCapture({
  settings,
  update,
  lang,
}: {
  settings: AppSettings;
  update: (p: Partial<AppSettings>) => void;
  lang: UILanguage;
}) {
  const G = TS.general;
  const [capturing, setCapturing] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

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
      if (!key) return; // null = cancel, "" = lone modifier, keep waiting

      update({ hotkey: { ...settings.hotkey, key } });
      setCapturing(false);
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturing, settings.hotkey, update]);

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-slate-400">
        {t(G.hotkey, lang)}
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
        {capturing ? t(G.pressAKey, lang) : formatHotkeyLabel(settings.hotkey.key)}
      </button>
      <p className="text-[11px] text-slate-400">
        {t(G.restartRequired, lang)}
      </p>
    </div>
  );
}

function GeneralSection({
  settings,
  update,
  lang,
}: {
  settings: AppSettings;
  update: (p: Partial<AppSettings>) => void;
  lang: UILanguage;
}) {
  const G = TS.general;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [autoLaunch, setAutoLaunch] = useState(false);

  useEffect(() => {
    import("@tauri-apps/plugin-autostart").then(({ isEnabled }) =>
      isEnabled().then(setAutoLaunch)
    ).catch(() => {});
  }, []);

  const toggleAutoLaunch = async (enabled: boolean) => {
    try {
      const { enable, disable } = await import("@tauri-apps/plugin-autostart");
      if (enabled) await enable(); else await disable();
      setAutoLaunch(enabled);
    } catch (e) {
      console.error("Autostart toggle failed:", e);
    }
  };

  return (
    <div className="space-y-5">
      {/* Activation Mode */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-400">
          {t(G.activationMode, lang)}
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
              {mode === "hold" ? t(G.holdToRecord, lang) : t(G.doubleTap, lang)}
            </button>
          ))}
        </div>
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

      {/* Hotkey */}
      <HotkeyCapture settings={settings} update={update} lang={lang} />

      {/* Advanced accordion */}
      <div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
        >
          <span
            className="transition-transform duration-200 text-[10px]"
            style={{ transform: showAdvanced ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            ▶
          </span>
          {t(G.advanced, lang)}
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-5 pl-1">
            {/* Language */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-400">
                {t(G.language, lang)}
              </label>
              <div className="flex gap-2">
                {(["auto", "japanese", "english"] as const).map((mode) => (
                  <button
                    key={mode}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm capitalize transition-all ${
                      settings.language.mode === mode
                        ? "bg-violet-100 text-violet-700 font-medium ring-1 ring-violet-200"
                        : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                    }`}
                    onClick={() =>
                      update({ language: { ...settings.language, mode } })
                    }
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-paste */}
            <label className="flex items-center gap-3 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.auto_paste}
                onChange={(e) => update({ auto_paste: e.target.checked })}
                className="accent-violet-500 w-4 h-4"
              />
              {t(G.autoPaste, lang)}
            </label>

            {/* Auto-launch on login */}
            <label className="flex items-center gap-3 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={autoLaunch}
                onChange={(e) => toggleAutoLaunch(e.target.checked)}
                className="accent-violet-500 w-4 h-4"
              />
              {lang === "ja" ? "ログイン時に自動起動" : "Launch at login"}
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

function TranscriptionSection({
  settings,
  update,
  updateStt,
  applySttPreset,
  lang,
}: {
  settings: AppSettings;
  update: (p: Partial<AppSettings>) => void;
  updateStt: (p: Partial<SttConfig>) => void;
  applySttPreset: (key: keyof typeof STT_PRESETS) => void;
  lang: UILanguage;
}) {
  const TR = TS.transcription;
  const localServer: LocalSttServerConfig = settings.local_stt_server ?? {
    model: "base",
    port: 8080,
    host: "127.0.0.1",
  };
  const isLocalWhisper = settings.stt.preset === "local_whisper";
  const isLocalStt = settings.stt.provider === "local_api";

  const [serverRunning, setServerRunning] = useState<boolean | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadMessage, setDownloadMessage] = useState("");
  const [venvReady, setVenvReady] = useState<boolean | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [setupMessage, setSetupMessage] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausePollUntilRef = useRef<number>(0);

  const modelIsDownloaded = downloadedModels.includes(localServer.model);

  useEffect(() => {
    checkDownloadedModels().then(setDownloadedModels).catch(() => {});
    if (isLocalWhisper) {
      checkVenvExists().then(setVenvReady).catch(() => setVenvReady(false));
    }
  }, [isLocalWhisper]);

  // Listen for download progress events
  useEffect(() => {
    const unlisten = listen<{ status: string; progress: number; message: string }>(
      "download-progress",
      (event) => {
        const { status, progress, message } = event.payload;
        setDownloadProgress(progress);
        setDownloadMessage(message);
        if (status === "done") {
          setDownloading(false);
          setDownloadProgress(100);
          setDownloadMessage("Download complete");
          // Refresh downloaded models list
          checkDownloadedModels().then(setDownloadedModels).catch(() => {});
        } else if (status === "error" || status === "cancelled") {
          setDownloading(false);
          setDownloadProgress(0);
        }
      }
    );
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    if (!isLocalWhisper) {
      setServerRunning(null);
      return;
    }
    const poll = () => {
      if (Date.now() < pausePollUntilRef.current) return;
      checkSttServer()
        .then(setServerRunning)
        .catch(() => setServerRunning(false));
    };
    poll();
    pollRef.current = setInterval(poll, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isLocalWhisper]);

  const updateLocalServer = (patch: Partial<LocalSttServerConfig>) => {
    update({ local_stt_server: { ...localServer, ...patch } });
  };

  const handleStartServer = async () => {
    setServerLoading(true);
    setServerError("");
    try {
      await startSttServer();
      await new Promise((r) => setTimeout(r, 2000));
      const running = await checkSttServer();
      setServerRunning(running);
      if (!running) {
        setServerError("Server started but health check failed. Check logs.");
      }
    } catch (e) {
      setServerRunning(false);
      setServerError(String(e));
    } finally {
      setServerLoading(false);
    }
  };

  const handleStopServer = async () => {
    setServerLoading(true);
    try {
      await stopSttServer();
      setServerRunning(false);
      pausePollUntilRef.current = Date.now() + 10000;
    } catch (e) {
      alert(`Failed to stop: ${e}`);
    } finally {
      setServerLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadProgress(0);
    setDownloadMessage("Starting download...");
    try {
      await downloadModel(localServer.model);
    } catch (e) {
      setDownloading(false);
      setDownloadMessage(`Error: ${e}`);
    }
  };

  const handleCancelDownload = async () => {
    try {
      await cancelDownload();
    } catch (e) {
      alert(`Failed to cancel: ${e}`);
    }
  };

  // Listen for setup-progress events (for venv setup from settings)
  useEffect(() => {
    if (!settingUp) return;
    const unlisten = listen<{ step: string; message: string }>(
      "setup-progress",
      (event) => {
        const { step, message } = event.payload;
        setSetupMessage(message);
        if (step === "done") {
          setSettingUp(false);
          setVenvReady(true);
          checkDownloadedModels().then(setDownloadedModels).catch(() => {});
        } else if (step === "error") {
          setSettingUp(false);
        }
      }
    );
    return () => { unlisten.then((f) => f()); };
  }, [settingUp]);

  const handleSetupLocalWhisper = async () => {
    setSettingUp(true);
    setSetupMessage(lang === "ja" ? "セットアップ中..." : "Setting up...");
    try {
      await setupLocalWhisper();
    } catch (e) {
      setSettingUp(false);
      setSetupMessage(`Error: ${e}`);
    }
  };

  return (
    <div className="space-y-5">
      {/* Provider */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-400">
          {t(TR.provider, lang)}
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

      {/* Base URL / Model / API Key — hidden for local model */}
      {!isLocalWhisper && (
        <>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-400">
              {t(TR.baseUrl, lang)}
            </label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none bg-white border-slate-200 text-slate-700 focus:ring-2 focus:ring-violet-200 focus:border-violet-300"
              value={settings.stt.base_url}
              onChange={(e) => updateStt({ base_url: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-400">
              {t(TR.model, lang)}
            </label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none bg-white border-slate-200 text-slate-700 focus:ring-2 focus:ring-violet-200 focus:border-violet-300"
              value={settings.stt.model}
              onChange={(e) => updateStt({ model: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-400">
              {t(TR.apiKey, lang)}
            </label>
            <input
              type="password"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none bg-white border-slate-200 text-slate-700 focus:ring-2 focus:ring-violet-200 focus:border-violet-300"
              value={settings.stt.api_key}
              onChange={(e) => updateStt({ api_key: e.target.value })}
              placeholder={isLocalStt ? (lang === "ja" ? "（不要）" : "(not required)") : "sk-..."}
            />
          </div>
        </>
      )}

      {/* Local model setup (venv not ready) */}
      {isLocalWhisper && venvReady === false && (
        <div className="space-y-3 bg-amber-50 rounded-xl p-4 border border-amber-100">
          <p className="text-sm text-amber-700 font-medium">
            {lang === "ja" ? "ローカルモデルが未セットアップです" : "Local model not set up"}
          </p>
          <p className="text-xs text-amber-600">
            {lang === "ja"
              ? "お使いのマシンにWhisperモデルをインストールします。ネット不要で音声認識できるようになります。"
              : "Installs a Whisper model on your machine for offline speech recognition."}
          </p>
          {settingUp ? (
            <div className="space-y-1">
              <div className="w-full bg-amber-100 rounded-full h-1.5 overflow-hidden">
                <div className="bg-amber-400 h-full rounded-full animate-pulse w-full" />
              </div>
              <p className="text-[11px] text-amber-500">{setupMessage}</p>
            </div>
          ) : (
            <button
              onClick={handleSetupLocalWhisper}
              className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-200 transition-colors"
            >
              {lang === "ja" ? "ローカルモデルをセットアップ" : "Setup Local Model"}
            </button>
          )}
        </div>
      )}

      {/* Local Server Management */}
      {isLocalWhisper && venvReady !== false && (
        <div className="space-y-3 bg-slate-50 rounded-xl p-4 border border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              {t(TR.localServer, lang)}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span
                className={`w-2 h-2 rounded-full ${
                  serverRunning === null
                    ? "bg-slate-300"
                    : serverRunning
                      ? "bg-emerald-400"
                      : "bg-rose-300"
                }`}
              />
              {serverRunning === null
                ? t(TR.checking, lang)
                : serverRunning
                  ? t(TR.running, lang)
                  : t(TR.stopped, lang)}
            </span>
          </div>

          <div className="space-y-1">
            <label className={`block text-xs ${serverRunning || serverLoading || downloading ? "text-slate-300" : "text-slate-400"}`}>
              {t(TR.model, lang)}
            </label>
            <div className="relative">
              <select
                className={`w-full appearance-none border rounded-lg px-3 py-2 pr-8 text-sm ${
                  serverRunning || serverLoading || downloading
                    ? "bg-white border-slate-100 text-slate-300 cursor-not-allowed"
                    : "bg-white border-slate-200 text-slate-700"
                }`}
                value={localServer.model}
                onChange={(e) => updateLocalServer({ model: e.target.value })}
                disabled={!!serverRunning || serverLoading || downloading}
              >
                {[
                  { value: "tiny", label: "tiny", size: "75MB" },
                  { value: "base", label: "base", size: "140MB" },
                  { value: "small", label: "small", size: "460MB" },
                  { value: "medium", label: "medium", size: "1.5GB" },
                  { value: "large-v3", label: "large-v3", size: "3GB" },
                ].map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label} ({m.size}){downloadedModels.includes(m.value) ? " ✓" : ""}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
          </div>

          {/* Download progress / Download button */}
          {!serverRunning && !modelIsDownloaded && (
            <div className="space-y-2">
              {downloading ? (
                <>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-violet-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">{downloadMessage}</span>
                    <button
                      onClick={handleCancelDownload}
                      className="text-[11px] text-rose-500 hover:text-rose-600 transition-colors"
                    >
                      {t(TR.cancel, lang)}
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={handleDownload}
                  className="w-full px-3 py-1.5 rounded-lg text-xs bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
                >
                  {t(TR.downloadModel, lang)}
                </button>
              )}
            </div>
          )}
          {!serverRunning && modelIsDownloaded && (
            <p className="text-[11px] text-emerald-500">{t(TR.modelDownloaded, lang)}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleStartServer}
              disabled={serverLoading || serverRunning === true || !modelIsDownloaded || downloading}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {serverLoading && !serverRunning ? t(TR.starting, lang) : t(TR.start, lang)}
            </button>
            <button
              onClick={handleStopServer}
              disabled={serverLoading || serverRunning === false}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-rose-100 text-rose-600 hover:bg-rose-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {serverLoading && serverRunning ? t(TR.stopping, lang) : t(TR.stop, lang)}
            </button>
          </div>

          {serverError && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-2">
              <p className="text-[11px] text-rose-600 whitespace-pre-wrap break-all">{serverError}</p>
            </div>
          )}

          <details className="group">
            <summary className="text-[11px] text-slate-400 cursor-pointer hover:text-slate-500 transition-colors select-none">
              Advanced
            </summary>
            <div className="mt-2 space-y-1">
              <label className={`block text-xs ${serverRunning ? "text-slate-300" : "text-slate-400"}`}>
                {t(TR.port, lang)}
              </label>
              <input
                type="number"
                className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none ${
                  serverRunning
                    ? "bg-white border-slate-100 text-slate-300 cursor-not-allowed"
                    : "bg-white border-slate-200 text-slate-700 focus:ring-2 focus:ring-violet-200 focus:border-violet-300"
                }`}
                value={localServer.port}
                onChange={(e) =>
                  updateLocalServer({ port: parseInt(e.target.value) || 8080 })
                }
                disabled={!!serverRunning}
              />
            </div>
          </details>

        </div>
      )}
    </div>
  );
}

function PostProcessingSection({
  settings,
  updateLlm,
  applyLlmPreset,
  lang,
}: {
  settings: AppSettings;
  updateLlm: (p: Partial<LlmConfig>) => void;
  applyLlmPreset: (key: keyof typeof LLM_PRESETS) => void;
  lang: UILanguage;
}) {
  const PP = TS.postProcessing;
  const isLocalLlm = settings.llm.provider === "openai_compatible";

  return (
    <div className="space-y-5">
      {/* Enable toggle */}
      <label className="flex items-center gap-3 text-sm text-slate-600 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.llm.enabled}
          onChange={(e) => updateLlm({ enabled: e.target.checked })}
          className="accent-violet-500 w-4 h-4"
        />
        {t(PP.enable, lang)}
      </label>

      {settings.llm.enabled && (
        <>
          {/* Provider */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-400">
              {t(PP.provider, lang)}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                Object.entries(LLM_PRESETS) as [
                  keyof typeof LLM_PRESETS,
                  (typeof LLM_PRESETS)[keyof typeof LLM_PRESETS],
                ][]
              ).map(([key]) => (
                <button
                  key={key}
                  className={`px-3 py-2 rounded-lg text-sm transition-all ${
                    settings.llm.preset === key
                      ? "bg-violet-100 text-violet-700 font-medium ring-1 ring-violet-200"
                      : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                  }`}
                  onClick={() => applyLlmPreset(key)}
                >
                  {key === "claude"
                    ? "Claude"
                    : key === "openai"
                      ? "OpenAI"
                      : key === "ollama"
                        ? "Ollama"
                        : "LM Studio"}
                </button>
              ))}
            </div>
          </div>

          {/* Base URL */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-400">
              {t(PP.baseUrl, lang)}
            </label>
            <input
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300"
              value={settings.llm.base_url}
              onChange={(e) => updateLlm({ base_url: e.target.value })}
            />
          </div>

          {/* Model */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-400">
              {t(PP.model, lang)}
            </label>
            <input
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300"
              value={settings.llm.model}
              onChange={(e) => updateLlm({ model: e.target.value })}
            />
          </div>

          {/* API Key */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-400">
              {t(PP.apiKey, lang)}{" "}
              {isLocalLlm && (
                <span className="text-slate-300 normal-case font-normal">
                  {t(PP.optionalForLocal, lang)}
                </span>
              )}
            </label>
            <input
              type="password"
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300"
              value={settings.llm.api_key}
              onChange={(e) => updateLlm({ api_key: e.target.value })}
              placeholder={isLocalLlm ? (lang === "ja" ? "（不要）" : "(not required)") : "sk-..."}
            />
          </div>
        </>
      )}
    </div>
  );
}

const SAMPLE_SENTENCES: Record<string, string> = {
  japanese:
    "明日の午後3時から会議があります。資料の準備をお願いします。場所は第2会議室で、参加者は5名の予定です。",
  english:
    "We have a meeting scheduled for tomorrow at 3 PM. Please prepare the documents in advance. It will be held in Conference Room B with five attendees.",
};

function TestSection({ settings, lang }: { settings: AppSettings; lang: UILanguage }) {
  const Te = TS.test;
  const { state, lastRawTranscription, lastTranscription, error } =
    useRecordingState();

  const sttLang = settings.language.mode || "english";
  const sampleText = SAMPLE_SENTENCES[sttLang] || SAMPLE_SENTENCES.english;

  const hotkeyLabel = formatHotkeyLabel(settings.hotkey.key);
  const modeLabel =
    settings.activation_mode === "hold"
      ? (lang === "ja" ? "長押し" : "hold")
      : (lang === "ja" ? "ダブルタップ" : "double tap");

  return (
    <div className="space-y-5">
      {/* Sample sentences */}
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
            {Te.pressToStart[lang](hotkeyLabel, modeLabel)}
          </p>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-rose-500">{error}</p>
        )}

        {/* Results */}
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
                  <p className="text-[10px] text-violet-400 mb-0.5">
                    After LLM
                  </p>
                  <p className="text-sm text-slate-700">
                    {lastTranscription}
                  </p>
                </div>
              )}
          </div>
        )}
      </div>

    </div>
  );
}

/* ─── Main Panel ─── */

type UpdateStatus = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "ready" | "error";

export function SettingsPanel() {
  const { settings, loading, saving, save } = useSettings();
  const [section, setSection] = useState<Section>("general");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [version, setVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateVersion, setUpdateVersion] = useState("");
  const updateRef = useRef<Awaited<ReturnType<typeof check>> | null>(null);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
    // Silent auto-check on startup
    checkForUpdate();
  }, []);

  async function checkForUpdate() {
    try {
      setUpdateStatus("checking");
      const update = await check();
      if (update) {
        setUpdateVersion(update.version);
        setUpdateStatus("available");
        updateRef.current = update;
      } else {
        setUpdateStatus("up-to-date");
        setTimeout(() => setUpdateStatus("idle"), 3000);
      }
    } catch (e) {
      console.error("Update check failed:", e);
      setUpdateStatus("error");
      setTimeout(() => setUpdateStatus("idle"), 3000);
    }
  }

  async function downloadAndInstall() {
    const update = updateRef.current;
    if (!update) return;
    try {
      setUpdateStatus("downloading");
      await update.downloadAndInstall();
      setUpdateStatus("ready");
    } catch (e) {
      console.error("Update download failed:", e);
      setUpdateStatus("error");
      setTimeout(() => setUpdateStatus("idle"), 3000);
    }
  }

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center h-screen bg-white text-slate-400">
        Loading...
      </div>
    );
  }

  if (!settings.onboarding_completed || showOnboarding) {
    return <OnboardingFlow settings={settings} save={save} onComplete={async () => { const latest = await getSettings(); save({ ...latest, onboarding_completed: true, onboarding_step: 0 }); setShowOnboarding(false); }} />;
  }

  const lang: UILanguage = settings.ui_language || "ja";

  const NAV_ITEMS: { key: Section; label: string }[] = [
    { key: "general", label: t(TS.nav.general, lang) },
    { key: "transcription", label: t(TS.nav.transcription, lang) },
    { key: "post_processing", label: t(TS.nav.postProcessing, lang) },
    { key: "test", label: t(TS.nav.test, lang) },
  ];

  const update = (patch: Partial<AppSettings>) => {
    save({ ...settings, ...patch });
  };

  const updateStt = (patch: Partial<SttConfig>) => {
    const merged = { ...settings.stt, ...patch };
    if (patch.api_key !== undefined && !patch.preset_api_keys) {
      merged.preset_api_keys = { ...(settings.stt.preset_api_keys ?? {}), [merged.preset || "openai"]: patch.api_key };
    }
    update({ stt: merged });
  };

  const updateLlm = (patch: Partial<LlmConfig>) => {
    const merged = { ...settings.llm, ...patch };
    if (patch.api_key !== undefined && !patch.preset_api_keys) {
      merged.preset_api_keys = { ...(settings.llm.preset_api_keys ?? {}), [merged.preset || "claude"]: patch.api_key };
    }
    update({ llm: merged });
  };

  const applySttPreset = (key: keyof typeof STT_PRESETS) => {
    const preset = STT_PRESETS[key];
    const oldPreset = settings.stt.preset || "openai";
    const updatedKeys = { ...(settings.stt.preset_api_keys ?? {}), [oldPreset]: settings.stt.api_key };
    const restoredKey = updatedKeys[key] ?? "";
    updateStt({ ...preset, api_key: restoredKey, preset: key, preset_api_keys: updatedKeys });
  };

  const applyLlmPreset = (key: keyof typeof LLM_PRESETS) => {
    const preset = LLM_PRESETS[key];
    const oldPreset = settings.llm.preset || "claude";
    const updatedKeys = { ...(settings.llm.preset_api_keys ?? {}), [oldPreset]: settings.llm.api_key };
    const restoredKey = updatedKeys[key] ?? "";
    updateLlm({ ...preset, api_key: restoredKey, preset: key, preset_api_keys: updatedKeys });
  };

  return (
    <div className="flex h-screen bg-white text-slate-700">
      {/* Left sidebar */}
      <aside className="w-52 flex-shrink-0 border-r border-slate-100 flex flex-col bg-slate-50/50">
        <div className="p-4 pb-2">
          <h1 className="text-sm font-semibold text-slate-600">
            {t(TS.appTitle, lang)}
          </h1>
        </div>
        <nav className="flex-1 px-2 py-2 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={`w-full flex items-center px-3 py-2 rounded-lg text-sm transition-all ${
                section === item.key
                  ? "bg-white text-slate-700 font-medium shadow-sm"
                  : "text-slate-400 hover:bg-white/60 hover:text-slate-600"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-slate-100 space-y-2">
          {saving && (
            <div className="text-[10px] text-slate-300">{t(TS.saving, lang)}</div>
          )}
          <button
            onClick={() => setShowOnboarding(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] text-slate-400 hover:text-violet-500 border border-dashed border-slate-200 hover:border-violet-300 hover:bg-violet-50/50 transition-all whitespace-nowrap"
          >
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t(TS.setupGuide, lang)}
          </button>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
            {(["ja", "en"] as const).map((l) => (
              <button
                key={l}
                onClick={() => update({ ui_language: l })}
                className={`flex-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                  lang === l
                    ? "bg-white text-slate-700 shadow-sm"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {l === "ja" ? "日本語" : "English"}
              </button>
            ))}
          </div>
          {version && (
            <div className="mt-1.5 space-y-1">
              <p className="text-center text-[10px] text-slate-300">v{version}</p>
              {updateStatus === "idle" && (
                <button
                  onClick={checkForUpdate}
                  className="w-full text-[10px] text-slate-400 hover:text-violet-500 transition-colors"
                >
                  {t(TS.updater.checkForUpdates, lang)}
                </button>
              )}
              {updateStatus === "checking" && (
                <p className="text-center text-[10px] text-slate-400 animate-pulse">
                  {t(TS.updater.checking, lang)}
                </p>
              )}
              {updateStatus === "up-to-date" && (
                <p className="text-center text-[10px] text-emerald-500">
                  {t(TS.updater.upToDate, lang)}
                </p>
              )}
              {updateStatus === "available" && (
                <button
                  onClick={downloadAndInstall}
                  className="w-full px-2 py-1 rounded-md text-[10px] font-medium bg-violet-100 text-violet-600 hover:bg-violet-200 transition-all"
                >
                  {(t(TS.updater.availableVersion, lang) as (v: string) => string)(updateVersion)}
                </button>
              )}
              {updateStatus === "downloading" && (
                <p className="text-center text-[10px] text-violet-500 animate-pulse">
                  {t(TS.updater.downloading, lang)}
                </p>
              )}
              {updateStatus === "ready" && (
                <button
                  onClick={() => relaunch()}
                  className="w-full px-2 py-1 rounded-md text-[10px] font-medium bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-all"
                >
                  {t(TS.updater.relaunch, lang)}
                </button>
              )}
              {updateStatus === "error" && (
                <p className="text-center text-[10px] text-red-400">
                  {t(TS.updater.error, lang)}
                </p>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Right content pane */}
      <main className="flex-1 overflow-y-auto p-6">
        <h2 className="text-base font-semibold text-slate-700 mb-5">
          {NAV_ITEMS.find((i) => i.key === section)?.label}
        </h2>

        {section === "general" && (
          <GeneralSection settings={settings} update={update} lang={lang} />
        )}
        {section === "transcription" && (
          <TranscriptionSection
            settings={settings}
            update={update}
            updateStt={updateStt}
            applySttPreset={applySttPreset}
            lang={lang}
          />
        )}
        {section === "post_processing" && (
          <PostProcessingSection
            settings={settings}
            updateLlm={updateLlm}
            applyLlmPreset={applyLlmPreset}
            lang={lang}
          />
        )}
        {section === "test" && <TestSection settings={settings} lang={lang} />}
      </main>
    </div>
  );
}

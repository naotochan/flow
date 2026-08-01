import { useState, useEffect, useRef } from "react";
import {
  AppSettings,
  AppAppearance,
  STT_PRESETS,
  LLM_PRESETS,
  SttConfig,
  LlmConfig,
  LocalSttServerConfig,
  PostProcessMode,
  PostProcessModeId,
  POST_PROCESS_MODE_IDS,
  checkSttServer,
  startSttServer,
  stopSttServer,
  checkDownloadedModels,
  downloadModel,
  cancelDownload,
  checkVenvExists,
  setupLocalWhisper,
  getSettings,
  getBuildNumber,
  getHistory,
  clearHistory,
  deleteHistoryEntry,
  copyHistoryText,
  pasteHistoryText,
  openSystemPreferences,
  HistoryEntry,
  ReplacementRule,
} from "../lib/ipc";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useSettings } from "../hooks/useSettings";
import { useRecordingState } from "../hooks/useRecordingState";
import { OnboardingFlow } from "./OnboardingFlow";
import { translations, t, UILanguage } from "../lib/i18n";
import { formatHotkeyLabel, hotkeyFromEvent, isEventTapHotkey } from "../lib/hotkey";
import { applyAppearance } from "../lib/theme";
import {
  AppMark,
  FieldLabel,
  FieldHint,
  SettingsRow,
  SegmentedControl,
  inputClass,
  monoInputClass,
} from "./ui";

const TS = translations.settings;

type Section =
  | "general"
  | "transcription"
  | "post_processing"
  | "dictionary"
  | "history"
  | "test";

function newRuleId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function DictionaryRuleRow({
  rule,
  lang,
  onCommit,
  onToggle,
  onDelete,
}: {
  rule: ReplacementRule;
  lang: UILanguage;
  onCommit: (id: string, from: string, to: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const D = TS.dictionary;
  const [from, setFrom] = useState(rule.from);
  const [to, setTo] = useState(rule.to);

  useEffect(() => {
    setFrom(rule.from);
    setTo(rule.to);
  }, [rule.from, rule.to]);

  const commit = () => {
    const nextFrom = from.trim();
    const nextTo = to;
    if (nextFrom === rule.from && nextTo === rule.to) return;
    if (!nextFrom) {
      setFrom(rule.from);
      return;
    }
    onCommit(rule.id, nextFrom, nextTo);
  };

  return (
    <li
      className={`bg-[var(--bg-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 space-y-2 ${
        rule.enabled ? "" : "opacity-60"
      }`}
    >
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-center">
        <input
          type="text"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          onBlur={commit}
          aria-label={t(D.from, lang)}
          className={inputClass}
        />
        <span className="hidden sm:inline text-[var(--text-faint)] text-xs text-center px-1">
          →
        </span>
        <input
          type="text"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onBlur={commit}
          aria-label={t(D.to, lang)}
          className={inputClass}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={() => onToggle(rule.id)}
            className="rounded border-[var(--border)]"
          />
          {t(D.enabled, lang)}
        </label>
        <button
          type="button"
          onClick={() => onDelete(rule.id)}
          className="px-2.5 py-1 rounded-md text-[11px] text-[var(--text-muted)] hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        >
          {t(D.delete, lang)}
        </button>
      </div>
    </li>
  );
}

function DictionarySection({
  settings,
  update,
  lang,
}: {
  settings: AppSettings;
  update: (p: Partial<AppSettings>) => void;
  lang: UILanguage;
}) {
  const D = TS.dictionary;
  const rules = settings.replacements ?? [];
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");

  const persist = (next: ReplacementRule[]) => {
    update({ replacements: next });
  };

  const onAdd = () => {
    const trimmedFrom = from.trim();
    if (!trimmedFrom) {
      setError(t(D.saveError, lang));
      return;
    }
    setError("");
    persist([
      {
        id: newRuleId(),
        from: trimmedFrom,
        to: to.trim(),
        enabled: true,
      },
      ...rules,
    ]);
    setFrom("");
    setTo("");
  };

  const onToggle = (id: string) => {
    persist(
      rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
    );
  };

  const onCommit = (id: string, nextFrom: string, nextTo: string) => {
    persist(
      rules.map((r) =>
        r.id === id ? { ...r, from: nextFrom, to: nextTo } : r,
      ),
    );
  };

  const onDelete = (id: string) => {
    persist(rules.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-4">
      <FieldHint>{t(D.hint, lang)}</FieldHint>

      <div className="bg-[var(--bg-muted)] border border-[var(--border)] rounded-xl p-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="space-y-1">
            <FieldLabel>{t(D.from, lang)}</FieldLabel>
            <input
              type="text"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onAdd();
              }}
              placeholder={t(D.fromPlaceholder, lang)}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <FieldLabel>{t(D.to, lang)}</FieldLabel>
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onAdd();
              }}
              placeholder={t(D.toPlaceholder, lang)}
              className={inputClass}
            />
          </div>
        </div>
        {error && <p className="text-[11px] text-[var(--danger)]">{error}</p>}
        <button
          type="button"
          onClick={onAdd}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--accent-soft)] text-[var(--accent-text)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        >
          {t(D.add, lang)}
        </button>
      </div>

      {rules.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg px-3 py-4">
          {t(D.empty, lang)}
        </p>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => (
            <DictionaryRuleRow
              key={rule.id}
              rule={rule}
              lang={lang}
              onCommit={onCommit}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
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
  const [needsRestart, setNeedsRestart] = useState(false);

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
      setNeedsRestart(true);
      setCapturing(false);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturing, settings.hotkey, update]);

  return (
    <div className="space-y-2">
      <FieldLabel>{t(G.hotkey, lang)}</FieldLabel>
      <button
        type="button"
        aria-label={t(G.hotkey, lang)}
        onClick={() => setCapturing(true)}
        className={`w-full px-3 py-2 rounded-lg text-sm font-medium text-left transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
          capturing
            ? "bg-[var(--accent-soft)] text-[var(--accent-text)] ring-2 ring-[var(--accent-ring)]"
            : "bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]"
        }`}
      >
        {capturing ? t(G.pressAKey, lang) : formatHotkeyLabel(settings.hotkey.key)}
      </button>
      <div className="flex items-center justify-between gap-2">
        <FieldHint>{t(G.restartRequired, lang)}</FieldHint>
        {needsRestart && (
          <button
            type="button"
            onClick={() => relaunch()}
            className="flex-shrink-0 text-[11px] font-medium text-[var(--accent-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] rounded"
          >
            {t(G.restartNow, lang)}
          </button>
        )}
      </div>
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
  const appearance = (settings.appearance || "system") as AppAppearance;

  useEffect(() => {
    import("@tauri-apps/plugin-autostart")
      .then(({ isEnabled }) => isEnabled().then(setAutoLaunch))
      .catch(() => {});
  }, []);

  const toggleAutoLaunch = async (enabled: boolean) => {
    try {
      const { enable, disable } = await import("@tauri-apps/plugin-autostart");
      if (enabled) await enable();
      else await disable();
      setAutoLaunch(enabled);
    } catch (e) {
      console.error("Autostart toggle failed:", e);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsRow title={t(G.appearance, lang)} description={t(G.appearanceHint, lang)}>
        <div className="min-w-[240px]">
          <SegmentedControl
            ariaLabel={t(G.appearance, lang)}
            value={appearance}
            onChange={(value) => {
              applyAppearance(value);
              update({ appearance: value });
            }}
            options={[
              { value: "system", label: t(G.appearanceSystem, lang) },
              { value: "light", label: t(G.appearanceLight, lang) },
              { value: "dark", label: t(G.appearanceDark, lang) },
            ]}
          />
        </div>
      </SettingsRow>

      <SettingsRow title={t(G.uiLanguage, lang)} description={t(G.uiLanguageHint, lang)}>
        <div className="min-w-[180px]">
          <SegmentedControl
            ariaLabel={t(G.uiLanguage, lang)}
            value={lang}
            onChange={(value) => update({ ui_language: value })}
            options={[
              { value: "ja", label: "日本語" },
              { value: "en", label: "English" },
            ]}
          />
        </div>
      </SettingsRow>

      <label className="flex items-start gap-3 text-sm text-[var(--text)] cursor-pointer">
        <input
          type="checkbox"
          checked={settings.auto_paste}
          onChange={(e) => update({ auto_paste: e.target.checked })}
          className="accent-[var(--accent)] w-4 h-4 mt-0.5"
        />
        <span>
          <span className="font-medium">{t(G.autoPaste, lang)}</span>
          <span className="block text-[11px] text-[var(--text-faint)] mt-0.5">
            {t(G.autoPasteHint, lang)}
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3 text-sm text-[var(--text)] cursor-pointer">
        <input
          type="checkbox"
          checked={settings.replace_selection ?? false}
          onChange={(e) => update({ replace_selection: e.target.checked })}
          className="accent-[var(--accent)] w-4 h-4 mt-0.5"
        />
        <span>
          <span className="font-medium">{t(G.replaceSelection, lang)}</span>
          <span className="block text-[11px] text-[var(--text-faint)] mt-0.5">
            {t(G.replaceSelectionHint, lang)}
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3 text-sm text-[var(--text)] cursor-pointer">
        <input
          type="checkbox"
          checked={settings.remove_fillers ?? false}
          onChange={(e) => update({ remove_fillers: e.target.checked })}
          className="accent-[var(--accent)] w-4 h-4 mt-0.5"
        />
        <span>
          <span className="font-medium">{t(G.removeFillers, lang)}</span>
          <span className="block text-[11px] text-[var(--text-faint)] mt-0.5">
            {t(G.removeFillersHint, lang)}
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3 text-sm text-[var(--text)] cursor-pointer">
        <input
          type="checkbox"
          checked={autoLaunch}
          onChange={(e) => toggleAutoLaunch(e.target.checked)}
          className="accent-[var(--accent)] w-4 h-4 mt-0.5"
        />
        <span>
          <span className="font-medium">{t(G.launchAtLogin, lang)}</span>
          <span className="block text-[11px] text-[var(--text-faint)] mt-0.5">
            {t(G.launchAtLoginHint, lang)}
          </span>
        </span>
      </label>

      <div className="space-y-2">
        <FieldLabel>{t(G.activationMode, lang)}</FieldLabel>
        <SegmentedControl
          ariaLabel={t(G.activationMode, lang)}
          value={settings.activation_mode}
          onChange={(mode) => update({ activation_mode: mode })}
          options={[
            { value: "hold", label: t(G.holdToRecord, lang) },
            { value: "double_tap", label: t(G.doubleTap, lang) },
          ]}
        />
      </div>

      {settings.activation_mode === "double_tap" && (
        <div className="space-y-2">
          <FieldLabel htmlFor="double-tap-ms">{t(G.doubleTapInterval, lang)}</FieldLabel>
          <div className="flex items-center gap-3">
            <input
              id="double-tap-ms"
              type="range"
              min={150}
              max={600}
              step={50}
              name="double_tap_ms"
              value={settings.hotkey.double_tap_ms}
              onChange={(e) =>
                update({ hotkey: { ...settings.hotkey, double_tap_ms: Number(e.target.value) } })
              }
              className="flex-1 accent-[var(--accent)]"
            />
            <span className="text-xs text-[var(--text-muted)] w-14 text-right tabular-nums">
              {settings.hotkey.double_tap_ms}ms
            </span>
          </div>
          <FieldHint>{t(G.doubleTapHint, lang)}</FieldHint>
        </div>
      )}

      <div className="space-y-2">
        <FieldLabel htmlFor="min-recording-ms">{t(G.minRecording, lang)}</FieldLabel>
        <div className="flex items-center gap-3">
          <input
            id="min-recording-ms"
            type="range"
            min={0}
            max={5000}
            step={250}
            name="min_recording_ms"
            value={settings.min_recording_ms ?? 500}
            onChange={(e) => update({ min_recording_ms: Number(e.target.value) })}
            className="flex-1 accent-[var(--accent)]"
          />
          <span className="text-xs text-[var(--text-muted)] w-14 text-right tabular-nums">
            {(settings.min_recording_ms ?? 500) === 0
              ? t(G.minRecordingOff, lang)
              : `${((settings.min_recording_ms ?? 500) / 1000).toFixed(2)}s`}
          </span>
        </div>
        <FieldHint>{t(G.minRecordingHint, lang)}</FieldHint>
      </div>

      <HotkeyCapture settings={settings} update={update} lang={lang} />

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
          className="flex items-center gap-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] rounded"
        >
          <span
            className="text-[10px] transition-transform duration-200"
            style={{ transform: showAdvanced ? "rotate(90deg)" : "rotate(0deg)" }}
            aria-hidden="true"
          >
            ▶
          </span>
          {t(G.advanced, lang)}
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-4 pl-1">
            <div className="space-y-2">
              <FieldLabel>{t(G.recognitionLanguage, lang)}</FieldLabel>
              <SegmentedControl
                ariaLabel={t(G.recognitionLanguage, lang)}
                value={settings.language.mode}
                onChange={(mode) => update({ language: { ...settings.language, mode } })}
                options={[
                  { value: "auto", label: t(G.langAuto, lang) },
                  { value: "japanese", label: t(G.langJapanese, lang) },
                  { value: "english", label: t(G.langEnglish, lang) },
                ]}
              />
              <FieldHint>{t(G.recognitionLanguageHint, lang)}</FieldHint>
            </div>
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
    python_path: "",
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
          checkDownloadedModels().then(setDownloadedModels).catch(() => {});
        } else if (status === "error" || status === "cancelled") {
          setDownloading(false);
          setDownloadProgress(0);
        }
      }
    );
    return () => {
      unlisten.then((f) => f());
    };
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
      if (!running) setServerError("Server started but health check failed. Check logs.");
    } catch (e) {
      setServerRunning(false);
      setServerError(String(e));
    } finally {
      setServerLoading(false);
    }
  };

  const handleStopServer = async () => {
    setServerLoading(true);
    setServerError("");
    try {
      await stopSttServer();
      setServerRunning(false);
      pausePollUntilRef.current = Date.now() + 10000;
    } catch (e) {
      setServerError((t(TR.stopFailed, lang) as (err: string) => string)(String(e)));
    } finally {
      setServerLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadProgress(0);
    setDownloadMessage("Starting download…");
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
      setServerError(String(e));
    }
  };

  useEffect(() => {
    if (!settingUp) return;
    const unlisten = listen<{ step: string; message: string }>("setup-progress", (event) => {
      const { step, message } = event.payload;
      setSetupMessage(message);
      if (step === "done") {
        setSettingUp(false);
        setVenvReady(true);
        checkDownloadedModels().then(setDownloadedModels).catch(() => {});
      } else if (step === "error") {
        setSettingUp(false);
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [settingUp]);

  const handleSetupLocalWhisper = async () => {
    setSettingUp(true);
    setSetupMessage(lang === "ja" ? "セットアップ中…" : "Setting up…");
    try {
      await setupLocalWhisper();
    } catch (e) {
      setSettingUp(false);
      setSetupMessage(`Error: ${e}`);
    }
  };

  const statusLabel =
    venvReady === false
      ? t(TR.needsSetup, lang)
      : serverRunning === null
        ? t(TR.checking, lang)
        : serverRunning
          ? t(TR.running, lang)
          : modelIsDownloaded
            ? t(TR.ready, lang)
            : t(TR.stopped, lang);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <FieldLabel>{t(TR.provider, lang)}</FieldLabel>
        <SegmentedControl
          ariaLabel={t(TR.provider, lang)}
          value={settings.stt.preset as "openai" | "lm_studio" | "local_whisper"}
          onChange={(key) => applySttPreset(key)}
          options={[
            { value: "openai", label: "OpenAI" },
            { value: "lm_studio", label: "LM Studio" },
            { value: "local_whisper", label: lang === "ja" ? "ローカルモデル" : "Local Model" },
          ]}
        />
      </div>

      {!isLocalWhisper && (
        <>
          <div className="space-y-1">
            <FieldLabel htmlFor="stt-base-url">{t(TR.baseUrl, lang)}</FieldLabel>
            <input
              id="stt-base-url"
              name="stt_base_url"
              autoComplete="off"
              spellCheck={false}
              className={monoInputClass}
              value={settings.stt.base_url}
              onChange={(e) => updateStt({ base_url: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <FieldLabel htmlFor="stt-model">{t(TR.model, lang)}</FieldLabel>
            <input
              id="stt-model"
              name="stt_model"
              autoComplete="off"
              spellCheck={false}
              className={monoInputClass}
              value={settings.stt.model}
              onChange={(e) => updateStt({ model: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <FieldLabel htmlFor="stt-api-key">{t(TR.apiKey, lang)}</FieldLabel>
            <input
              id="stt-api-key"
              name="stt_api_key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
              value={settings.stt.api_key}
              onChange={(e) => updateStt({ api_key: e.target.value })}
              placeholder={isLocalStt ? (lang === "ja" ? "（不要）" : "(not required)") : "sk-…"}
            />
          </div>
        </>
      )}

      {isLocalWhisper && venvReady === false && (
        <div className="space-y-3 rounded-xl p-4 border border-[var(--warning)]/30 bg-[var(--warning-soft)]">
          <p className="text-sm font-medium text-[var(--warning)]">{t(TR.needsSetup, lang)}</p>
          <p className="text-xs text-[var(--text-muted)]">
            {lang === "ja"
              ? "お使いのマシンにWhisperモデルをインストールします。ネット不要で音声認識できるようになります。"
              : "Installs a Whisper model on your machine for offline speech recognition."}
          </p>
          {settingUp ? (
            <div className="space-y-1">
              <div className="w-full bg-[var(--border)] rounded-full h-1.5 overflow-hidden">
                <div className="bg-[var(--warning)] h-full rounded-full w-full animate-pulse" />
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">{setupMessage}</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSetupLocalWhisper}
              className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-[var(--accent-soft)] text-[var(--accent-text)] hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              {lang === "ja" ? "ローカルモデルをセットアップ" : "Setup Local Model"}
            </button>
          )}
        </div>
      )}

      {isLocalWhisper && venvReady !== false && (
        <div className="space-y-3 rounded-xl p-4 border border-[var(--border)] bg-[var(--bg-muted)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-muted)]">{t(TR.localServer, lang)}</span>
            <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <span
                className={`w-2 h-2 rounded-full ${
                  serverRunning === null
                    ? "bg-[var(--text-faint)]"
                    : serverRunning
                      ? "bg-[var(--success)]"
                      : "bg-[var(--danger)]"
                }`}
                aria-hidden="true"
              />
              {statusLabel}
            </span>
          </div>

          <div className="space-y-1">
            <FieldLabel htmlFor="local-model">{t(TR.model, lang)}</FieldLabel>
            <select
              id="local-model"
              name="local_model"
              className={`${inputClass} appearance-none pr-8 ${
                serverRunning || serverLoading || downloading ? "opacity-50 cursor-not-allowed" : ""
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
                  {m.label} ({m.size})
                  {downloadedModels.includes(m.value) ? " ✓" : ""}
                </option>
              ))}
            </select>
          </div>

          {!serverRunning && !modelIsDownloaded && (
            <div className="space-y-2">
              {downloading ? (
                <>
                  <div className="w-full bg-[var(--border)] rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-[var(--accent)] h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[var(--text-faint)]">{downloadMessage}</span>
                    <button
                      type="button"
                      onClick={handleCancelDownload}
                      className="text-[11px] text-[var(--danger)] hover:underline"
                    >
                      {t(TR.cancel, lang)}
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="w-full px-3 py-1.5 rounded-lg text-xs bg-[var(--accent-soft)] text-[var(--accent-text)] hover:opacity-90 transition-opacity"
                >
                  {t(TR.downloadModel, lang)}
                </button>
              )}
            </div>
          )}
          {!serverRunning && modelIsDownloaded && (
            <p className="text-[11px] text-[var(--success)]">{t(TR.modelDownloaded, lang)}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleStartServer}
              disabled={serverLoading || serverRunning === true || !modelIsDownloaded || downloading}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-[var(--success-soft)] text-[var(--success)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {serverLoading && !serverRunning ? t(TR.starting, lang) : t(TR.start, lang)}
            </button>
            <button
              type="button"
              onClick={handleStopServer}
              disabled={serverLoading || serverRunning === false}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-[var(--danger-soft)] text-[var(--danger)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {serverLoading && serverRunning ? t(TR.stopping, lang) : t(TR.stop, lang)}
            </button>
          </div>

          {serverError && (
            <div className="bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-lg p-2">
              <p className="text-[11px] text-[var(--danger)] whitespace-pre-wrap break-all">{serverError}</p>
            </div>
          )}

          <details>
            <summary className="text-[11px] text-[var(--text-faint)] cursor-pointer hover:text-[var(--text-muted)] transition-colors select-none">
              Advanced
            </summary>
            <div className="mt-2 space-y-1">
              <FieldLabel htmlFor="local-port">{t(TR.port, lang)}</FieldLabel>
              <input
                id="local-port"
                name="local_port"
                type="number"
                autoComplete="off"
                className={`${monoInputClass} ${serverRunning ? "opacity-50 cursor-not-allowed" : ""}`}
                value={localServer.port}
                onChange={(e) => updateLocalServer({ port: parseInt(e.target.value) || 8080 })}
                disabled={!!serverRunning}
              />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function ModeHotkeyRow({
  label,
  value,
  recordHotkey,
  lang,
  capturing,
  onCapturingChange,
  onChange,
}: {
  label: string;
  value: string;
  recordHotkey: string;
  lang: UILanguage;
  capturing: boolean;
  onCapturingChange: (capturing: boolean) => void;
  onChange: (key: string | null) => void;
}) {
  const PP = TS.postProcessing;
  const [warn, setWarn] = useState("");

  useEffect(() => {
    if (!capturing) {
      setWarn("");
      return;
    }
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        onCapturingChange(false);
        setWarn("");
        return;
      }
      const key = hotkeyFromEvent(e);
      if (!key) return;
      if (isEventTapHotkey(key)) {
        setWarn(t(PP.modeHotkeyChordOnly, lang));
        return;
      }
      if (key === recordHotkey) {
        setWarn(t(PP.modeHotkeyChordOnly, lang));
        return;
      }
      onChange(key);
      setWarn("");
      onCapturingChange(false);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturing, lang, onChange, onCapturingChange, recordHotkey]);

  return (
    <li className="space-y-0.5">
      <div className="flex items-center gap-2">
        <span className="w-16 flex-shrink-0 text-xs text-[var(--text-muted)]">
          {label}
        </span>
        <button
          type="button"
          aria-label={`${label} hotkey`}
          onClick={() => {
            setWarn("");
            onCapturingChange(true);
          }}
          className={`flex-1 min-w-0 px-2.5 py-1.5 rounded-md text-xs font-medium text-left transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
            capturing
              ? "bg-[var(--accent-soft)] text-[var(--accent-text)] ring-2 ring-[var(--accent-ring)]"
              : "bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]"
          }`}
        >
          {capturing
            ? t(TS.general.pressAKey, lang)
            : value
              ? formatHotkeyLabel(value)
              : t(PP.modeHotkeyUnset, lang)}
        </button>
        {value && !capturing && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="flex-shrink-0 text-[11px] text-[var(--text-muted)] hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] rounded"
          >
            {t(PP.modeHotkeyClear, lang)}
          </button>
        )}
      </div>
      {warn && (
        <p className="pl-[4.5rem] text-[10px] text-[var(--danger)]" role="alert">
          {warn}
        </p>
      )}
    </li>
  );
}

function PostProcessingSection({
  settings,
  update,
  updateLlm,
  applyLlmPreset,
  saving,
  lang,
}: {
  settings: AppSettings;
  update: (p: Partial<AppSettings>) => void;
  updateLlm: (p: Partial<LlmConfig>) => void;
  applyLlmPreset: (key: keyof typeof LLM_PRESETS) => void;
  saving: boolean;
  lang: UILanguage;
}) {
  const PP = TS.postProcessing;
  const isLocalLlm =
    settings.llm.preset === "ollama" ||
    settings.llm.preset === "lm_studio" ||
    /localhost|127\.0\.0\.1/.test(settings.llm.base_url);
  const modeId = settings.active_mode_id || "format";
  const modes: PostProcessMode[] = settings.modes?.length
    ? settings.modes
    : POST_PROCESS_MODE_IDS.map((id) => ({
        id,
        name: "",
        use_llm: id !== "raw",
        system_prompt: "",
        builtin: true,
      }));
  const activeMode = modes.find((m) => m.id === modeId) ?? modes[0];
  const useLlm = activeMode?.use_llm ?? modeId !== "raw";

  // Builtins are localized; custom modes carry the name the user typed. The
  // `??` guards a builtin id with no translation, which would otherwise hand
  // `t()` an undefined and blank the whole panel.
  const labelOf = (mode: PostProcessMode) =>
    mode.builtin
      ? t(PP.modes[mode.id as PostProcessModeId] ?? PP.newModeName, lang)
      : mode.name.trim() || t(PP.newModeName, lang);

  const setMode = (id: string) => {
    const target = modes.find((m) => m.id === id);
    update({
      active_mode_id: id,
      modes,
      llm: { ...settings.llm, enabled: target?.use_llm ?? id !== "raw" },
    });
  };

  const updateActiveMode = (patch: Partial<PostProcessMode>) => {
    const next: PostProcessMode[] = modes.map((m) =>
      m.id === modeId ? { ...m, ...patch } : m,
    );
    update({ modes: next });
  };

  const modeHotkeys = settings.mode_hotkeys ?? {};
  const [capturingModeId, setCapturingModeId] = useState<string | null>(null);

  // Same local-draft-then-commit-on-blur shape as DictionaryRuleRow. Saving on
  // every keystroke round-trips through disk and a `settings-changed` reload,
  // which drops characters and tears down in-flight IME composition.
  const [draftName, setDraftName] = useState(activeMode?.name ?? "");
  useEffect(() => {
    setDraftName(activeMode?.name ?? "");
  }, [modeId, activeMode?.name]);

  const commitName = () => {
    const next = draftName.trim();
    if (next === (activeMode?.name ?? "")) return;
    updateActiveMode({ name: next });
  };

  const setModeHotkey = (id: string, key: string | null) => {
    const next = { ...modeHotkeys };
    if (!key) {
      delete next[id];
    } else {
      next[id] = key;
    }
    update({ mode_hotkeys: next });
  };

  const addCustomMode = () => {
    // The `custom-` prefix keeps it clear of every builtin id.
    const id = `custom-${newRuleId()}`;
    const created: PostProcessMode = {
      id,
      name: t(PP.newModeName, lang),
      use_llm: true,
      // Seeded from Format so a new mode works the moment it is created —
      // an empty system prompt would send the LLM the dictation with no
      // instructions at all. The user edits it from here.
      system_prompt: modes.find((m) => m.id === "format")?.system_prompt ?? "",
      builtin: false,
    };
    update({
      active_mode_id: id,
      modes: [...modes, created],
      llm: { ...settings.llm, enabled: true },
    });
  };

  const deleteActiveMode = () => {
    if (activeMode?.builtin) return;
    const remaining = modes.filter((m) => m.id !== modeId);
    const nextHotkeys = { ...modeHotkeys };
    delete nextHotkeys[modeId];
    const fallback = remaining.find((m) => m.id === "format") ?? remaining[0];
    update({
      modes: remaining,
      active_mode_id: fallback?.id ?? "format",
      mode_hotkeys: nextHotkeys,
      llm: { ...settings.llm, enabled: fallback?.use_llm ?? true },
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <FieldLabel>{t(PP.mode, lang)}</FieldLabel>
        <FieldHint>{t(PP.modeHint, lang)}</FieldHint>
        <div
          className="grid grid-cols-3 gap-2"
          role="radiogroup"
          aria-label={t(PP.mode, lang)}
        >
          {modes.map((mode) => {
            const selected = modeId === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMode(mode.id)}
                title={labelOf(mode)}
                className={`px-2.5 py-2 rounded-lg text-sm truncate transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                  selected
                    ? "bg-[var(--accent-soft)] text-[var(--accent-text)] font-medium"
                    : "bg-[var(--bg-muted)] text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {labelOf(mode)}
              </button>
            );
          })}
        </div>
        {/* Outside the radiogroup: a non-radio child would corrupt the
            "n of m" count screen readers announce for the group. */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={addCustomMode}
            disabled={saving}
            className="px-2.5 py-2 rounded-lg text-sm whitespace-nowrap border border-dashed border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-faint)] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            + {t(PP.addMode, lang)}
          </button>
        </div>
        <p className="text-[11px] text-[var(--text-faint)] leading-relaxed">
          {activeMode?.builtin
            ? t(PP.modeDesc[modeId as PostProcessModeId] ?? PP.customModeDesc, lang)
            : t(PP.customModeDesc, lang)}
        </p>

        {activeMode && !activeMode.builtin && (
          <div className="flex items-end gap-2 pt-1">
            <div className="flex-1 space-y-1.5">
              <FieldLabel htmlFor="custom-mode-name">
                {t(PP.customModeName, lang)}
              </FieldLabel>
              <input
                id="custom-mode-name"
                type="text"
                className={inputClass}
                value={draftName}
                maxLength={40}
                placeholder={t(PP.customModeNamePlaceholder, lang)}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitName}
              />
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (window.confirm(t(PP.deleteModeConfirm, lang)(labelOf(activeMode)))) {
                  deleteActiveMode();
                }
              }}
              className="px-3 py-2 rounded-lg text-sm text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              {t(PP.deleteMode, lang)}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <FieldLabel>{t(PP.modeHotkeys, lang)}</FieldLabel>
        <FieldHint>{t(PP.modeHotkeysHint, lang)}</FieldHint>
        <ul className="space-y-1.5">
          {modes.map((mode) => (
            <ModeHotkeyRow
              key={mode.id}
              label={labelOf(mode)}
              value={modeHotkeys[mode.id] || ""}
              recordHotkey={settings.hotkey.key}
              lang={lang}
              capturing={capturingModeId === mode.id}
              onCapturingChange={(next) => setCapturingModeId(next ? mode.id : null)}
              onChange={(key) => setModeHotkey(mode.id, key)}
            />
          ))}
        </ul>
      </div>

      {useLlm && (
        <>
          <details className="group">
            <summary className="text-[11px] text-[var(--text-faint)] cursor-pointer hover:text-[var(--text-muted)] transition-colors select-none">
              {t(PP.prompt, lang)}
            </summary>
            <div className="mt-2 space-y-1.5">
              <FieldHint>{t(PP.promptHint, lang)}</FieldHint>
              <textarea
                className={`${monoInputClass} min-h-[140px] resize-y leading-relaxed`}
                value={activeMode?.system_prompt ?? ""}
                onChange={(e) => updateActiveMode({ system_prompt: e.target.value })}
                spellCheck={false}
              />
            </div>
          </details>

          <div className="space-y-2">
            <FieldLabel>{t(PP.provider, lang)}</FieldLabel>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t(PP.provider, lang)}>
              {(Object.keys(LLM_PRESETS) as (keyof typeof LLM_PRESETS)[]).map((key) => {
                const selected = settings.llm.preset === key;
                const label =
                  key === "claude"
                    ? "Claude"
                    : key === "openai"
                      ? "OpenAI"
                      : key === "openrouter"
                        ? "OpenRouter"
                        : key === "ollama"
                          ? "Ollama"
                          : "LM Studio";
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => applyLlmPreset(key)}
                    className={`px-3 py-2 rounded-lg text-sm transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                      selected
                        ? "bg-[var(--accent-soft)] text-[var(--accent-text)] font-medium"
                        : "bg-[var(--bg-muted)] text-[var(--text-muted)] hover:text-[var(--text)]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <FieldLabel htmlFor="llm-base-url">{t(PP.baseUrl, lang)}</FieldLabel>
            <input
              id="llm-base-url"
              name="llm_base_url"
              autoComplete="off"
              spellCheck={false}
              className={monoInputClass}
              value={settings.llm.base_url}
              onChange={(e) => updateLlm({ base_url: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <FieldLabel htmlFor="llm-model">{t(PP.model, lang)}</FieldLabel>
            <input
              id="llm-model"
              name="llm_model"
              autoComplete="off"
              spellCheck={false}
              className={monoInputClass}
              value={settings.llm.model}
              onChange={(e) => updateLlm({ model: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <FieldLabel htmlFor="llm-api-key">
              {t(PP.apiKey, lang)}{" "}
              {isLocalLlm && (
                <span className="text-[var(--text-faint)] font-normal">
                  {t(PP.optionalForLocal, lang)}
                </span>
              )}
            </FieldLabel>
            <input
              id="llm-api-key"
              name="llm_api_key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
              value={settings.llm.api_key}
              onChange={(e) => updateLlm({ api_key: e.target.value })}
              placeholder={isLocalLlm ? (lang === "ja" ? "（不要）" : "(not required)") : "sk-…"}
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

function formatHistoryTime(ms: number, lang: UILanguage): string {
  try {
    return new Date(ms).toLocaleString(lang === "ja" ? "ja-JP" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function HistorySection({
  settings,
  update,
  lang,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  lang: UILanguage;
}) {
  const H = TS.history;
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const enabled = settings.history_enabled ?? true;
  const retention = settings.history_retention_days ?? 0;

  const reload = () => {
    if (!enabled) {
      setEntries([]);
      return;
    }
    getHistory()
      .then(setEntries)
      .catch(() => setEntries([]));
  };

  useEffect(() => {
    reload();
    const unlisteners: (() => void)[] = [];
    listen("history-updated", () => reload()).then((u) => unlisteners.push(u));
    listen("transcription-result", () => reload()).then((u) => unlisteners.push(u));
    return () => unlisteners.forEach((fn) => fn());
  }, [enabled]);

  const onCopy = async (entry: HistoryEntry) => {
    setBusyId(entry.id);
    try {
      await copyHistoryText(entry.text);
      setFlashId(entry.id);
      setTimeout(() => setFlashId(null), 1500);
    } catch (e) {
      console.error(e);
    } finally {
      setBusyId(null);
    }
  };

  const onPaste = async (entry: HistoryEntry) => {
    setBusyId(entry.id);
    try {
      await pasteHistoryText(entry.text);
    } catch (e) {
      console.error(e);
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteHistoryEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const onClear = async () => {
    if (!window.confirm(t(H.clearConfirm, lang))) return;
    try {
      await clearHistory();
      setEntries([]);
    } catch (e) {
      console.error(e);
    }
  };

  const onToggleEnabled = (checked: boolean) => {
    if (
      !checked &&
      entries.length > 0 &&
      !window.confirm(t(H.disableConfirm, lang))
    ) {
      return;
    }
    update({ history_enabled: checked });
    if (!checked) setEntries([]);
  };

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 text-sm text-[var(--text)] cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggleEnabled(e.target.checked)}
          className="accent-[var(--accent)] w-4 h-4 mt-0.5"
        />
        <span>
          <span className="font-medium">{t(H.saveHistory, lang)}</span>
          <span className="block text-[11px] text-[var(--text-faint)] mt-0.5">
            {t(H.saveHistoryHint, lang)}
          </span>
        </span>
      </label>

      {enabled && (
        <SettingsRow
          title={t(H.retention, lang)}
          description={t(H.retentionHint, lang)}
        >
          <SegmentedControl
            ariaLabel={t(H.retention, lang)}
            value={String(retention)}
            onChange={(value) =>
              update({ history_retention_days: Number(value) })
            }
            options={[
              { value: "0", label: t(H.retentionForever, lang) },
              { value: "1", label: t(H.retention1d, lang) },
              { value: "7", label: t(H.retention7d, lang) },
              { value: "30", label: t(H.retention30d, lang) },
            ]}
          />
        </SettingsRow>
      )}

      <div className="flex items-start justify-between gap-3">
        <FieldHint>{t(H.pasteHint, lang)}</FieldHint>
        {enabled && entries.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="flex-shrink-0 text-[11px] text-[var(--danger)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] rounded"
          >
            {t(H.clearAll, lang)}
          </button>
        )}
      </div>

      {!enabled ? (
        <p className="text-sm text-[var(--text-muted)] bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg px-3 py-4">
          {t(H.disabled, lang)}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg px-3 py-4">
          {t(H.empty, lang)}
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="bg-[var(--bg-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 space-y-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px] text-[var(--text-faint)] tabular-nums">
                  {formatHistoryTime(entry.created_at, lang)}
                </p>
                {flashId === entry.id && (
                  <span className="text-[10px] text-[var(--success)]">{t(H.copied, lang)}</span>
                )}
              </div>
              <p className="text-sm text-[var(--text)] break-words whitespace-pre-wrap leading-relaxed">
                {entry.text}
              </p>
              {entry.raw_text && entry.raw_text !== entry.text && (
                <p className="text-[11px] text-[var(--text-faint)] break-words">
                  <span className="font-medium">{t(H.rawLabel, lang)}: </span>
                  {entry.raw_text}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <button
                  type="button"
                  disabled={busyId === entry.id}
                  onClick={() => onCopy(entry)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:opacity-50"
                >
                  {t(H.copy, lang)}
                </button>
                <button
                  type="button"
                  disabled={busyId === entry.id}
                  onClick={() => onPaste(entry)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-[var(--accent-soft)] text-[var(--accent-text)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:opacity-50"
                >
                  {t(H.paste, lang)}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(entry.id)}
                  className="px-2.5 py-1 rounded-md text-[11px] text-[var(--text-muted)] hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                >
                  {t(H.delete, lang)}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TestSection({ settings, lang }: { settings: AppSettings; lang: UILanguage }) {
  const Te = TS.test;
  const { state, lastRawTranscription, lastTranscription, error } = useRecordingState();
  // Sample follows UI language so English UI shows an English prompt.
  // Recognition language (advanced) still controls the STT API hint separately.
  const sampleText =
    lang === "ja" ? SAMPLE_SENTENCES.japanese : SAMPLE_SENTENCES.english;
  const hotkeyLabel = formatHotkeyLabel(settings.hotkey.key);
  const modeLabel =
    settings.activation_mode === "hold"
      ? lang === "ja"
        ? "長押し"
        : "hold"
      : lang === "ja"
        ? "ダブルタップ"
        : "double tap";

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider">
          {t(Te.tryReading, lang)}
        </p>
        <p className="text-sm text-[var(--text)] bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg px-3 py-2 leading-relaxed break-words">
          {sampleText}
        </p>
      </div>

      <div className="space-y-3">
        {state === "recording" && (
          <div className="flex items-center gap-2 text-sm text-[var(--danger)] font-medium">
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
            </span>
            {t(Te.recording, lang)}
          </div>
        )}
        {state === "processing" && (
          <div className="flex items-center gap-2 text-sm text-[var(--warning)] font-medium">
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {t(Te.processing, lang)}
          </div>
        )}
        {state === "idle" && (
          <p className="text-sm text-[var(--text-muted)]">
            {Te.pressToStart[lang](hotkeyLabel, modeLabel)}
          </p>
        )}
        {error && <p className="text-sm text-[var(--danger)] break-words">{error}</p>}
        {lastRawTranscription && (
          <div className="bg-[var(--bg-muted)] border border-[var(--border)] rounded-xl p-3 space-y-2">
            <div>
              <p className="text-[10px] text-[var(--text-faint)] mb-0.5">Raw STT</p>
              <p className="text-sm text-[var(--text)] break-words">{lastRawTranscription}</p>
            </div>
            {settings.llm.enabled &&
              lastTranscription &&
              lastTranscription !== lastRawTranscription && (
                <div className="border-t border-[var(--border)] pt-2">
                  <p className="text-[10px] text-[var(--accent-text)] mb-0.5">After LLM</p>
                  <p className="text-sm text-[var(--text)] break-words">{lastTranscription}</p>
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}

type UpdateStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "ready"
  | "error";

export function SettingsPanel() {
  const { settings, loading, saving, save } = useSettings();
  const [section, setSection] = useState<Section>("general");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [version, setVersion] = useState("");
  const [buildNumber, setBuildNumber] = useState("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateVersion, setUpdateVersion] = useState("");
  const updateRef = useRef<Awaited<ReturnType<typeof check>> | null>(null);
  const [hotkeyPermissionOk, setHotkeyPermissionOk] = useState(true);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
    getBuildNumber().then(setBuildNumber).catch(() => {});
    checkForUpdate();
  }, []);

  // Backend polls Accessibility/Input Monitoring every ~20s (see
  // monitor_hotkey_permissions in lib.rs) since a hotkey can silently stop
  // firing if permission is revoked or was never granted — this surfaces
  // that instead of leaving the user wondering why the hotkey "isn't working".
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ accessibility: boolean; input_monitoring: boolean; ok: boolean }>(
      "hotkey-permission-status",
      (event) => setHotkeyPermissionOk(event.payload.ok)
    ).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<string>("open-section", (event) => {
      const key = event.payload;
      if (
        key === "general" ||
        key === "transcription" ||
        key === "post_processing" ||
        key === "dictionary" ||
        key === "history" ||
        key === "test"
      ) {
        setSection(key);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!settings) return;
    applyAppearance((settings.appearance as AppAppearance) || "system");
  }, [settings?.appearance]);

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
      <div className="flex items-center justify-center h-screen bg-[var(--bg)] text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }

  if (!settings.onboarding_completed || showOnboarding) {
    return (
      <OnboardingFlow
        settings={settings}
        save={save}
        onComplete={async () => {
          const latest = await getSettings();
          save({ ...latest, onboarding_completed: true, onboarding_step: 0 });
          setShowOnboarding(false);
        }}
      />
    );
  }

  const lang: UILanguage = settings.ui_language || "ja";

  const NAV_ITEMS: { key: Section; label: string }[] = [
    { key: "general", label: t(TS.nav.general, lang) },
    { key: "transcription", label: t(TS.nav.transcription, lang) },
    { key: "post_processing", label: t(TS.nav.postProcessing, lang) },
    { key: "dictionary", label: t(TS.nav.dictionary, lang) },
    { key: "history", label: t(TS.nav.history, lang) },
    { key: "test", label: t(TS.nav.test, lang) },
  ];

  const update = (patch: Partial<AppSettings>) => {
    save({ ...settings, ...patch });
  };

  const updateStt = (patch: Partial<SttConfig>) => {
    const merged = { ...settings.stt, ...patch };
    if (patch.api_key !== undefined && !patch.preset_api_keys) {
      merged.preset_api_keys = {
        ...(settings.stt.preset_api_keys ?? {}),
        [merged.preset || "openai"]: patch.api_key,
      };
    }
    update({ stt: merged });
  };

  const updateLlm = (patch: Partial<LlmConfig>) => {
    const merged = { ...settings.llm, ...patch };
    if (patch.api_key !== undefined && !patch.preset_api_keys) {
      merged.preset_api_keys = {
        ...(settings.llm.preset_api_keys ?? {}),
        [merged.preset || "claude"]: patch.api_key,
      };
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
    <div className="flex h-screen bg-[var(--bg)] text-[var(--text)]">
      <aside className="w-52 flex-shrink-0 border-r border-[var(--border)] flex flex-col bg-[var(--bg-muted)]">
        <div className="px-3 pt-4 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <AppMark size={32} />
            <div className="min-w-0">
              <h1 className="text-[13px] font-semibold text-[var(--text)] leading-tight truncate">
                {t(TS.appTitle, lang)}
              </h1>
              {version && (
                <p className="text-[10px] text-[var(--text-faint)] mt-0.5 tabular-nums truncate">
                  {version} · build {buildNumber || "—"}
                </p>
              )}
            </div>
          </div>
        </div>
        <nav className="flex-1 px-2 py-1 space-y-0.5" aria-label="Settings">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-current={section === item.key ? "page" : undefined}
              onClick={() => setSection(item.key)}
              className={`w-full flex items-center px-3 py-2 rounded-lg text-sm transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                section === item.key
                  ? "bg-[var(--accent-soft)] text-[var(--accent-text)] font-medium shadow-sm"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]/60 hover:text-[var(--text)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-[var(--border)] space-y-2">
          {saving && (
            <div className="text-[10px] text-[var(--text-faint)]">{t(TS.saving, lang)}</div>
          )}
          <button
            type="button"
            onClick={() => setShowOnboarding(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] text-[var(--text-muted)] hover:text-[var(--accent-text)] border border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/40 transition-[background-color,color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            {t(TS.setupGuide, lang)}
          </button>
          {version && (
            <div className="mt-1.5 space-y-1">
              {updateStatus === "idle" && (
                <button
                  type="button"
                  onClick={checkForUpdate}
                  className="w-full text-[10px] text-[var(--text-faint)] hover:text-[var(--accent-text)] transition-colors"
                >
                  {t(TS.updater.checkForUpdates, lang)}
                </button>
              )}
              {updateStatus === "checking" && (
                <p className="text-center text-[10px] text-[var(--text-muted)] animate-pulse">
                  {t(TS.updater.checking, lang)}
                </p>
              )}
              {updateStatus === "up-to-date" && (
                <p className="text-center text-[10px] text-[var(--success)]">
                  {t(TS.updater.upToDate, lang)}
                </p>
              )}
              {updateStatus === "available" && (
                <button
                  type="button"
                  onClick={downloadAndInstall}
                  className="w-full px-2 py-1 rounded-md text-[10px] font-medium bg-[var(--accent-soft)] text-[var(--accent-text)] hover:opacity-90 transition-opacity"
                >
                  {(t(TS.updater.availableVersion, lang) as (v: string) => string)(updateVersion)}
                </button>
              )}
              {updateStatus === "downloading" && (
                <p className="text-center text-[10px] text-[var(--accent-text)] animate-pulse">
                  {t(TS.updater.downloading, lang)}
                </p>
              )}
              {updateStatus === "ready" && (
                <button
                  type="button"
                  onClick={() => relaunch()}
                  className="w-full px-2 py-1 rounded-md text-[10px] font-medium bg-[var(--success-soft)] text-[var(--success)] hover:opacity-90 transition-opacity"
                >
                  {t(TS.updater.relaunch, lang)}
                </button>
              )}
              {updateStatus === "error" && (
                <p className="text-center text-[10px] text-[var(--danger)]">{t(TS.updater.error, lang)}</p>
              )}
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6 bg-[var(--bg)]">
        {!hotkeyPermissionOk && (
          <div className="mb-5 rounded-xl p-4 border border-[var(--warning)]/30 bg-[var(--warning-soft)] flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[var(--warning)]">
                {t(TS.permissionBanner.title, lang)}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {t(TS.permissionBanner.description, lang)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openSystemPreferences("accessibility")}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--warning)]/15 text-[var(--warning)] hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              {t(TS.permissionBanner.openSettings, lang)}
            </button>
          </div>
        )}
        <h2 className="text-base font-semibold text-[var(--text)] mb-5 text-pretty">
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
            update={update}
            updateLlm={updateLlm}
            applyLlmPreset={applyLlmPreset}
            saving={saving}
            lang={lang}
          />
        )}
        {section === "dictionary" && (
          <DictionarySection settings={settings} update={update} lang={lang} />
        )}
        {section === "history" && (
          <HistorySection settings={settings} update={update} lang={lang} />
        )}
        {section === "test" && <TestSection settings={settings} lang={lang} />}
      </main>
    </div>
  );
}

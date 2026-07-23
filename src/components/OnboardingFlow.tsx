import { useState, useEffect, useRef, useCallback } from "react";
import {
  AppSettings,
  AppAppearance,
  STT_PRESETS,
  SttConfig,
  getSettings,
  getBuildNumber,
  saveOnboardingStep,
  setupLocalWhisper,
  downloadModel,
  checkDownloadedModels,
  checkVenvExists,
  openSystemPreferences,
  checkPermissions,
  initializeHotkeys,
  setHotkeyTestMode,
  checkSttServer,
  startSttServer,
  PermissionStatus,
} from "../lib/ipc";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { useRecordingState } from "../hooks/useRecordingState";
import { translations, t, UILanguage } from "../lib/i18n";
import { formatHotkeyLabel, hotkeyFromEvent } from "../lib/hotkey";
import { applyAppearance } from "../lib/theme";
import { AppMark, FieldLabel, SegmentedControl, inputClass, monoInputClass } from "./ui";

const T = translations.onboarding;
const G = translations.settings.general;

const SAMPLE_TEXT: Record<string, string> = {
  japanese:
    "明日の午後3時から会議があります。資料の準備をお願いします。場所は第2会議室で、参加者は5名の予定です。",
  english:
    "We have a meeting scheduled for tomorrow at 3 PM. Please prepare the documents in advance. It will be held in Conference Room B with five attendees.",
};

/** Start local STT server if needed; waits until /health is OK. Returns error message or null. */
async function ensureLocalSttServer(settings: AppSettings): Promise<string | null> {
  if (settings.stt.preset !== "local_whisper") return null;
  try {
    if (await checkSttServer()) return null;
    await startSttServer();
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await checkSttServer()) return null;
    }
    return "health-timeout";
  } catch (e) {
    return String(e);
  }
}

function StepWelcome({ lang }: { lang: UILanguage }) {
  const W = T.welcome;
  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="inline-flex items-center justify-center mb-5">
          <AppMark size={72} />
        </div>
        <h3 className="text-xl font-semibold text-[var(--text)] mb-2 text-pretty tracking-tight">
          {t(W.title, lang)}
        </h3>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">
          {t(W.description, lang)}
        </p>
      </div>

      <div className="space-y-2.5 mt-6">
        {W.features.map((feature, i) => (
          <div
            key={i}
            className="flex items-start gap-3 bg-[var(--bg-muted)] rounded-lg px-3.5 py-2.5 border border-[var(--border)]"
          >
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--accent-soft)] flex items-center justify-center mt-0.5">
              <svg className="w-3 h-3 text-[var(--accent-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-[var(--text)]">{t(feature, lang)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepPermissions({
  lang,
  onAllGrantedChange,
}: {
  lang: UILanguage;
  onAllGrantedChange: (ok: boolean) => void;
}) {
  const P = T.permissions;
  const [permStatus, setPermStatus] = useState<PermissionStatus | null>(null);

  useEffect(() => {
    const poll = () => {
      checkPermissions()
        .then((status) => {
          setPermStatus(status);
          onAllGrantedChange(
            !!(status.accessibility && status.microphone && status.input_monitoring)
          );
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [onAllGrantedChange]);

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

  const allGranted =
    !!permStatus?.accessibility &&
    !!permStatus?.microphone &&
    !!permStatus?.input_monitoring;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-[var(--text)] mb-1">{t(P.title, lang)}</h3>
        <p className="text-sm text-[var(--text-muted)]">{t(P.description, lang)}</p>
      </div>

      <div className="space-y-3">
        {permissions.map((perm) => {
          const granted = isGranted(perm.key);
          return (
            <div
              key={perm.key}
              className={`flex items-center justify-between rounded-lg px-4 py-3 border transition-colors ${
                granted
                  ? "bg-[var(--success-soft)] border-[var(--success)]/30"
                  : "bg-[var(--bg-muted)] border-[var(--border)]"
              }`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0 mr-3">
                {granted !== null && (
                  <div
                    className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                      granted ? "bg-[var(--success)]" : "bg-[var(--border-strong)]"
                    }`}
                    aria-hidden="true"
                  >
                    {granted ? (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3 text-[var(--text-faint)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text)]">{t(perm.label, lang)}</p>
                  <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
                    {t(perm.description, lang)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openSystemPreferences(perm.key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                  granted
                    ? "bg-[var(--success-soft)] text-[var(--success)]"
                    : "bg-[var(--accent-soft)] text-[var(--accent-text)]"
                }`}
              >
                {t(P.openSettings, lang)}
              </button>
            </div>
          );
        })}
      </div>

      {allGranted ? (
        <p className="text-sm text-[var(--success)] font-medium">{t(P.allGranted, lang)}</p>
      ) : (
        <p className="text-[11px] text-[var(--text-faint)] leading-relaxed">{t(P.note, lang)}</p>
      )}
    </div>
  );
}

function LocalWhisperSetup({
  settings,
  save,
  lang,
}: {
  settings: AppSettings;
  save: (s: AppSettings) => void;
  lang: UILanguage;
}) {
  const S = T.stt;
  const [setupStep, setSetupStep] = useState<"idle" | "venv" | "pip" | "download" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    Promise.all([checkVenvExists(), checkDownloadedModels()])
      .then(([venvExists, models]) => {
        if (venvExists && models.length > 0) {
          setSetupStep("done");
          setMessage(t(S.localWhisperReady, lang));
        }
      })
      .catch(() => {});
  }, [lang]);

  useEffect(() => {
    const unlisten = listen<{ step: string; message: string }>("setup-progress", (event) => {
      const { step, message: msg } = event.payload;
      setSetupStep(step as typeof setupStep);
      setMessage(msg);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<{ status: string; progress: number; message: string }>(
      "download-progress",
      (event) => {
        const { status, progress, message: msg } = event.payload;
        setDownloadProgress(progress);
        setMessage(msg);
        if (status === "done") {
          setSetupStep("done");
          setMessage(t(S.localWhisperReady, lang));
          save({
            ...settings,
            local_stt_server: { ...settings.local_stt_server, model: "base" },
          });
          // Model is ready — start the local STT server so the test step works.
          void (async () => {
            const err = await ensureLocalSttServer({
              ...settings,
              stt: { ...settings.stt, preset: "local_whisper" },
              local_stt_server: { ...settings.local_stt_server, model: "base" },
            });
            if (err) {
              console.error("Failed to auto-start STT server after download:", err);
            }
          })();
        } else if (status === "error") {
          setSetupStep("error");
        }
      }
    );
    return () => {
      unlisten.then((f) => f());
    };
  }, [lang]);

  // Already set up from a previous visit — still ensure the server is up.
  useEffect(() => {
    if (setupStep !== "done") return;
    void ensureLocalSttServer({
      ...settings,
      stt: { ...settings.stt, preset: "local_whisper" },
    });
  }, [setupStep]);

  const handleSetup = async () => {
    try {
      await setupLocalWhisper();
      setSetupStep("download");
      setMessage("Downloading base model…");
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
        <div className="flex items-center gap-2 text-sm text-[var(--success)] font-medium bg-[var(--success-soft)] border border-[var(--success)]/20 rounded-lg px-3 py-2.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {message}
        </div>
      ) : (
        <>
          {!isRunning && setupStep !== "error" && (
            <button
              type="button"
              onClick={handleSetup}
              className="w-full bg-[var(--accent)] text-[var(--bg)] hover:opacity-90 px-4 py-2.5 rounded-lg text-sm font-medium transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              {t(S.setupLocalWhisper, lang)}
            </button>
          )}
          {isRunning && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-[var(--accent-text)] font-medium">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {message}
              </div>
              {setupStep === "download" && (
                <div className="w-full bg-[var(--border)] rounded-full h-1.5">
                  <div
                    className="bg-[var(--accent)] h-1.5 rounded-full transition-[width] duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}
          {setupStep === "error" && (
            <div className="space-y-2">
              <p className="text-sm text-[var(--danger)] break-words">{message}</p>
              <button
                type="button"
                onClick={handleSetup}
                className="w-full bg-[var(--bg-muted)] text-[var(--text)] hover:opacity-90 px-4 py-2.5 rounded-lg text-sm font-medium transition-opacity"
              >
                {t(S.retry, lang)}
              </button>
            </div>
          )}
        </>
      )}
      <p className="text-[11px] text-[var(--text-faint)]">{t(S.localWhisperNote, lang)}</p>
    </div>
  );
}

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
        <h3 className="text-lg font-semibold text-[var(--text)] mb-1">{t(S.title, lang)}</h3>
        <p className="text-sm text-[var(--text-muted)]">{t(S.description, lang)}</p>
      </div>

      <div className="space-y-2">
        <FieldLabel>{t(S.provider, lang)}</FieldLabel>
        <SegmentedControl
          ariaLabel={t(S.provider, lang)}
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
            <FieldLabel htmlFor="onb-stt-model">{t(S.model, lang)}</FieldLabel>
            <input
              id="onb-stt-model"
              name="stt_model"
              autoComplete="off"
              spellCheck={false}
              className={monoInputClass}
              value={settings.stt.model}
              onChange={(e) => updateStt({ model: e.target.value })}
            />
          </div>
          {isLocal && (
            <div className="space-y-1">
              <FieldLabel htmlFor="onb-stt-url">{t(S.baseUrl, lang)}</FieldLabel>
              <input
                id="onb-stt-url"
                name="stt_base_url"
                autoComplete="off"
                spellCheck={false}
                className={monoInputClass}
                value={settings.stt.base_url}
                onChange={(e) => updateStt({ base_url: e.target.value })}
              />
            </div>
          )}
          <div className="space-y-1">
            <FieldLabel htmlFor="onb-stt-key">{t(S.apiKey, lang)}</FieldLabel>
            <input
              id="onb-stt-key"
              name="stt_api_key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
              value={settings.stt.api_key}
              onChange={(e) => updateStt({ api_key: e.target.value })}
              placeholder={isLocal ? (lang === "ja" ? "（不要）" : "(not required)") : "sk-…"}
            />
          </div>
        </>
      )}

      {isLocalWhisper && <LocalWhisperSetup settings={settings} save={save} lang={lang} />}
      <p className="text-[11px] text-[var(--text-faint)] leading-relaxed">{t(S.tip, lang)}</p>
    </div>
  );
}

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

  const update = useCallback(
    (patch: Partial<AppSettings>) => save({ ...settings, ...patch }),
    [settings, save]
  );

  useEffect(() => {
    setHotkeyTestMode(true).catch(() => {});
    return () => {
      setHotkeyTestMode(false).catch(() => {});
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<string>("hotkey-detected", (event) => {
      if (event.payload === "pressed") setDetected(true);
      else setTimeout(() => setDetected(false), 1500);
    });
    return () => {
      unlisten.then((f) => f());
    };
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
  }, [capturing, settings.hotkey, update, onHotkeySet]);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-[var(--text)] mb-1">{t(H.title, lang)}</h3>
        <p className="text-sm text-[var(--text-muted)]">{t(H.description, lang)}</p>
      </div>

      <div className="space-y-2">
        <FieldLabel>{t(H.activationMode, lang)}</FieldLabel>
        <SegmentedControl
          ariaLabel={t(H.activationMode, lang)}
          value={settings.activation_mode}
          onChange={(mode) => update({ activation_mode: mode })}
          options={[
            { value: "hold", label: t(H.holdToRecord, lang) },
            { value: "double_tap", label: t(H.doubleTap, lang) },
          ]}
        />
      </div>

      <div className="space-y-2">
        <FieldLabel>{t(H.hotkeyLabel, lang)}</FieldLabel>
        <button
          type="button"
          aria-label={t(H.hotkeyLabel, lang)}
          onClick={() => setCapturing(true)}
          className={`w-full px-3 py-2 rounded-lg text-sm font-medium text-left transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
            capturing
              ? "bg-[var(--accent-soft)] text-[var(--accent-text)] ring-2 ring-[var(--accent-ring)]"
              : "bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]"
          }`}
        >
          {capturing ? t(H.pressAKey, lang) : formatHotkeyLabel(settings.hotkey.key)}
        </button>
      </div>

      {settings.activation_mode === "double_tap" && (
        <div className="space-y-2">
          <FieldLabel htmlFor="onb-double-tap">{t(G.doubleTapInterval, lang)}</FieldLabel>
          <div className="flex items-center gap-3">
            <input
              id="onb-double-tap"
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
          <p className="text-[11px] text-[var(--text-faint)]">{t(G.doubleTapHint, lang)}</p>
        </div>
      )}

      {detected && (
        <div className="flex items-center gap-2 text-sm text-[var(--success)] font-medium bg-[var(--success-soft)] border border-[var(--success)]/30 rounded-lg px-3 py-2.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {lang === "ja" ? "ホットキー検出OK" : "Hotkey detected OK"}
        </div>
      )}
    </div>
  );
}

function StepTest({ settings, lang }: { settings: AppSettings; lang: UILanguage }) {
  const Te = T.test;
  const { state, lastRawTranscription, lastTranscription, error, clearResults } =
    useRecordingState();
  const [serverStatus, setServerStatus] = useState<
    "idle" | "starting" | "ready" | "error"
  >("idle");

  useEffect(() => {
    clearResults();
  }, []);

  // Local Whisper needs the STT server before the hotkey test can succeed.
  useEffect(() => {
    if (settings.stt.preset !== "local_whisper") {
      setServerStatus("idle");
      return;
    }
    let cancelled = false;
    setServerStatus("starting");
    void (async () => {
      const err = await ensureLocalSttServer(settings);
      if (cancelled) return;
      setServerStatus(err ? "error" : "ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [settings.stt.preset, settings.local_stt_server.port, settings.local_stt_server.host]);

  const sttLang = settings.language.mode || "english";
  const sampleText = SAMPLE_TEXT[sttLang] || SAMPLE_TEXT.english;
  const hotkeyLabel = formatHotkeyLabel(settings.hotkey.key);
  const waitingForServer = settings.stt.preset === "local_whisper" && serverStatus === "starting";

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-[var(--text)] mb-1">{t(Te.title, lang)}</h3>
        <p className="text-sm text-[var(--text-muted)]">{t(Te.description, lang)}</p>
      </div>

      {settings.stt.preset === "local_whisper" && (
        <div
          className={`text-sm rounded-lg px-3 py-2.5 border ${
            serverStatus === "ready"
              ? "text-[var(--success)] bg-[var(--success-soft)] border-[var(--success)]/20"
              : serverStatus === "error"
                ? "text-[var(--danger)] bg-[var(--danger-soft)] border-[var(--danger)]/20"
                : "text-[var(--accent-text)] bg-[var(--accent-soft)] border-[var(--accent)]/20"
          }`}
        >
          {serverStatus === "starting" && (
            <span className="inline-flex items-center gap-2">
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t(Te.startingServer, lang)}
            </span>
          )}
          {serverStatus === "ready" && t(Te.serverReady, lang)}
          {serverStatus === "error" && t(Te.serverStartFailed, lang)}
        </div>
      )}

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
        {state === "idle" && !waitingForServer && (
          <p className="text-sm text-[var(--text-muted)]">
            {Te.pressToStart[lang](hotkeyLabel, settings.activation_mode)}
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

      <p className="text-[11px] text-[var(--text-faint)] leading-relaxed whitespace-pre-line">
        {t(T.test.tip, lang)}
      </p>
    </div>
  );
}

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
  const [buildNumber, setBuildNumber] = useState("");
  const [permissionsOk, setPermissionsOk] = useState(false);
  const hotkeyTouchedRef = useRef(false);
  const lang: UILanguage = settings.ui_language || "ja";

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
    getBuildNumber().then(setBuildNumber).catch(() => {});
    applyAppearance((settings.appearance as AppAppearance) || "system");
  }, [settings.appearance]);

  const setStep = (s: number) => {
    setStepRaw(s);
    saveOnboardingStep(s).catch(() => {});
  };

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
    if (onComplete) onComplete();
    else {
      const latest = await getSettings();
      save({ ...latest, onboarding_completed: true, onboarding_step: 0 });
    }
  };

  const canGoNext = step !== 1 || permissionsOk;

  return (
    <div className="flex items-center justify-center h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="w-full max-w-md px-6">
        <div className="flex justify-end mb-4">
          <SegmentedControl
            ariaLabel="Language / 言語"
            value={lang}
            onChange={setLang}
            options={[
              { value: "ja", label: "日本語" },
              { value: "en", label: "English" },
            ]}
          />
        </div>

        <div className="flex items-center justify-center gap-2 mb-8" aria-label="Setup progress">
          {STEPS.map((_label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-[background-color,color] duration-150 ${
                  i === step
                    ? "bg-[var(--accent)] text-[var(--bg)]"
                    : i < step
                      ? "bg-[var(--accent-soft)] text-[var(--accent-text)]"
                      : "bg-[var(--bg-muted)] text-[var(--text-faint)]"
                }`}
                aria-current={i === step ? "step" : undefined}
              >
                {i < step ? "✓" : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-8 h-0.5 ${i < step ? "bg-[var(--accent-ring)]" : "bg-[var(--border)]"}`}
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
        </div>

        <div className="mb-8">
          {step === 0 && <StepWelcome lang={lang} />}
          {step === 1 && (
            <StepPermissions lang={lang} onAllGrantedChange={setPermissionsOk} />
          )}
          {step === 2 && <StepStt settings={settings} save={save} lang={lang} />}
          {step === 3 && (
            <StepHotkey
              settings={settings}
              save={save}
              lang={lang}
              initialCapturing={!hotkeyTouchedRef.current}
              onHotkeySet={() => {
                hotkeyTouchedRef.current = true;
              }}
            />
          )}
          {step === 4 && <StepTest settings={settings} lang={lang} />}
        </div>

        <div className="flex flex-col gap-2">
          {step === 1 && !permissionsOk && (
            <p className="text-[11px] text-center text-[var(--warning)]">
              {t(T.nav.grantPermissionsFirst, lang)}
            </p>
          )}
          <div className="flex gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-[var(--bg-muted)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              >
                {t(T.nav.back, lang)}
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                disabled={!canGoNext}
                onClick={() => {
                  if (step === 1) initializeHotkeys().catch(() => {});
                  if (step === 2 && settings.stt.preset === "local_whisper") {
                    void ensureLocalSttServer(settings);
                  }
                  if (step === 3) initializeHotkeys().catch(() => {});
                  setStep(step + 1);
                }}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-[var(--accent)] text-[var(--bg)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              >
                {t(T.nav.next, lang)}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleComplete}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-[var(--accent)] text-[var(--bg)] hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              >
                {t(T.nav.complete, lang)}
              </button>
            )}
          </div>
        </div>

        {version && (
          <p className="text-center text-[11px] text-[var(--text-faint)] mt-4">
            Whisper Dictation ({version} · build {buildNumber || "—"})
          </p>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useRecordingState, RecordingState } from "../hooks/useRecordingState";
import { getSettings } from "../lib/ipc";
import { translations, t, UILanguage } from "../lib/i18n";
import { applyAppearance, AppAppearance } from "../lib/theme";

const O = translations.overlay;

export function StatusIndicator() {
  const { state, lastTranscription, error } = useRecordingState();
  const [lang, setLang] = useState<UILanguage>("ja");

  useEffect(() => {
    getSettings()
      .then((s) => {
        setLang(s.ui_language || "ja");
        applyAppearance((s.appearance as AppAppearance) || "system");
      })
      .catch(() => {});
  }, []);

  const stateConfig: Record<
    RecordingState,
    { label: string; color: string; pulse: boolean }
  > = {
    idle: { label: t(O.ready, lang), color: "bg-slate-500", pulse: false },
    recording: { label: t(O.listening, lang), color: "bg-rose-500", pulse: true },
    processing: { label: t(O.processing, lang), color: "bg-amber-500", pulse: true },
    error: { label: t(O.error, lang), color: "bg-rose-700", pulse: false },
  };

  const config = stateConfig[state];

  return (
    <div className="p-4 space-y-3 bg-[var(--bg)] text-[var(--text)]" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="relative" aria-hidden="true">
          <div className={`w-3 h-3 rounded-full ${config.color}`} />
          {config.pulse && (
            <div
              className={`absolute inset-0 w-3 h-3 rounded-full ${config.color} animate-ping`}
            />
          )}
        </div>
        <span className="text-sm font-medium">{config.label}</span>
      </div>

      {error && (
        <p className="text-xs text-[var(--danger)] break-words">{error}</p>
      )}

      {lastTranscription && state === "idle" && (
        <p className="text-xs text-[var(--text-muted)] truncate max-w-[180px]">
          {lastTranscription}
        </p>
      )}
    </div>
  );
}

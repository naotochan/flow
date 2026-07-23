import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { AppSettings, getSettings, saveSettings } from "../lib/ipc";

function normalizeSettings(s: AppSettings): AppSettings {
  return {
    ...s,
    appearance: s.appearance || "system",
    ui_language: s.ui_language || "ja",
    replace_selection: s.replace_selection ?? false,
    replacements: s.replacements ?? [],
    active_mode_id: s.active_mode_id || "format",
    modes: s.modes ?? [],
    history_enabled: s.history_enabled ?? true,
    history_retention_days: s.history_retention_days ?? 0,
  };
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    const s = await getSettings();
    setSettings(normalizeSettings(s));
  }, []);

  useEffect(() => {
    reload()
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [reload]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("settings-changed", () => {
      reload().catch(console.error);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [reload]);

  const save = useCallback(async (newSettings: AppSettings) => {
    setSaving(true);
    try {
      const normalized = normalizeSettings(newSettings);
      await saveSettings(normalized);
      setSettings(normalized);
    } finally {
      setSaving(false);
    }
  }, []);

  return { settings, loading, saving, save };
}

import { useState, useEffect, useCallback } from "react";
import { AppSettings, getSettings, saveSettings } from "../lib/ipc";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings()
      .then((s) =>
        setSettings({
          ...s,
          appearance: s.appearance || "system",
          ui_language: s.ui_language || "ja",
          replacements: s.replacements ?? [],
        }),
      )
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(
    async (newSettings: AppSettings) => {
      setSaving(true);
      try {
        const normalized = {
          ...newSettings,
          appearance: newSettings.appearance || "system",
          replacements: newSettings.replacements ?? [],
        };
        await saveSettings(normalized);
        setSettings(normalized);
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return { settings, loading, saving, save };
}

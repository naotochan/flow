import { useState, useEffect, useCallback } from "react";
import { AppSettings, getSettings, saveSettings } from "../lib/ipc";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(
    async (newSettings: AppSettings) => {
      setSaving(true);
      try {
        await saveSettings(newSettings);
        setSettings(newSettings);
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return { settings, loading, saving, save };
}

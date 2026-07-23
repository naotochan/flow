import { useEffect } from "react";
import { SettingsPanel } from "./components/SettingsPanel";
import { StatusIndicator } from "./components/StatusIndicator";
import { OverlayIndicator } from "./components/OverlayIndicator";
import { applyAppearance, AppAppearance } from "./lib/theme";
import { getSettings } from "./lib/ipc";

function App() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");

  useEffect(() => {
    getSettings()
      .then((s) => applyAppearance((s.appearance as AppAppearance) || "system"))
      .catch(() => applyAppearance("system"));

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      getSettings()
        .then((s) => {
          const appearance = (s.appearance as AppAppearance) || "system";
          if (appearance === "system") applyAppearance("system");
        })
        .catch(() => {});
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (view === "overlay") {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return <OverlayIndicator />;
  }

  if (view === "status") {
    return <StatusIndicator />;
  }

  return <SettingsPanel />;
}

export default App;

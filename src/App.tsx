import { SettingsPanel } from "./components/SettingsPanel";
import { StatusIndicator } from "./components/StatusIndicator";
import { OverlayIndicator } from "./components/OverlayIndicator";

function App() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");

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

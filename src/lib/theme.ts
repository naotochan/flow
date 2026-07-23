export type AppAppearance = "system" | "light" | "dark";

export function applyAppearance(appearance: AppAppearance) {
  const root = document.documentElement;
  if (appearance === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", appearance);
  }
}

export function resolveAppearance(appearance: AppAppearance): "light" | "dark" {
  if (appearance === "light" || appearance === "dark") return appearance;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

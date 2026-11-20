// Light, dark or follow the device. Dark is the default (the design is dark-first).
export type ThemePref = "dark" | "light" | "system"
const KEY = "pst_theme"
export function themePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === "light" || v === "system" ? v : "dark"
  } catch {
    return "dark"
  }
}
export const resolveTheme = (p: ThemePref): "dark" | "light" =>
  p === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : p
export function applyTheme(p: ThemePref) {
  try { localStorage.setItem(KEY, p) } catch { /* not remembered */ }
  document.documentElement.dataset.theme = resolveTheme(p)
  return resolveTheme(p)
}

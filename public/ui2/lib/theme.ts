import { cache } from "@fider/services"

// The person's theme choice, stored exactly like classic and the shell's toggle:
// localStorage "theme" (read by base.html before first paint) and body[data-theme].
export type ThemeChoice = "light" | "dark" | "system"

export const storedTheme = (siteDefault?: string): ThemeChoice => {
  const v = cache.local.get("theme") || siteDefault || "light"
  return v === "dark" || v === "system" ? v : "light"
}

export const resolveTheme = (choice: ThemeChoice): "light" | "dark" => {
  if (choice !== "system") return choice
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export const applyTheme = (choice: ThemeChoice) => {
  cache.local.set("theme", choice)
  document.body.setAttribute("data-theme", resolveTheme(choice))
  // Lets the shell's toggle follow a change made elsewhere (My settings).
  window.dispatchEvent(new CustomEvent("ui2:themechange"))
}

// Re-resolves the "system" choice when the OS color scheme flips. One owner (the shell's theme
// toggle) subscribes once and removes it on unmount; the listener does nothing unless the
// stored choice is "system", so a later switch to light or dark needs no re-subscription.
export const followSystemTheme = (siteDefault?: string): (() => void) => {
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)")
  if (!mq) return () => undefined
  const onChange = () => {
    if (storedTheme(siteDefault) !== "system") return
    document.body.setAttribute("data-theme", resolveTheme("system"))
    window.dispatchEvent(new CustomEvent("ui2:themechange"))
  }
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

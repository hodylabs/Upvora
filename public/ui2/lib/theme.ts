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
}

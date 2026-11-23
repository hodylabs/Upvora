import { useEffect, useState } from "react"

// shortcut: local stand-in for the shell's useTeamView(); swap for the real hook once the new top bar lands.
export const TEAM_VIEW_KEY = "ui2.teamView"
export const TEAM_VIEW_EVENT = "ui2:teamview"

const read = (): boolean => {
  try {
    return localStorage.getItem(TEAM_VIEW_KEY) === "true"
  } catch {
    return false
  }
}

export const useTeamView = (): [boolean, (on: boolean) => void] => {
  const [on, setOn] = useState(read)
  useEffect(() => {
    const sync = () => setOn(read())
    window.addEventListener(TEAM_VIEW_EVENT, sync)
    return () => window.removeEventListener(TEAM_VIEW_EVENT, sync)
  }, [])
  const set = (next: boolean) => {
    try {
      localStorage.setItem(TEAM_VIEW_KEY, String(next))
    } catch {
      // Private windows may refuse storage; the switch still works for this page.
    }
    window.dispatchEvent(new Event(TEAM_VIEW_EVENT))
    setOn(next)
  }
  return [on, set]
}

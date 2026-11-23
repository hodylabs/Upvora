import { useSyncExternalStore } from "react"
import { useFider } from "@fider/hooks"

// "Team view": staff switch in the top bar that shows pending ideas, voters and
// internal notes on pages. Remembered per browser; the shell only offers it to staff,
// and every staff-only thing it reveals is still enforced by the server.
export const TEAM_VIEW_KEY = "ui2.teamView"
const EVENT = "ui2:teamview"

const read = (): boolean => {
  try {
    return localStorage.getItem(TEAM_VIEW_KEY) === "1"
  } catch {
    return false
  }
}

export const setTeamView = (on: boolean): void => {
  try {
    if (on) localStorage.setItem(TEAM_VIEW_KEY, "1")
    else localStorage.removeItem(TEAM_VIEW_KEY)
  } catch {
    // Storage blocked (private window): the switch still works for this page view.
  }
  memory = on
  window.dispatchEvent(new Event(EVENT))
}

let memory: boolean | undefined
const snapshot = () => memory ?? (memory = read())

const subscribe = (cb: () => void) => {
  // Another tab flipping the switch updates this one too.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== TEAM_VIEW_KEY) return
    memory = undefined
    cb()
  }
  window.addEventListener(EVENT, cb)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener("storage", onStorage)
  }
}

// Collaborators and admins; the only people offered the switch.
export const useIsStaff = (): boolean => {
  const s = useFider().session
  return s.isAuthenticated && (s.user.isCollaborator || s.user.isAdministrator)
}

// Pages read it with `const [teamView] = useTeamView()`. Always false for non-staff,
// so a stale "on" left from a former role shows nothing.
export const useTeamView = (): [boolean, (on: boolean) => void] => {
  const on = useSyncExternalStore(subscribe, snapshot, () => false)
  const staff = useIsStaff()
  return [on && staff, setTeamView]
}

// For tests: forget the cached value so the next read comes from storage.
export const resetTeamViewCache = (): void => {
  memory = undefined
}

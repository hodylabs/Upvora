import React, { useEffect, useState } from "react"
import { Trans, Plural } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { cache } from "@fider/services"
import { useFider } from "@fider/hooks"
import { Briefing as BriefingData, fetchBriefing } from "../../lib/insights"

export const BRIEF_DISMISSED_KEY = "ui2.brief.dismissed"

// "Since your last visit": a slim strip for signed-in people, from the briefing endpoint.
// Hidden when the endpoint fails, nothing changed, or it was dismissed for this visit.
export const Briefing = (props: { hidden?: boolean; teamView: boolean }) => {
  const fider = useFider()
  const [data, setData] = useState<BriefingData | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const signedIn = fider.session.isAuthenticated

  useEffect(() => {
    // The fetch records the visit, so it runs once per page load, typed text or not.
    if (signedIn)
      fetchBriefing().then((d) => {
        setData(d)
        if (d && cache.local.get(BRIEF_DISMISSED_KEY) === d.since) setDismissed(true)
      })
  }, [signedIn])

  if (!signedIn || !data || dismissed || props.hidden) return null
  const newIdeas = data.newIdeas || 0
  const votedMoved = data.votedMoved || 0
  const duplicates = props.teamView && fider.session.user.isCollaborator ? data.duplicates || 0 : 0
  if (newIdeas + votedMoved + duplicates === 0) return null

  const dismiss = () => {
    // Keyed by the visit, so the next visit's news shows again.
    cache.local.set(BRIEF_DISMISSED_KEY, data.since)
    setDismissed(true)
  }

  return (
    <section className="u2-since" aria-labelledby="u2-since-h">
      <h2 id="u2-since-h" className="u2-since__h u2-mono">
        {data.firstVisit ? <Trans id="ui2.since.first">in the last day</Trans> : <Trans id="ui2.since.title">since your last visit</Trans>}
      </h2>
      {newIdeas > 0 && (
        <a href="/?view=recent">
          <Plural id="ui2.brief.newideas" value={newIdeas} one="# new idea" other="# new ideas" />
        </a>
      )}
      {votedMoved > 0 && (
        <a href="/?myvotes=true">
          <Plural id="ui2.brief.votedmoved" value={votedMoved} one="# idea you voted on moved" other="# ideas you voted on moved" />
        </a>
      )}
      {duplicates > 0 && (
        <span>
          <Plural id="ui2.brief.duplicates" value={duplicates} one="# duplicate to merge" other="# duplicates to merge" />
        </span>
      )}
      <button type="button" className="u2-iconbtn u2-since__x" onClick={dismiss} aria-label={i18n._({ id: "ui2.nudge.dismiss", message: "Dismiss" })}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </section>
  )
}

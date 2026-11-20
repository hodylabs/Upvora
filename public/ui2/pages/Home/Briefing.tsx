import React, { useEffect, useState } from "react"
import { Trans, Plural } from "@lingui/react/macro"
import { useFider } from "@fider/hooks"
import { Briefing as BriefingData, fetchBriefing } from "../../lib/insights"

// Vora's briefing in the sidebar (signed-in people): what changed since the last visit.
// Hidden when the endpoint fails or nothing changed.
export const Briefing = () => {
  const fider = useFider()
  const [data, setData] = useState<BriefingData | null>(null)
  const signedIn = fider.session.isAuthenticated

  useEffect(() => {
    if (signedIn) fetchBriefing().then(setData)
  }, [signedIn])

  if (!signedIn || !data) return null
  const staff = fider.session.user.isCollaborator
  const name = (fider.session.user.name || "").split(" ")[0]
  const newIdeas = data.newIdeas || 0
  const votedMoved = data.votedMoved || 0
  const duplicates = staff ? data.duplicates || 0 : 0
  if (newIdeas + votedMoved + duplicates === 0) return null

  let when = ""
  try {
    when = new Intl.DateTimeFormat(fider.currentLocale, { weekday: "long", hour: "numeric", minute: "2-digit" }).format(new Date(data.since))
  } catch {
    when = ""
  }

  return (
    <section className="u2-brief" aria-labelledby="u2-brief-h">
      <h2 id="u2-brief-h" className="u2-brief__h">
        {data.firstVisit ? <Trans id="ui2.brief.hifirst">Hi {name}, in the last day</Trans> : <Trans id="ui2.brief.hi">Hi {name}, since your last visit</Trans>}
      </h2>
      {when && !data.firstVisit && <p className="u2-brief__when">{when}</p>}
      <ul className="u2-brief__list">
        {newIdeas > 0 && (
          <li>
            <a href="/?view=recent">
              <Plural id="ui2.brief.newideas" value={newIdeas} one="# new idea" other="# new ideas" />
            </a>
          </li>
        )}
        {votedMoved > 0 && (
          <li>
            <a href="/?myvotes=true">
              <Plural id="ui2.brief.votedmoved" value={votedMoved} one="# idea you voted on moved" other="# ideas you voted on moved" />
            </a>
          </li>
        )}
        {duplicates > 0 && (
          <li>
            {/* No board view lists duplicate candidates yet; the row notes show them. */}
            <span>
              <Plural id="ui2.brief.duplicates" value={duplicates} one="# duplicate to merge" other="# duplicates to merge" />
            </span>
          </li>
        )}
      </ul>
    </section>
  )
}

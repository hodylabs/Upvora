import React, { Suspense, lazy, useEffect, useState } from "react"
import { i18n } from "@lingui/core"
import { cache, navigator } from "@fider/services"
import { useFider } from "@fider/hooks"
import { SHARE_IDEA_EVENT, ShareIdeaDetail } from "../../lib/share"
import { replaceQuery } from "../../lib/nav"
import { toast } from "../feedback/toast"
import { CREATED_MODERATION, CREATED_SUCCESS, DRAFT_KEYS, SHARE_FLAG, shareSignInHref } from "./rules"

// The editor and chat load only when someone opens "Share an idea".
const ShareDialog = lazy(() => import(/* webpackChunkName: "ui2-share" */ "./ShareDialog"))

// Mounted once next to the shell. It claims the board's "share an idea" event, sends
// signed-out people to sign in (coming back with ?share=1, which reopens it), and
// shows the "idea added" toast after the redirect to the new idea.
export const ShareIdea = () => {
  const fider = useFider()
  const signedIn = fider.session.isAuthenticated
  const [open, setOpen] = useState<{ title: string } | null>(null)

  useEffect(() => {
    if (cache.session.get(CREATED_SUCCESS)) {
      cache.session.remove(CREATED_SUCCESS)
      toast.success(i18n._({ id: "mysettings.notification.event.newpostcreated", message: "Your idea has been added 👍" }))
    }
    if (cache.session.get(CREATED_MODERATION)) {
      cache.session.remove(CREATED_MODERATION)
      toast.success(i18n._({ id: "showpost.moderation.postsuccess", message: "Your idea is awaiting moderation 📝" }))
    }

    if (fider.isReadOnly) return
    const params = new URLSearchParams(location.search)
    // Back from sign in (or classic's pending flag): reopen, without the flag in the URL.
    if (signedIn && (params.has(SHARE_FLAG) || cache.local.get(DRAFT_KEYS.POST_PENDING) === "true")) {
      cache.local.remove(DRAFT_KEYS.POST_PENDING)
      if (params.has(SHARE_FLAG)) {
        params.delete(SHARE_FLAG)
        const qs = params.toString()
        replaceQuery(qs ? `?${qs}` : "")
      }
      setOpen({ title: "" })
    }

    const onShare = (e: Event) => {
      e.preventDefault()
      if (!signedIn) {
        navigator.goTo(shareSignInHref())
        return
      }
      setOpen({ title: (e as CustomEvent<ShareIdeaDetail>).detail?.title || "" })
    }
    window.addEventListener(SHARE_IDEA_EVENT, onShare)
    return () => window.removeEventListener(SHARE_IDEA_EVENT, onShare)
  }, [])

  if (!open) return null
  return (
    <Suspense fallback={null}>
      <ShareDialog initialTitle={open.title} onClose={() => setOpen(null)} />
    </Suspense>
  )
}

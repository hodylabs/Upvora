import React from "react"
import { Comment, InternalNote, Post, Tag, Vote } from "@fider/models"
import { IdeaView } from "./IdeaView"

// Same props the server sends classic's ShowPost page (app/handlers/post.go, PostDetails).
export interface ShowPostPageProps {
  post: Post
  subscribed: boolean
  comments: Comment[]
  tags: Tag[]
  votes: Vote[]
  attachments: string[]
  internalNote?: InternalNote
}

// A direct visit to /posts/:number/:slug renders the full page; the board opens the
// same IdeaView in an overlay (IdeaOverlay).
const ShowPostPage = (props: ShowPostPageProps) => (
  <div className="u2-sheet u2-sheet--page">
    <IdeaView
      key={props.post.number}
      data={{
        post: props.post,
        subscribed: props.subscribed,
        comments: props.comments || [],
        tags: props.tags || [],
        votes: props.votes || [],
        attachments: props.attachments,
        internalNote: props.internalNote,
      }}
    />
  </div>
)

export default ShowPostPage

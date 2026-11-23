import "./account.css"
import React from "react"
import { useFider } from "@fider/hooks"
import { uploadedImageURL } from "@fider/services"

// The site's logo and name at the top of every entry card (sign in, consent, errors).
// Without a logo the site's initial sits on the brand gradient.
export const AuthBrand = (props: { link?: boolean }) => {
  const fider = useFider()
  const tenant = fider.session.tenant
  if (!tenant) return null
  const logo = uploadedImageURL(tenant.logoBlobKey, 100)
  const mark = logo ? (
    <img className="u2-auth__logo" src={logo} alt="" width={48} height={48} />
  ) : (
    <span className="u2-auth__logo u2-auth__logo--mark" aria-hidden="true">
      {tenant.name.trim().charAt(0).toUpperCase()}
    </span>
  )
  const inner = (
    <>
      {mark}
      <span className="u2-auth__site">{tenant.name}</span>
    </>
  )
  return props.link ? (
    <a className="u2-auth__brand" href="/">
      {inner}
    </a>
  ) : (
    <div className="u2-auth__brand">{inner}</div>
  )
}

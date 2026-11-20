// The new UI's entry. It shares the data layer with classic (services, models,
// locales) and nothing else: no classic component or stylesheet is imported here.
import "./styles/tokens.css"
import "./styles/shell.css"

import React, { Suspense } from "react"
import { createRoot } from "react-dom/client"
import { I18n } from "@lingui/core"
import { I18nProvider } from "@lingui/react"
import { Fider, FiderContext, actions, activateI18N } from "@fider/services"
import { ErrorBoundary } from "./shell/ErrorBoundary"
import { Shell } from "./shell/Shell"
import { pageFor } from "./pages"

const logError = (err: Error) => {
  if (Fider.isProduction()) {
    console.error(err)
    actions.logError(`ui2.ErrorBoundary: ${err.message}`, err)
  }
}

window.addEventListener("unhandledrejection", (evt: PromiseRejectionEvent) => {
  if (evt.reason instanceof Error) {
    actions.logError(`ui2.unhandledrejection: ${evt.reason.message}`, evt.reason)
  }
})

const bootstrap = (i18n: I18n) => {
  const Page = pageFor(fider.session.page)
  document.body.classList.add("u2")
  document.body.classList.toggle("is-authenticated", fider.session.isAuthenticated)
  document.body.classList.toggle("is-staff", fider.session.isAuthenticated && fider.session.user.isCollaborator)

  const rootElement = document.getElementById("root")
  if (!rootElement) return
  createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary onError={logError}>
        <I18nProvider i18n={i18n}>
          <FiderContext.Provider value={fider}>
            <Shell>
              <Suspense fallback={<div className="u2-loading" aria-busy="true" />}>
                <Page {...fider.session.props} />
              </Suspense>
            </Shell>
          </FiderContext.Provider>
        </I18nProvider>
      </ErrorBoundary>
    </React.StrictMode>
  )
}

const fider = Fider.initialize()
__webpack_nonce__ = fider.session.contextID
__webpack_public_path__ = `${fider.settings.assetsURL}/assets/ui2/`
activateI18N(fider.currentLocale).then(bootstrap).catch(bootstrap)

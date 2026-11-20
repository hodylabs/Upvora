import "./billing.css"

import React, { useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { http } from "@fider/services"
import { Button } from "../../../components/form"
import { AdminLayout } from "../AdminLayout"

// Billing (only where billing is on; the route exists only then): classic's plan
// cards. Paddle customers without a Stripe subscription see the migration note and
// a "Legacy Pro" card and are not shown as Pro; Stripe Pro customers manage billing
// (and downgrade) in the Stripe portal; everyone else can start a checkout, monthly
// or annual. Each button posts to the server and follows the URL it returns.

interface ManageBillingPageProps {
  stripeCustomerID: string
  stripeSubscriptionID: string
  paddleSubscriptionID: string
  isPro: boolean
}

export const billingState = (props: ManageBillingPageProps) => {
  const isPaddleCustomer = Boolean(props.paddleSubscriptionID && !props.stripeSubscriptionID)
  return { isPaddleCustomer, displayAsPro: props.isPro && !isPaddleCustomer }
}

interface PlanFeature {
  text: string
  isNegative?: boolean
  onClick?: () => void
}

interface PlanCardProps {
  name: string
  price?: string
  period?: string
  description: string
  features: PlanFeature[]
  isCurrent: boolean
  isHighlighted?: boolean
  buttonText: string
  buttonVariant: "primary" | "secondary"
  onButtonClick?: () => void
  isLoading: boolean
}

const PlanCard = (props: PlanCardProps) => {
  const showCurrentLabel = props.isCurrent && !props.onButtonClick
  const cls = ["u2-plan", props.isHighlighted && "u2-plan--hi", props.isCurrent && "u2-plan--current"].filter(Boolean).join(" ")
  return (
    <section className={cls} aria-label={props.name} data-plan={props.name}>
      <div className="u2-plan__head">
        <h2 className="u2-admin__h2">{props.name}</h2>
        {props.isCurrent && (
          <span className="u2-chip">
            <Trans id="ui2.admin.billing.current">Current</Trans>
          </span>
        )}
      </div>
      <p className="u2-plan__price">
        {props.price ? (
          <>
            <b>{props.price}</b>
            {props.period && <span className="u2-muted">/{props.period}</span>}
          </>
        ) : (
          " "
        )}
      </p>
      <p className="u2-admin__sub">{props.description}</p>
      {props.onButtonClick ? (
        <Button variant={props.buttonVariant} onClick={props.onButtonClick} disabled={props.isLoading} loading={props.isLoading}>
          {props.buttonText}
        </Button>
      ) : showCurrentLabel ? (
        <p className="u2-plan__now">
          <Trans id="ui2.admin.billing.currentplan">Current Plan</Trans>
        </p>
      ) : null}
      <ul className="u2-plan__list">
        {props.features.map((f) => (
          <li key={f.text} className={f.isNegative ? "is-neg" : undefined}>
            <span aria-hidden="true">{f.isNegative ? "×" : "✓"}</span>
            {f.onClick ? (
              <button type="button" className="u2-plan__link" onClick={f.onClick}>
                {f.text}
              </button>
            ) : (
              <span>{f.text}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

const ManageBillingPage = (props: ManageBillingPageProps) => {
  const [isLoading, setIsLoading] = useState(false)
  const { isPaddleCustomer, displayAsPro } = billingState(props)
  const t = (id: string, message: string) => i18n._({ id, message })

  const go = (url: string) => async () => {
    setIsLoading(true)
    const result = await http.post<{ url: string }>(url)
    if (result.ok) {
      window.location.href = result.data.url
    } else {
      setIsLoading(false)
    }
  }
  const openPortal = go("/_api/admin/billing/portal")
  const startCheckout = go("/_api/admin/billing/checkout")
  const startAnnualCheckout = go("/_api/admin/billing/checkout/annual")

  const freeFeatures: PlanFeature[] = [
    { text: t("ui2.admin.billing.free1", "250 suggestions") },
    { text: t("ui2.admin.billing.free2", "Unlimited voters") },
    { text: t("ui2.admin.billing.free3", "Your own subdomain or custom domain") },
    { text: t("ui2.admin.billing.free4", "All core functionality") },
  ]
  const proFeatures: PlanFeature[] = [
    { text: t("ui2.admin.billing.pro1", "Everything in free") },
    { text: t("ui2.admin.billing.pro2", "Unlimited suggestions") },
    { text: t("ui2.admin.billing.pro3", "Content moderation") },
    { text: t("ui2.admin.billing.pro4", "Search engine indexing") },
    // With a Stripe subscription, annual billing is a change to it in the portal: a new checkout
    // would start a second subscription (the server refuses that too).
    { text: t("ui2.admin.billing.annual", "Option to pay annually"), onClick: props.stripeSubscriptionID ? openPortal : startAnnualCheckout },
  ]
  const legacyFeatures: PlanFeature[] = [
    { text: t("ui2.admin.billing.legacy1", "Same features as Pro") },
    { text: t("ui2.admin.billing.legacy2", "More expensive"), isNegative: true },
    { text: t("ui2.admin.billing.legacy3", "Billing management not supported"), isNegative: true },
  ]

  return (
    <AdminLayout
      name="billing"
      title={<Trans id="ui2.admin.billing.title">Billing</Trans>}
      subtitle={<Trans id="ui2.admin.billing.sub">Manage your subscription and billing</Trans>}
    >
      <p>
        <Trans id="ui2.admin.billing.intro">Upvora is free forever. But if you need advanced features and support, consider upgrading to Pro.</Trans>
      </p>
      {isPaddleCustomer && (
        <div className="u2-admin__note" role="note" data-testid="u2-paddle">
          <b>
            <Trans id="ui2.admin.billing.migration">Migration to Stripe Billing</Trans>
          </b>{" "}
          <Trans id="ui2.admin.billing.migrationtext">
            You&apos;re currently entitled to pro features because of your existing subscription. Switch to our new Stripe billing to manage your subscription
            and save money.
          </Trans>
        </div>
      )}
      <div className="u2-plans">
        <PlanCard
          name={t("ui2.admin.billing.free", "Free")}
          price="$0"
          period={t("ui2.admin.billing.month", "month")}
          description={t("ui2.admin.billing.freed", "Perfect for getting started with feedback collection.")}
          features={freeFeatures}
          isCurrent={!displayAsPro && !isPaddleCustomer}
          buttonText={t("ui2.admin.billing.downgrade", "Downgrade")}
          buttonVariant="secondary"
          onButtonClick={displayAsPro ? openPortal : undefined}
          isLoading={isLoading && displayAsPro}
        />
        {isPaddleCustomer && (
          <PlanCard
            name={t("ui2.admin.billing.legacy", "Legacy Pro")}
            description={t("ui2.admin.billing.legacyd", "Your current plan from our previous billing system.")}
            features={legacyFeatures}
            isCurrent={true}
            buttonText={t("ui2.admin.billing.currentplan", "Current Plan")}
            buttonVariant="secondary"
            isLoading={false}
          />
        )}
        <PlanCard
          name={t("ui2.admin.billing.pro", "Pro")}
          price="$25"
          period={t("ui2.admin.billing.month", "month")}
          description={t("ui2.admin.billing.prod", "For teams that need advanced features and support.")}
          features={proFeatures}
          isCurrent={displayAsPro}
          isHighlighted={true}
          buttonText={
            displayAsPro
              ? t("ui2.admin.billing.manage", "Manage Billing")
              : isPaddleCustomer
                ? t("ui2.admin.billing.switch", "Switch to new Pro Plan")
                : t("ui2.admin.billing.upgrade", "Upgrade to Pro")
          }
          buttonVariant="primary"
          onButtonClick={displayAsPro ? openPortal : startCheckout}
          isLoading={isLoading}
        />
      </div>
    </AdminLayout>
  )
}

export default ManageBillingPage

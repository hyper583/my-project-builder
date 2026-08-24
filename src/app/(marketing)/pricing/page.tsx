import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Check, Smartphone, CreditCard } from "lucide-react";

import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { Button } from "@/components/ui/button";
import { PASS_ALLOWANCE, PLANS, formatPassPrice } from "@/config/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "One payment for one project. Read your first chapter free, then unlock the rest.",
};

/**
 * What it costs, and what you get for it.
 *
 * Every figure on this page is read from `@/config/plans` rather than typed
 * into the copy. A hardcoded "₦25,000" here is a promise the checkout knows
 * nothing about, and the two would drift the first time the price moved.
 *
 * The order of the two cards is deliberate: free first, because it is the thing
 * a student can act on immediately, and because the offer only makes sense
 * after they have read a chapter written about their own topic.
 */
export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
          <div className="max-w-2xl">
            <p className="label-caps">Pricing</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.022em] sm:text-5xl">
              One payment, for one project
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Not a subscription. Nothing renews, nothing expires, and there is nothing
              to cancel — you pay once for the project you are writing, and take as long
              over it as you need.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <Card
              name="Start free"
              price="Free"
              priceNote="No card required"
              summary="See the product write about your own topic before you decide anything."
              features={[
                "Chapter One, written on your topic and yours to read in full",
                "Real published sources found for your subject",
                `Up to ${PLANS.FREE.maxProjects} projects`,
                "Upload your own material and work with the assistant",
              ]}
              cta={
                <Button asChild variant="outline" className="mt-7 w-full">
                  <Link href="/register">
                    Create an account
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              }
            />

            <Card
              featured
              name="Project pass"
              price={formatPassPrice()}
              priceNote="Paid once, for one project"
              summary="Unlocks the whole project — every chapter written, and the document to hand in."
              features={[
                "Every chapter written, from Chapter One to your conclusion",
                `${PASS_ALLOWANCE.maxGenerations} generation runs, so you can change direction`,
                `${PASS_ALLOWANCE.maxEdits} AI editing actions across the project`,
                "Download as Word and PDF, formatted, numbered and referenced",
                "Never expires — finish over a weekend or a semester",
              ]}
              cta={
                <Button asChild className="mt-7 w-full">
                  <Link href="/register">
                    Get started
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              }
            />
          </div>

          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            A pass is bought from inside a project, once you have read your first chapter
            and know what you are buying.
          </p>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 sm:py-16">
            <h2 className="text-2xl font-semibold tracking-[-0.018em]">Ways to pay</h2>
            <p className="mt-2 max-w-2xl leading-relaxed text-muted-foreground">
              Payments are handled by Paystack. You do not need a card.
            </p>

            <div className="mt-8 grid gap-5 sm:grid-cols-3">
              <Method
                icon={<Building2 className="size-5" aria-hidden="true" />}
                name="Bank transfer"
                body="You get a one-time account number to send to from your banking app. It confirms in seconds."
              />
              <Method
                icon={<Smartphone className="size-5" aria-hidden="true" />}
                name="USSD"
                body="Pay from your phone with a short code. No app and no data connection needed."
              />
              <Method
                icon={<CreditCard className="size-5" aria-hidden="true" />}
                name="Card"
                body="Any Nigerian debit card, and international cards where your bank allows them."
              />
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-[-0.018em]">Questions</h2>
          <dl className="mt-8 space-y-7">
            <Question q="Is this a subscription?">
              No. A pass is a single payment covering a single project. Nothing renews and
              there is no account to cancel — if you write a second project later, that is
              a second pass.
            </Question>
            <Question q="What do I actually get for free?">
              Your first chapter, written on the topic you gave us and using sources we
              found for it. It is a real chapter, not a preview — you can read all of it,
              edit it, and keep it.
            </Question>
            <Question q="Does the pass expire?">
              No. Final-year projects take months, and a deadline on what you have paid for
              would punish exactly the people doing the work.
            </Question>
            <Question q="Will it invent my results?">
              No, and this is the one thing the product will not do. Chapters that report
              your own findings are laid out with every place your data belongs marked, for
              you to fill in. Fabricated results are what gets a project failed.
            </Question>
            <Question q="Can I get a refund?">
              If a pass was charged and your project was not unlocked, email us and we will
              put it right. Beyond that, a pass that has been spent on a written project is
              not refundable — which is why the first chapter is free to read first.
            </Question>
          </dl>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function Card({
  name,
  price,
  priceNote,
  summary,
  features,
  cta,
  featured = false,
}: {
  name: string;
  price: string;
  priceNote: string;
  summary: string;
  features: string[];
  cta: React.ReactNode;
  featured?: boolean;
}) {
  return (
    <div
      className={`flex flex-col rounded-xl border bg-card p-7 sm:p-8 ${
        featured ? "border-primary/45 elevated-2" : "border-border elevated-1"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-[-0.012em]">{name}</h2>
        {featured ? (
          <span className="label-caps rounded-full bg-primary-subtle px-2.5 py-1 text-primary">
            Full project
          </span>
        ) : null}
      </div>

      <p className="mt-5 text-4xl font-semibold tracking-[-0.022em] tabular">{price}</p>
      <p className="mt-1 text-sm text-muted-foreground">{priceNote}</p>

      <p className="mt-5 leading-relaxed text-muted-foreground">{summary}</p>

      <ul className="mt-6 flex-1 space-y-3 border-t border-border pt-6">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm leading-relaxed">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            {feature}
          </li>
        ))}
      </ul>

      {cta}
    </div>
  );
}

function Method({
  icon,
  name,
  body,
}: {
  icon: React.ReactNode;
  name: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex size-10 items-center justify-center rounded-md bg-muted text-primary">
        {icon}
      </div>
      <h3 className="mt-4 font-semibold tracking-[-0.01em]">{name}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function Question({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold tracking-[-0.01em]">{q}</dt>
      <dd className="mt-2 leading-relaxed text-muted-foreground">{children}</dd>
    </div>
  );
}

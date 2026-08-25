import type { Metadata } from "next";
import Link from "next/link";

import { Clause, LegalPage, Points } from "@/components/marketing/legal-page";
import { LEGAL } from "@/config/legal";
import { formatPassPrice } from "@/config/plans";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "When a project pass is refunded, and when it is not.",
};

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refund Policy"
      summary="When we refund a project pass, when we do not, and how to ask."
    >
      <Clause heading="The short version">
        <p>
          If you paid and did not get what you paid for, we will put it right. If you paid and
          the project was written, the pass has been used and is not refundable — which is
          exactly why the first chapter is free to read before you decide.
        </p>
      </Clause>

      <Clause heading="1. What a pass buys">
        <p>
          A project pass costs {formatPassPrice()}, is paid once, and covers one project: every
          chapter written, a set number of generation runs and AI editing actions, and the
          finished document to download. It does not expire.
        </p>
      </Clause>

      <Clause heading="2. When we refund in full">
        <Points
          items={[
            "You were charged and no pass appeared on your account.",
            "You were charged more than once for the same project.",
            "The pass was applied to the wrong project through a fault of ours.",
            "A fault on our side stopped your project being written, and we could not fix it.",
          ]}
        />
        <p>
          In each of these you have paid and not received the thing you paid for. Write to us
          and we will refund the payment in full.
        </p>
      </Clause>

      <Clause heading="3. When we do not refund">
        <Points
          items={[
            "The project was generated and you have read it. The work has been done and the cost of doing it has been incurred.",
            "You changed your mind, or changed topic, after generating.",
            "You are unhappy with a grade, or with a supervisor's response to your project.",
            "You did not supply the data the project asked for, so chapters that report your own findings are still marked as needing it.",
            "Your institution's rules did not permit the use you made of the service.",
          ]}
        />
        <p>
          This is why every account can have a first chapter written for free, on its own topic,
          and read in full. That chapter exists so you can judge the quality of the writing
          before any money changes hands. Please use it.
        </p>
      </Clause>

      <Clause heading="4. A payment that never arrived">
        <p>
          Bank transfers occasionally take a minute or two to confirm. If you paid and your
          project is still locked, open the payment confirmation page again before doing
          anything else — it re-checks with Paystack and applies the pass as soon as the money
          lands.
        </p>
        <p>
          If it is still locked after ten minutes, write to us with your transaction reference
          rather than paying a second time.
        </p>
      </Clause>

      <Clause heading="5. How to ask">
        <p>
          Write to {LEGAL.contactEmail} from the email address on your account, within 14 days
          of the payment, and include:
        </p>
        <Points
          items={[
            "Your Paystack transaction reference, from your receipt.",
            "The name of the project.",
            "What went wrong.",
          ]}
        />
        <p>
          We aim to reply within 3 working days. An approved refund goes back to the account you
          paid from; how long it takes to appear is up to your bank, and is usually 5 to 10
          working days.
        </p>
      </Clause>

      <Clause heading="6. If we cannot agree">
        <p>
          Tell us why you think the decision is wrong and a human will look at it again. Nothing
          in this policy affects the rights you have under the consumer law of{" "}
          {LEGAL.jurisdiction}, and nothing here prevents you raising the matter with your bank
          or with Paystack.
        </p>
        <p>
          This policy sits alongside our{" "}
          <Link href="/terms" className="text-primary underline underline-offset-4">
            terms of service
          </Link>
          .
        </p>
      </Clause>
    </LegalPage>
  );
}

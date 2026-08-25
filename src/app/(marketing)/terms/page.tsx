import type { Metadata } from "next";
import Link from "next/link";

import { Clause, LegalPage, Points } from "@/components/marketing/legal-page";
import { LEGAL } from "@/config/legal";
import { PASS_ALLOWANCE, formatPassPrice } from "@/config/plans";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The agreement between you and My Project Builder.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      summary={`The agreement between you and ${LEGAL.operator} for the use of ${LEGAL.serviceName}.`}
    >
      <Clause heading="1. Who you are agreeing with">
        <p>
          {LEGAL.serviceName} is operated by {LEGAL.operator}, of {LEGAL.address}. In these
          terms &quot;we&quot; and &quot;us&quot; mean that operator, and &quot;you&quot; means
          the person using the service. You can reach us at {LEGAL.contactEmail}.
        </p>
        <p>
          By creating an account you accept these terms. If you do not accept them, do not
          create an account.
        </p>
      </Clause>

      <Clause heading="2. What the service does">
        <p>
          {LEGAL.serviceName} is a writing and organisation tool for academic projects. It
          helps you plan a project, find published sources, draft prose, keep your formatting
          consistent, and export a finished document.
        </p>
        <p>
          Text is produced with the assistance of an AI model. You direct it, you edit it, and
          the finished work is yours.
        </p>
      </Clause>

      <Clause heading="3. What the service will not do">
        <p>
          This is a limit on the product, not a disclaimer about it. The service does not
          invent research results, participants, response rates, test statistics or findings.
          Where a chapter reports data that only you can supply, it is laid out with every
          place your figures belong marked for you to fill in, rather than filled with numbers
          nobody measured.
        </p>
        <p>
          Sources are retrieved from published academic literature. The service does not
          fabricate citations or bibliographic details, and where a citation cannot be verified
          it says so rather than inventing one.
        </p>
      </Clause>

      <Clause heading="4. Academic integrity is your responsibility">
        <p>
          Universities differ, sometimes sharply, in what assistance they permit. It is your
          responsibility to know your institution&apos;s rules on AI assistance and to comply
          with them, including any requirement to declare the tools you used.
        </p>
        <p>
          You are the author of your project. You must read, verify and take ownership of
          everything you submit — including checking that every source cited says what the
          draft claims it says. We cannot know what your department allows, and nothing in this
          service should be read as telling you that any particular use is permitted by it.
        </p>
        <p>
          The sample project is an illustration of how a finished project is organised. Its
          findings are invented for that purpose and it must not be submitted as academic work.
          Every export of it is watermarked accordingly.
        </p>
      </Clause>

      <Clause heading="5. Accounts">
        <Points
          items={[
            "You must give an email address you control, and keep your password to yourself.",
            "One account per person. Do not share an account or your login details.",
            "You are responsible for what happens under your account.",
            "Tell us promptly if you believe someone else has access to it.",
          ]}
        />
      </Clause>

      <Clause heading="6. Project passes and payment">
        <p>
          A project pass costs {formatPassPrice()} and is a single payment covering a single
          project. It is not a subscription: nothing renews, nothing is billed again, and there
          is nothing to cancel.
        </p>
        <Points
          items={[
            <>
              A pass covers one project. It includes {PASS_ALLOWANCE.maxGenerations} generation
              runs and {PASS_ALLOWANCE.maxEdits} AI editing actions for that project, and
              permits export of the finished document.
            </>,
            "A pass does not expire, and its allowance does not renew.",
            "Once spent on a project, a pass cannot be moved to a different one.",
            "Passes are personal to your account and cannot be sold or transferred.",
            <>
              Refunds are covered by our <Link href="/refunds" className="text-primary underline underline-offset-4">refund policy</Link>.
            </>,
          ]}
        />
        <p>
          Payments are processed by Paystack. We never see or store your card details. Prices
          are shown in Nigerian Naira and include any applicable tax unless stated otherwise.
        </p>
      </Clause>

      <Clause heading="7. Free use">
        <p>
          Free accounts may have the first chapter of a project written, so that you can see
          the service work on your own topic before deciding whether to pay. The number of free
          projects per account is limited, and we may change that limit. Free projects cannot
          be exported.
        </p>
      </Clause>

      <Clause heading="8. Acceptable use">
        <p>You agree not to:</p>
        <Points
          items={[
            "Use the service to produce work you will present in a way your institution forbids.",
            "Upload material you do not have the right to use.",
            "Attempt to access another user's projects or account.",
            "Probe, overload or interfere with the service or the systems it runs on.",
            "Resell access, or use the service to operate a project-writing business for others.",
            "Use automated means to extract generated content in bulk.",
          ]}
        />
        <p>
          We may suspend or close an account that breaches these terms. Where we can, we will
          tell you why.
        </p>
      </Clause>

      <Clause heading="9. Your content">
        <p>
          Your projects, your uploaded material and the text produced for you remain yours. We
          claim no ownership of them.
        </p>
        <p>
          You grant us only the permission needed to run the service: to store your content, to
          process it, and to send the relevant parts to the AI provider and other processors
          described in our{" "}
          <Link href="/privacy" className="text-primary underline underline-offset-4">
            privacy policy
          </Link>
          . We do not use your project content to train AI models.
        </p>
      </Clause>

      <Clause heading="10. Availability">
        <p>
          We aim to keep the service running and your work safe, but we do not promise
          uninterrupted availability. Maintenance, provider outages and faults happen. Keep your
          own copy of work that matters to you — exporting a finished chapter is the simplest
          way to do that.
        </p>
      </Clause>

      <Clause heading="11. No guarantee about your results">
        <p>
          We do not guarantee any grade, mark, approval, or acceptance of your project by a
          supervisor, department or institution. Academic judgement belongs to your university,
          and the quality of a project depends on the work you put into it.
        </p>
      </Clause>

      <Clause heading="12. Limits on our liability">
        <p>
          The service is provided as it is. To the extent the law allows, we are not liable for
          indirect or consequential loss, for lost marks or academic opportunity, or for loss
          of data where you have not kept your own copy.
        </p>
        <p>
          Nothing in these terms limits liability that cannot lawfully be limited. Where we are
          liable, our total liability to you is limited to the amount you have paid us in the
          twelve months before the claim.
        </p>
      </Clause>

      <Clause heading="13. Changes">
        <p>
          We may change these terms as the service changes. The date at the top shows when they
          last changed. If a change materially affects you we will make a reasonable effort to
          tell you. Continuing to use the service after a change means you accept the revised
          terms; a pass you have already bought keeps the allowance it was sold with.
        </p>
      </Clause>

      <Clause heading="14. Ending the agreement">
        <p>
          You may stop using the service and close your account at any time. Closing an account
          does not by itself entitle you to a refund — see the refund policy. We may end this
          agreement if you breach these terms.
        </p>
      </Clause>

      <Clause heading="15. Governing law">
        <p>
          These terms are governed by the laws of {LEGAL.jurisdiction}, and its courts have
          jurisdiction over any dispute.
        </p>
      </Clause>
    </LegalPage>
  );
}

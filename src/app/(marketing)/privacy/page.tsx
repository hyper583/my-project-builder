import type { Metadata } from "next";

import { Clause, LegalPage, Points } from "@/components/marketing/legal-page";
import { LEGAL } from "@/config/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What My Project Builder collects, why, and who else sees it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary="What we collect, why we collect it, and every other company that touches it."
    >
      <Clause heading="1. Who handles your data">
        <p>
          {LEGAL.operator}, of {LEGAL.address}, is the data controller for {LEGAL.serviceName}.
          For any question about your data, or to make any of the requests in section 7, write
          to {LEGAL.contactEmail}.
        </p>
        <p>
          If you are in Nigeria, the Nigeria Data Protection Act 2023 applies to this
          processing. If you are in the UK or the EU, the UK GDPR or GDPR applies.
        </p>
      </Clause>

      <Clause heading="2. What we collect">
        <p>
          <strong className="font-medium text-foreground">Your account.</strong> Your name and
          email address, and a cryptographic hash of your password — never the password itself.
          If you sign in with Google we receive your name, email address and profile picture
          from Google; we never receive your Google password.
        </p>
        <p>
          <strong className="font-medium text-foreground">Your project.</strong> Everything you
          enter or produce: your topic, your institution and department, your supervisor&apos;s
          instructions, the chapters written for you, your own edits, and any documents you
          upload as sources.
        </p>
        <p>
          <strong className="font-medium text-foreground">Your use of the service.</strong>{" "}
          Records of generation runs and AI editing actions, including how many tokens each
          used. These are what our allowances are counted against, and they are how we know
          what the service costs to run.
        </p>
        <p>
          <strong className="font-medium text-foreground">Payments.</strong> The amount, the
          currency, the transaction reference and the outcome. We never see or store your card
          number, PIN, CVV or bank credentials — those go directly to Paystack.
        </p>
        <p>
          <strong className="font-medium text-foreground">Security records.</strong> Sessions,
          and an audit log of significant events such as registration, administrative actions
          and pass purchases.
        </p>
      </Clause>

      <Clause heading="3. Why we are allowed to hold it">
        <Points
          items={[
            "To perform our contract with you — running your account, writing and storing your project, and taking payment for a pass.",
            "For our legitimate interests — keeping the service secure, preventing abuse of free allowances, diagnosing faults, and understanding what the service costs to operate.",
            "To meet legal obligations — keeping records of payments where the law requires it.",
          ]}
        />
      </Clause>

      <Clause heading="4. Who else sees it">
        <p>
          Running this service means using other companies. Each receives only what its job
          requires:
        </p>
        <Points
          items={[
            <>
              <strong className="font-medium text-foreground">Anthropic</strong> — receives your
              project details and the relevant parts of your text in order to write and edit it.
              This is the one processor that sees your project content, and it is unavoidable:
              it is the service.
            </>,
            <>
              <strong className="font-medium text-foreground">Supabase</strong> — hosts the
              database holding your account and your project, and stores your uploaded files and
              exported documents.
            </>,
            <>
              <strong className="font-medium text-foreground">Paystack</strong> — processes
              payments and holds your card details. We receive only the result.
            </>,
            <>
              <strong className="font-medium text-foreground">Resend</strong> — sends
              transactional email, so it processes your email address and the contents of those
              messages.
            </>,
            <>
              <strong className="font-medium text-foreground">Google</strong> — only if you
              choose to sign in with Google.
            </>,
            <>
              <strong className="font-medium text-foreground">OpenAlex and Crossref</strong> —
              public academic databases queried to find real published sources for your topic.
              We send search terms derived from your topic, not your written text.
            </>,
          ]}
        />
        <p>
          We do not sell your data, and we do not share it for advertising. Some of these
          providers operate outside Nigeria, so your data may be processed abroad under the
          safeguards those providers offer.
        </p>
      </Clause>

      <Clause heading="5. Your project is not training data">
        <p>
          We do not use your projects, your uploaded sources or your writing to train AI models,
          and we do not permit our AI provider to do so with content sent through our API
          account.
        </p>
      </Clause>

      <Clause heading="6. How long we keep it">
        <Points
          items={[
            "Your project stays until you delete it, or until you close your account.",
            "Deleting a project hides it from you immediately and removes it from our systems afterwards. Records that a generation happened, and what it cost, are kept without your project text — they are how free allowances stay bounded.",
            "Payment records are kept as long as tax and accounting rules require.",
            "Audit and security records are kept for a limited period and then removed.",
          ]}
        />
      </Clause>

      <Clause heading="7. Your rights">
        <p>You can ask us to:</p>
        <Points
          items={[
            "Give you a copy of the personal data we hold about you.",
            "Correct anything inaccurate.",
            "Delete your account and your projects.",
            "Restrict or object to certain processing.",
            "Withdraw consent where our processing relies on it.",
          ]}
        />
        <p>
          Write to {LEGAL.contactEmail} and we will respond within the period the law allows. If
          you are not satisfied, you may complain to the Nigeria Data Protection Commission, or
          to your local supervisory authority if you are outside Nigeria.
        </p>
      </Clause>

      <Clause heading="8. Security">
        <p>
          Passwords are hashed, never stored in a readable form. Access to your projects is
          checked against your account on every request. Uploaded files are held in private
          storage that is not publicly reachable. Payment credentials never reach our servers.
        </p>
        <p>
          No service can promise perfect security. Keep a copy of work that matters to you, and
          tell us at {LEGAL.contactEmail} if you suspect a problem with your account.
        </p>
      </Clause>

      <Clause heading="9. Cookies">
        <p>
          We set a cookie to keep you signed in, and one to remember whether you prefer the
          light or dark theme. There is no advertising or third-party tracking, so there is
          nothing here to opt out of.
        </p>
      </Clause>

      <Clause heading="10. Children">
        <p>
          The service is intended for students in higher education and is not directed at
          children under 13. If you believe a child has given us personal data, write to{" "}
          {LEGAL.contactEmail} and we will remove it.
        </p>
      </Clause>

      <Clause heading="11. Changes">
        <p>
          If this policy changes, the date at the top will change with it. Where a change
          materially affects how we handle your data, we will make a reasonable effort to tell
          you rather than relying on you to re-read this page.
        </p>
      </Clause>
    </LegalPage>
  );
}

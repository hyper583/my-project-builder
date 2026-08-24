import type { Metadata } from "next";

import { PassReturn } from "@/components/payments/pass-return";
import { requireUser } from "@/server/dal/session";
import { grantPassForReference, type GrantOutcome } from "@/server/services/payments/grant";

export const metadata: Metadata = { title: "Payment" };

/**
 * Where Paystack sends a student who bought a spare pass rather than one for a
 * particular project.
 *
 * The same machinery as the per-project return page, and the same reason for
 * existing: it is what completes a payment when no webhook can reach the
 * server. The difference is only where it sends them afterwards — a pass bought
 * from Settings is left unclaimed, because nothing has said which project it is
 * for, and spending it is the student's choice to make.
 */
export default async function SettingsPassReturnPage({
  searchParams,
}: PageProps<"/settings/pass/return">) {
  // Signed in, so an anonymous visitor is sent to login rather than shown a
  // payment result page.
  await requireUser();

  const query = await searchParams;

  const reference =
    typeof query.reference === "string"
      ? query.reference
      : typeof query.trxref === "string"
        ? query.trxref
        : null;

  let outcome: GrantOutcome | { status: "missing" };
  if (!reference) {
    outcome = { status: "missing" };
  } else {
    try {
      outcome = await grantPassForReference(reference);
    } catch (error) {
      console.error("[pass-return] could not verify", error);
      outcome = { status: "pending" };
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-10 sm:px-8 sm:py-16">
      <PassReturn
        outcome={outcome}
        continueHref="/projects"
        continueLabel="Choose a project"
        recheckHref={`/settings/pass/return?reference=${encodeURIComponent(reference ?? "")}`}
      />
    </div>
  );
}

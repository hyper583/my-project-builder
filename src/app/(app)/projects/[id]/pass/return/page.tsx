import type { Metadata } from "next";

import { PassReturn } from "@/components/payments/pass-return";
import { requireProject } from "@/server/dal/projects";
import { grantPassForReference, type GrantOutcome } from "@/server/services/payments/grant";

export const metadata: Metadata = { title: "Payment" };

/**
 * Where Paystack sends a student after paying for one project's pass.
 *
 * This page grants, it does not merely report. That is the important part: on a
 * development machine Paystack's webhook cannot reach us at all, so without
 * this the payment would succeed and the project would stay locked forever. In
 * production it is the fallback that covers a slow or retried webhook.
 *
 * Granting from a page a student can simply navigate to is only safe because
 * nothing here trusts the URL. The reference is a lookup key, and the answer
 * about whether it was paid comes from Paystack. Opening this page with someone
 * else's reference grants that person their pass, not you yours — the owner is
 * read from the transaction's metadata, never from the session.
 */
export default async function PassReturnPage({
  params,
  searchParams,
}: PageProps<"/projects/[id]/pass/return">) {
  const { id } = await params;
  // Ownership, so this is not a way to probe references against arbitrary
  // project ids. It is also what puts a signed-out student through login first.
  await requireProject(id);

  const query = await searchParams;

  // Paystack sends both, and which one depends on the flow. `reference` is ours
  // and `trxref` is theirs; they carry the same value in every case seen here,
  // but taking only one of them means a checkout variant that sends the other
  // arrives looking like a payment that never happened.
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
      // Paystack unreachable, or the database. The student has paid and must
      // not be told the payment failed, so this is reported as unsettled —
      // which is the outcome that invites them to look again.
      console.error("[pass-return] could not verify", error);
      outcome = { status: "pending" };
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-10 sm:px-8 sm:py-16">
      <PassReturn
        outcome={outcome}
        continueHref={`/projects/${id}/workspace`}
        continueLabel="Open your project"
        recheckHref={`/projects/${id}/pass/return?reference=${encodeURIComponent(reference ?? "")}`}
      />
    </div>
  );
}

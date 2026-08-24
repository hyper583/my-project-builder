import { Check, Lock } from "lucide-react";

import { BuyPassButton } from "@/components/payments/buy-pass-button";
import { PASS_ALLOWANCE, formatPassPrice } from "@/config/plans";

/**
 * What stands in the document pane where a locked chapter's prose would be.
 *
 * It names the chapter and lists what buying releases, because a lock that only
 * says "locked" reads as a fault in the product. The student has just finished
 * reading a chapter written about their own topic; this is the moment the offer
 * makes sense, and it should look like an offer rather than an error.
 *
 * There is no prose behind this card to reveal. A free project's later chapters
 * are never generated, so this is not a curtain over finished text — it is an
 * accurate description of work that has not been done yet.
 */
export function LockedSection({
  projectId,
  sectionTitle,
  sectionNumber,
}: {
  projectId: string;
  sectionTitle: string;
  sectionNumber: string | null;
}) {
  const included = [
    "Every remaining chapter, written on your topic",
    `${PASS_ALLOWANCE.maxGenerations} generation runs and ${PASS_ALLOWANCE.maxEdits} AI editing actions`,
    "Download as Word and PDF, formatted and referenced",
    "One project, paid once — it does not expire",
  ];

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-6 sm:p-10">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 elevated-1 sm:p-8">
        <div className="flex size-11 items-center justify-center rounded-full border border-border bg-muted">
          <Lock className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>

        <h2 className="mt-5 text-xl font-semibold tracking-[-0.018em]">
          {[sectionNumber, sectionTitle].filter(Boolean).join(" ")} is part of a project pass
        </h2>

        <p className="mt-2.5 leading-relaxed text-muted-foreground">
          Your first chapter is written and yours to keep. A pass writes the rest of the
          project the same way — on your topic, from your sources — and lets you download
          the finished document.
        </p>

        <ul className="mt-5 space-y-2.5 border-t border-border pt-5">
          {included.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed">
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>

        <BuyPassButton
          projectId={projectId}
          label={`Unlock this project — ${formatPassPrice()}`}
          className="mt-6"
        />

        <p className="mt-3.5 text-sm text-muted-foreground">
          Pay by bank transfer, USSD or card.
        </p>
      </div>
    </div>
  );
}

import Link from "next/link";
import { Check } from "lucide-react";

import { WIZARD_PHASES, WIZARD_STEPS, phaseForStep } from "@/lib/wizard-steps";

/**
 * The setup rail.
 *
 * Nine steps in a wrapped row of equal chips tells a student nothing about
 * where they are. Four named phases, with only the one they are in opened out,
 * tells them both — and it is the blueprint being drawn up in order.
 *
 * The routes underneath are unchanged: every step is still its own URL, still
 * autosaves, still resumes. This is entirely a matter of how the same nine
 * links are arranged.
 *
 * `hasContent` is derived by the page from the loaded project rather than
 * stored, so the rail can never claim a step is done after its content was
 * cleared. It marks "has something", never "is correct" — every field in the
 * wizard is optional, so there is no such thing as an invalid step.
 */
export function WizardRail({
  projectId,
  step,
  hasContent,
}: {
  projectId: string;
  step: number;
  hasContent: Record<number, boolean>;
}) {
  const activePhase = phaseForStep(step);

  return (
    <nav aria-label="Setup steps" className="lg:sticky lg:top-20 lg:self-start">
      <ol className="space-y-0.5">
        {WIZARD_PHASES.map((phase) => {
          const steps = phase.steps as readonly number[];
          const open = phase.number === activePhase.number;
          const done = steps.filter((number) => hasContent[number]).length;
          const complete = done === steps.length;

          return (
            <li key={phase.number}>
              <PhaseHeading
                projectId={projectId}
                phase={phase}
                open={open}
                done={done}
                total={steps.length}
                complete={complete}
              />

              {/*
               * Progressive disclosure: only the phase being worked on lists
               * its steps. The rest stay one line each, so the whole shape of
               * the setup is visible at once instead of nine chips wrapping.
               *
               * A collapsed phase is not unreachable — its heading is itself a
               * link to its first step, which opens it.
               */}
              {open ? (
                <ul className="mt-0.5 mb-2 ml-[0.4375rem] space-y-0.5 border-l border-border pl-3">
                  {steps.map((number) => (
                    <StepLink
                      key={number}
                      projectId={projectId}
                      number={number}
                      label={WIZARD_STEPS[number - 1]!.label}
                      current={number === step}
                      filled={hasContent[number] ?? false}
                    />
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function PhaseHeading({
  projectId,
  phase,
  open,
  done,
  total,
  complete,
}: {
  projectId: string;
  phase: (typeof WIZARD_PHASES)[number];
  open: boolean;
  done: number;
  total: number;
  complete: boolean;
}) {
  const content = (
    <>
      <span
        className={`mono text-[0.6875rem] font-medium tabular-nums ${
          open ? "text-primary" : complete ? "text-success" : "text-subtle-foreground"
        }`}
      >
        {phase.number}
      </span>
      <span
        className={`text-[0.6875rem] font-semibold tracking-[0.08em] uppercase ${
          open ? "text-foreground" : "text-subtle-foreground"
        }`}
      >
        {phase.label}
      </span>
      {/* The count is the honest summary of a phase whose steps are folded. */}
      {open ? null : (
        <span
          className={`mono ml-auto text-[0.625rem] tabular-nums ${
            complete ? "text-success" : "text-subtle-foreground"
          }`}
        >
          {done}/{total}
        </span>
      )}
    </>
  );

  // The open phase's heading is not a link: it would point at a step already
  // listed directly beneath it, and a control that duplicates its neighbour is
  // one more thing to aim at for no gain.
  if (open) {
    return <div className="flex items-baseline gap-2.5 px-2 py-1.5">{content}</div>;
  }

  return (
    <Link
      href={`/projects/${projectId}/wizard/${phase.steps[0]}`}
      className="focus-glow flex items-baseline gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-muted"
    >
      {content}
      <span className="sr-only">
        {`— ${done} of ${total} steps started. Opens ${WIZARD_STEPS[phase.steps[0] - 1]!.label}.`}
      </span>
    </Link>
  );
}

function StepLink({
  projectId,
  number,
  label,
  current,
  filled,
}: {
  projectId: string;
  number: number;
  label: string;
  current: boolean;
  filled: boolean;
}) {
  return (
    <li>
      <Link
        href={`/projects/${projectId}/wizard/${number}`}
        aria-current={current ? "step" : undefined}
        className={`focus-glow relative flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.8125rem] transition-colors duration-150 ${
          current
            ? "bg-primary-subtle font-medium text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        {current ? (
          <span
            aria-hidden="true"
            className="absolute top-1.5 bottom-1.5 -left-[0.8125rem] w-0.5 rounded-full bg-primary"
          />
        ) : null}
        {filled ? (
          <Check className="size-3.5 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <span
            aria-hidden="true"
            className="size-3.5 shrink-0 rounded-full border border-border-strong"
          />
        )}
        <span className="truncate">{label}</span>
        <span className="sr-only">{filled ? "has content" : "not started"}</span>
      </Link>
    </li>
  );
}

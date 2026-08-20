/**
 * Wizard step definitions.
 *
 * Kept out of the "use server" actions module: a server-actions file may only
 * export async functions, so shared constants must live in a plain module.
 */
export const WIZARD_STEPS = [
  { step: 1, key: "institution", label: "Institution" },
  { step: 2, key: "project-type", label: "Project type" },
  { step: 3, key: "topic", label: "Project topic" },
  { step: 4, key: "research", label: "Research information" },
  { step: 5, key: "methodology", label: "Methodology" },
  { step: 6, key: "materials", label: "Existing materials" },
  { step: 7, key: "instructions", label: "Additional information" },
  { step: 8, key: "formatting", label: "Formatting" },
  { step: 9, key: "structure", label: "Project structure" },
] as const;

export const TOTAL_WIZARD_STEPS = WIZARD_STEPS.length;

/**
 * The four phases the nine steps are grouped into.
 *
 * Presentation only — the routes, the stored `wizardStep` and the autosave
 * contract are all still per-step. Nine equally-weighted chips in a wrapped
 * row give a student no sense of where they are or how much is left; four
 * named phases with the current one opened out do, and doing it in the rail
 * rather than in the routing means no migration and no resume logic to change.
 *
 * The grouping follows what is actually being asked for at each stage:
 * who you are, what you are studying, what you already have, what comes out.
 */
export const WIZARD_PHASES = [
  { number: "01", label: "Project", steps: [1, 2, 3] },
  { number: "02", label: "Research", steps: [4, 5] },
  { number: "03", label: "Materials", steps: [6, 7] },
  { number: "04", label: "Output", steps: [8, 9] },
] as const;

export type WizardPhase = (typeof WIZARD_PHASES)[number];

/** The phase a step belongs to. Every step is in exactly one. */
export function phaseForStep(step: number): WizardPhase {
  const found = WIZARD_PHASES.find((phase) => (phase.steps as readonly number[]).includes(step));
  // The phases cover 1..9 exhaustively; the fallback keeps the return type
  // honest rather than asserting non-null and crashing if that ever changes.
  return found ?? WIZARD_PHASES[0];
}

/** The label for a step number, for headings and titles. */
export function labelForStep(step: number): string {
  return WIZARD_STEPS[step - 1]?.label ?? "";
}

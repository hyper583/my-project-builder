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

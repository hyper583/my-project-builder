/**
 * Selection actions offered in the editor.
 *
 * Kept as data in a plain module (not a "use server" file, which may only
 * export async functions) so the UI and the server action share one list and
 * cannot drift apart.
 *
 * Each instruction is phrased to preserve the student's factual claims. None
 * of them may introduce data — the system prompt forbids it, and these
 * instructions are written so as not to invite it.
 */

export interface AiAction {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly instruction: string;
  /** Replaces the selection when true; shown as an answer when false. */
  readonly replaces: boolean;
}

export const AI_ACTIONS: readonly AiAction[] = [
  {
    key: "improve",
    label: "Improve writing",
    description: "Tighten the prose without changing what it says",
    instruction:
      "Improve the clarity and readability of this passage. Do not change any factual claim, figure or citation.",
    replaces: true,
  },
  {
    key: "academic",
    label: "Make more academic",
    description: "Raise the register to formal academic prose",
    instruction:
      "Rewrite this passage in formal academic register appropriate to a university project. Keep every factual claim exactly as stated.",
    replaces: true,
  },
  {
    key: "expand",
    label: "Expand",
    description: "Develop the point more fully",
    instruction:
      "Expand this passage, developing its existing argument more fully. Do not introduce new data, results or sources — if a claim would need evidence the student has not supplied, mark it with a [STUDENT DATA REQUIRED: ...] placeholder.",
    replaces: true,
  },
  {
    key: "shorten",
    label: "Shorten",
    description: "Say the same thing in fewer words",
    instruction:
      "Shorten this passage while keeping every substantive point, figure and citation.",
    replaces: true,
  },
  {
    key: "simplify",
    label: "Simplify",
    description: "Make it easier to follow",
    instruction:
      "Rewrite this passage in plainer language, keeping the academic register but reducing sentence complexity. Do not lose any factual content.",
    replaces: true,
  },
  {
    key: "rephrase",
    label: "Rephrase",
    description: "Say it a different way",
    instruction: "Rephrase this passage in different words while preserving its exact meaning.",
    replaces: true,
  },
  {
    key: "grammar",
    label: "Fix grammar",
    description: "Correct grammar and punctuation only",
    instruction:
      "Correct only the grammar, spelling and punctuation of this passage. Change nothing else — not the wording, the structure, or the claims.",
    replaces: true,
  },
  {
    key: "flow",
    label: "Improve flow",
    description: "Smooth the transitions between sentences",
    instruction:
      "Improve how this passage flows between sentences and paragraphs. Keep all content and claims intact.",
    replaces: true,
  },
  {
    key: "transition",
    label: "Create transition",
    description: "Write a bridge to the next section",
    instruction:
      "Write a short transitional passage that leads from this text into the next section of the chapter. Return only the transition.",
    replaces: false,
  },
  {
    key: "explain",
    label: "Explain",
    description: "Explain what this passage means",
    instruction:
      "Explain what this passage says and why it matters to the project, in plain language. Do not rewrite it.",
    replaces: false,
  },
  {
    key: "requirements",
    label: "Compare with project requirements",
    description: "Check it against the supervisor and department instructions",
    instruction:
      "Compare this passage against the project's stated requirements, supervisor instructions and departmental requirements shown in the context. List specifically where it does and does not comply. Do not rewrite it.",
    replaces: false,
  },
  {
    key: "citation",
    label: "Check citation",
    description: "Check citations against the student's own sources",
    instruction:
      "Check the citations in this passage against the student's uploaded sources shown above. Say which are supported by those sources and which are not. Never invent bibliographic details — if a citation cannot be verified from the supplied material, say so and mark it [CITATION NEEDS REVIEW].",
    replaces: false,
  },
] as const;

export function findAiAction(key: string): AiAction | undefined {
  return AI_ACTIONS.find((action) => action.key === key);
}

/**
 * Tracked "student data required" markers.
 *
 * The pattern lives here alone. It previously existed in three copies — the
 * editor's autosave, the generation pipeline and the export document model —
 * and a marker format is exactly the kind of thing that drifts silently: one
 * copy falling out of step would stop counting placeholders on that path
 * without failing, and the whole point of the markers is that missing real
 * data stays measurable rather than being quietly filled in.
 */

/** Global and case-insensitive; callers must reset `lastIndex` or use `matchAll`. */
export const PLACEHOLDER_PATTERN = /\[STUDENT DATA REQUIRED:\s*([^\]]+)\]/gi;

/** The label stored against every tracked marker. */
export const PLACEHOLDER_LABEL = "STUDENT DATA REQUIRED";

/** The detail text of every marker in a passage, in order. */
export function findPlaceholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]!.trim());
}

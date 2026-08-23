/**
 * In-text citation forms.
 *
 * The bibliography entry is built by `formatReference`; this is the other half
 * — what the citation looks like where it appears in a sentence. The model is
 * given both, so it never has to construct one from the structured fields and
 * cannot quietly get an author or a year wrong while doing so.
 */

/**
 * The surname, taken as the last word of a name.
 *
 * Bibliographic APIs return display names — "Chinelo Okeke", occasionally
 * "Okeke, C." — and the last token is the surname in the first form and the
 * initial in the second. The comma is therefore checked first: where one is
 * present the name is already surname-first and everything before it is taken.
 *
 * This is a heuristic and will misread some names, particularly where a family
 * name has several words. It fails to a slightly wrong label on a real work,
 * never to an invented one, which is the failure worth accepting.
 */
export function surnameOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";

  const comma = trimmed.indexOf(",");
  if (comma > 0) return trimmed.slice(0, comma).trim();

  const words = trimmed.split(/\s+/);
  return words[words.length - 1] ?? trimmed;
}

/**
 * The parenthetical form, in author-date style.
 *
 * APA, Harvard and the house styles most Nigerian departments use are all
 * author-date and agree on the shape below. A numeric style would need its own
 * branch, but the reference list is passed to the model with the project's
 * stated style alongside it, so the "Cite as" line is a starting point rather
 * than a rule it must not adapt.
 *
 * A work with no usable author or year returns null rather than something like
 * "(Anonymous, n.d.)" — offering an unusable citation form invites its use.
 */
export function inTextCitation(reference: {
  authors: string[];
  year: string | null;
}): string | null {
  const surnames = reference.authors.map(surnameOf).filter(Boolean);
  if (surnames.length === 0 || !reference.year) return null;

  const names =
    surnames.length === 1
      ? surnames[0]!
      : surnames.length === 2
        ? `${surnames[0]} & ${surnames[1]}`
        : `${surnames[0]} et al.`;

  return `(${names}, ${reference.year})`;
}

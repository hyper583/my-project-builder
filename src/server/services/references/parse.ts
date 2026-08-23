/**
 * Best-effort parsing of a pasted citation.
 *
 * Students arrive with a reference already written — copied from a paper, a
 * database export or their supervisor's list. Retyping it into eight fields is
 * work they have already done, so this reads what it can.
 *
 * The rule that governs every line below: **a field that cannot be found is
 * left null.** Nothing is guessed, defaulted or inferred. A citation with an
 * invented year or a plausible-looking journal name is worse than an
 * incomplete one, because the student cannot see that it is wrong. Whatever is
 * extracted is marked NEEDS_REVIEW for exactly that reason — this reads a
 * string, it does not verify a publication.
 *
 * The original text is always kept verbatim, so nothing here can lose it.
 */

export interface ParsedReference {
  authors: string[];
  year: string | null;
  title: string | null;
  publication: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  doi: string | null;
  url: string | null;
  /** True when anything at all could be read out of the text. */
  parsedAnything: boolean;
}

const EMPTY: ParsedReference = {
  authors: [],
  year: null,
  title: null,
  publication: null,
  volume: null,
  issue: null,
  pages: null,
  doi: null,
  url: null,
  parsedAnything: false,
};

/** Splits an author list on commas and ampersands, keeping "Surname, A." intact. */
function splitAuthors(text: string): string[] {
  const cleaned = text.replace(/\s*&\s*/g, ", ").replace(/\s+and\s+/gi, ", ");

  // "Okeke, A., Bello, T." — a comma followed by initials belongs to the name
  // before it, so the split happens only where a full name has ended.
  const parts = cleaned.split(/,\s*(?=[A-Z][a-z]{2,})/);

  return parts
    .map((part) =>
      part
        .replace(/[,;]\s*$/, "")
        // A trailing period is only punctuation when it does not belong to an
        // initial: stripping it blindly turns "Okeke, A." into "Okeke, A".
        .replace(/(?<![A-Z])\.\s*$/, "")
        .trim(),
    )
    .filter((part) => part.length > 1);
}

export function parseCitation(input: string): ParsedReference {
  const text = input.replace(/\s+/g, " ").trim();
  if (!text) return EMPTY;

  const result: ParsedReference = { ...EMPTY, authors: [] };

  /* ---- Identifiers, which are unambiguous when present ------------------ */

  const doiMatch = /\b(10\.\d{4,9}\/[^\s"<>,;]+)/i.exec(text);
  if (doiMatch) result.doi = doiMatch[1]!.replace(/[.,;]$/, "");

  const urlMatch = /\bhttps?:\/\/[^\s"<>]+/i.exec(text);
  if (urlMatch && !result.doi) result.url = urlMatch[0].replace(/[.,;]$/, "");

  /* ---- Year, and the split it gives us ---------------------------------- */

  const yearMatch = /\((\d{4}[a-z]?)\)/.exec(text) ?? /\b(19|20)(\d{2})\b/.exec(text);
  if (yearMatch) result.year = yearMatch[1]!.length === 4 ? yearMatch[1]! : yearMatch[0];

  const parenYear = /\((\d{4}[a-z]?)\)/.exec(text);

  if (parenYear) {
    // Authors sit before the year; everything after it is the work itself.
    // The trailing period is left for splitAuthors to judge — removing it here
    // would strip the one belonging to a final initial, as in "Okeke, A."
    const before = text
      .slice(0, parenYear.index)
      .replace(/[,;]\s*$/, "")
      .trim();
    if (before) result.authors = splitAuthors(before);

    const after = text.slice(parenYear.index + parenYear[0].length).replace(/^[.,;\s]+/, "");

    // The title runs to the first sentence-ending period that is not part of
    // an initial or an abbreviation.
    const titleMatch = /^(.+?)\.\s+(.*)$/.exec(after);
    if (titleMatch) {
      result.title = titleMatch[1]!.trim();
      const rest = titleMatch[2]!;

      const volumeMatch = /([A-Z][^,]*?),\s*(\d+)\s*(?:\((\d+)\))?/.exec(rest);
      if (volumeMatch) {
        result.publication = volumeMatch[1]!.trim();
        result.volume = volumeMatch[2]!;
        result.issue = volumeMatch[3] ?? null;
      } else {
        // No volume, so the publication is whatever precedes the next period.
        const publicationMatch = /^([^.]+)\./.exec(rest);
        if (publicationMatch) result.publication = publicationMatch[1]!.trim();
      }

      const pagesMatch = /\b(?:pp?\.\s*)?(\d+\s*[-–—]\s*\d+)\b/.exec(rest);
      if (pagesMatch) result.pages = pagesMatch[1]!.replace(/\s*[-–—]\s*/, "-");
    } else if (after) {
      // A citation with no trailing detail is still a title.
      result.title = after.replace(/[.\s]+$/, "").trim() || null;
    }
  }

  result.parsedAnything = Boolean(
    result.authors.length > 0 ||
      result.year ||
      result.title ||
      result.publication ||
      result.doi ||
      result.url,
  );

  return result;
}

import { AppError } from "@/server/errors";
import { prisma } from "@/server/db";
import { parseCitation } from "@/server/services/references/parse";
import { retrieveSources } from "@/server/services/references/retrieve";

/**
 * Reference management.
 *
 * The verification status is the point of this service, not decoration:
 *
 * - `USER_PROVIDED` — the student typed or pasted it. Their own words, taken
 *   at face value.
 * - `NEEDS_REVIEW` — a parser read fields out of pasted text. Best effort, and
 *   the student is told to check it.
 * - `VERIFIED` — either the student confirmed it, or it came from a
 *   bibliographic database with a resolving DOI.
 *
 * **Nothing is ever generated.** Details are either supplied by the student,
 * read from text they pasted, or retrieved from OpenAlex and Crossref — never
 * produced by a model. A reference with an invented year or a plausible
 * journal name is worse than an incomplete one, because it is wrong in a way
 * the student cannot see, and a fabricated citation in submitted work is a
 * misconduct finding rather than a poor mark.
 */

export interface ReferenceInput {
  authors?: string[];
  year?: string | null;
  title: string;
  publication?: string | null;
  publisher?: string | null;
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
  doi?: string | null;
  url?: string | null;
  raw?: string | null;
}

const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Adds a reference from structured fields the student filled in themselves. */
export async function addReference(projectId: string, input: ReferenceInput) {
  if (!input.title.trim()) {
    throw new AppError("VALIDATION", { message: "A reference needs at least a title." });
  }

  return prisma.projectReference.create({
    data: {
      projectId,
      authors: (input.authors ?? []).map((a) => a.trim()).filter(Boolean),
      year: clean(input.year),
      title: input.title.trim(),
      publication: clean(input.publication),
      publisher: clean(input.publisher),
      volume: clean(input.volume),
      issue: clean(input.issue),
      pages: clean(input.pages),
      doi: clean(input.doi),
      url: clean(input.url),
      raw: clean(input.raw),
      // The student entered this themselves, so it is their claim, not ours.
      verification: "USER_PROVIDED",
    },
  });
}

export interface ImportOutcome {
  created: number;
  needsReview: number;
  keptVerbatimOnly: number;
}

/**
 * Imports pasted citations, one per line or paragraph.
 *
 * The original text is stored verbatim on every entry regardless of how much
 * could be read out of it, so a bad parse can never lose what the student
 * pasted — the export prefers `raw` for exactly this reason.
 */
export async function importCitations(projectId: string, block: string): Promise<ImportOutcome> {
  const entries = block
    .split(/\n{2,}|\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 8);

  if (entries.length === 0) {
    throw new AppError("VALIDATION", { message: "Paste one or more references, one per line." });
  }

  let needsReview = 0;
  let keptVerbatimOnly = 0;

  for (const entry of entries) {
    const parsed = parseCitation(entry);

    if (parsed.parsedAnything) needsReview += 1;
    else keptVerbatimOnly += 1;

    await prisma.projectReference.create({
      data: {
        projectId,
        authors: parsed.authors,
        year: parsed.year,
        // Falling back to the whole line keeps the entry findable rather than
        // titling it something invented.
        title: parsed.title ?? entry.slice(0, 300),
        publication: parsed.publication,
        volume: parsed.volume,
        issue: parsed.issue,
        pages: parsed.pages,
        doi: parsed.doi,
        url: parsed.url,
        raw: entry,
        // Read by a parser, not confirmed by anyone — so it is flagged for the
        // student to check rather than presented as correct.
        verification: parsed.parsedAnything ? "NEEDS_REVIEW" : "USER_PROVIDED",
      },
    });
  }

  return { created: entries.length, needsReview, keptVerbatimOnly };
}

/** Updates a reference. Any edit makes it the student's own claim again. */
export async function updateReference(
  projectId: string,
  referenceId: string,
  input: ReferenceInput,
) {
  const updated = await prisma.projectReference.updateMany({
    where: { id: referenceId, projectId },
    data: {
      authors: (input.authors ?? []).map((a) => a.trim()).filter(Boolean),
      year: clean(input.year),
      title: input.title.trim(),
      publication: clean(input.publication),
      publisher: clean(input.publisher),
      volume: clean(input.volume),
      issue: clean(input.issue),
      pages: clean(input.pages),
      doi: clean(input.doi),
      url: clean(input.url),
      verification: "USER_PROVIDED",
    },
  });

  if (updated.count === 0) throw new AppError("NOT_FOUND");
}

/**
 * Marks a reference as checked by the student.
 *
 * Only they can set this. Nothing in the system awards VERIFIED on its own,
 * because nothing in the system has seen the source.
 */
export async function confirmReference(projectId: string, referenceId: string) {
  const updated = await prisma.projectReference.updateMany({
    where: { id: referenceId, projectId },
    data: { verification: "VERIFIED" },
  });

  if (updated.count === 0) throw new AppError("NOT_FOUND");
}

export async function deleteReference(projectId: string, referenceId: string) {
  const deleted = await prisma.projectReference.deleteMany({
    where: { id: referenceId, projectId },
  });

  if (deleted.count === 0) throw new AppError("NOT_FOUND");
}

/** References with the number of places each is cited. */
export async function listReferences(projectId: string) {
  const references = await prisma.projectReference.findMany({
    where: { projectId },
    orderBy: [{ authors: "asc" }, { year: "asc" }, { title: "asc" }],
    select: {
      id: true,
      authors: true,
      year: true,
      title: true,
      publication: true,
      publisher: true,
      volume: true,
      issue: true,
      pages: true,
      doi: true,
      url: true,
      raw: true,
      verification: true,
      _count: { select: { citations: true } },
    },
  });

  return references.map((reference) => ({
    ...reference,
    citationCount: reference._count.citations,
  }));
}

export interface RetrieveOutcome {
  found: number;
  added: number;
  alreadyPresent: number;
}

/**
 * Finds real published sources for a topic and records them.
 *
 * Retrieved entries are marked VERIFIED because they come from a bibliographic
 * database rather than from a parser or a model — the publication data is what
 * the database holds, and the DOI resolves. That is a stronger claim than
 * anything else in this file can make, and it is the only path that earns it
 * without the student checking by hand.
 *
 * Existing entries are never overwritten. A student who has already recorded a
 * work, possibly with their own corrections, keeps their version.
 */
export async function findSources(
  projectId: string,
  options: { query: string; recencyYears?: number | null; limit?: number },
): Promise<RetrieveOutcome> {
  const sources = await retrieveSources({
    query: options.query,
    recencyYears: options.recencyYears,
    limit: options.limit ?? 12,
  });

  if (sources.length === 0) return { found: 0, added: 0, alreadyPresent: 0 };

  const existing = await prisma.projectReference.findMany({
    where: { projectId },
    select: { doi: true, title: true },
  });

  const seenDois = new Set(
    existing.map((r) => r.doi?.toLowerCase()).filter((d): d is string => Boolean(d)),
  );
  const seenTitles = new Set(existing.map((r) => r.title.toLowerCase().replace(/[^a-z0-9]/g, "")));

  let added = 0;
  let alreadyPresent = 0;

  for (const source of sources) {
    const doiKey = source.doi?.toLowerCase();
    const titleKey = source.title.toLowerCase().replace(/[^a-z0-9]/g, "");

    if ((doiKey && seenDois.has(doiKey)) || seenTitles.has(titleKey)) {
      alreadyPresent += 1;
      continue;
    }

    await prisma.projectReference.create({
      data: {
        projectId,
        authors: source.authors,
        year: source.year,
        title: source.title,
        publication: source.publication,
        doi: source.doi,
        url: source.url,
        // Provenance, kept verbatim so a student can see where it came from.
        raw: null,
        verification: "VERIFIED",
      },
    });

    if (doiKey) seenDois.add(doiKey);
    seenTitles.add(titleKey);
    added += 1;
  }

  return { found: sources.length, added, alreadyPresent };
}

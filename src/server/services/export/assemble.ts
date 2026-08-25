import {
  buildFrontMatter,
  numberTablesAndFigures,
} from "@/server/services/export/front-matter";
import {
  DEFAULT_FORMATTING,
  DEMO_DISCLAIMER,
  parseSectionHtml,
  type ExportChapter,
  type ExportDocument,
  type ExportFormatting,
} from "@/server/services/export/document";

/**
 * Turns stored project data into the canonical export document.
 *
 * Everything the renderers need is resolved here, once. In particular the
 * formatting step stores free text — a student types "12pt" or "double
 * spacing" — so the parsing lives in one place with one set of fallbacks
 * rather than being re-guessed by each renderer.
 */

/** What the assembler needs from the database. Kept structural so it is testable. */
export interface AssembleInput {
  project: {
    title: string;
    topic: string | null;
    kind: "REAL" | "DEMO";
  };
  author: string;
  institution: {
    institution: string | null;
    faculty: string | null;
    department: string | null;
    programme: string | null;
    degree: string | null;
    /** Named on the Certification and Declaration pages. */
    matricNumber?: string | null;
    supervisorName?: string | null;
    supervisorTitle?: string | null;
    headOfDepartment?: string | null;
  } | null;
  /** The student's own words on the front pages. Absent until they write them. */
  frontMatter: {
    dedication: string | null;
    acknowledgements: string | null;
    abstract: string | null;
    keywords: string | null;
  } | null;
  formatting: {
    font: string | null;
    fontSize: string | null;
    lineSpacing: string | null;
    margins: string | null;
  } | null;
  /** Flat section rows; the chapter tree is rebuilt from parentId and order. */
  sections: Array<{
    id: string;
    parentId: string | null;
    number: string | null;
    title: string;
    content: string | null;
    order: number;
  }>;
  references: Array<{
    authors: string[];
    year: string | null;
    title: string;
    publication: string | null;
    publisher: string | null;
    volume: string | null;
    issue: string | null;
    pages: string | null;
    doi: string | null;
    url: string | null;
    raw: string | null;
  }>;
  dateLabel: string;
  /** Resolved by the export policy, never inferred from `kind` here. */
  withDisclaimer: boolean;
}

/** Reads a point size out of free text such as "12", "12pt" or "size 12". */
export function parseFontSize(value: string | null | undefined): number {
  const match = /(\d{1,2}(?:\.\d)?)/.exec(value ?? "");
  if (!match) return DEFAULT_FORMATTING.fontSizePt;
  const size = Number(match[1]);
  // Anything outside this range is a misreading, not a real choice.
  return size >= 8 && size <= 18 ? size : DEFAULT_FORMATTING.fontSizePt;
}

/** Reads a line-spacing multiple out of "double", "1.5", "1.5 lines" and so on. */
export function parseLineSpacing(value: string | null | undefined): number {
  const text = (value ?? "").toLowerCase();
  if (!text.trim()) return DEFAULT_FORMATTING.lineSpacing;

  // Words first: "double spacing" also contains no usable number.
  if (/double/.test(text)) return 2;
  if (/one and a half|1\s*and\s*a\s*half|one-and-a-half/.test(text)) return 1.5;
  if (/single/.test(text)) return 1;

  const match = /(\d(?:\.\d)?)/.exec(text);
  if (!match) return DEFAULT_FORMATTING.lineSpacing;
  const spacing = Number(match[1]);
  return spacing >= 1 && spacing <= 3 ? spacing : DEFAULT_FORMATTING.lineSpacing;
}

/**
 * Reads page margins out of free text.
 *
 * Handles the two forms departments actually write: one measurement for every
 * side ("1 inch margins"), or a larger binding margin on the left ("1 inch,
 * 1.5 inch left"). Centimetres are converted rather than treated as inches,
 * which would otherwise silently produce a page with almost no text on it.
 */
export function parseMargins(value: string | null | undefined): ExportFormatting["marginInches"] {
  const text = (value ?? "").toLowerCase();
  if (!text.trim()) return DEFAULT_FORMATTING.marginInches;

  const isCentimetres = /cm|centimet/.test(text);
  const toInches = (n: number) => (isCentimetres ? n / 2.54 : n);

  const numbers = [...text.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  if (numbers.length === 0) return DEFAULT_FORMATTING.marginInches;

  const sane = (n: number) => n >= 0.25 && n <= 3;

  // An explicit left/binding margin, mentioned alongside a general one.
  const leftMatch = /(\d+(?:\.\d+)?)\s*(?:inch|in|cm|centimet\w*)?\s*(?:on the )?left|left[^0-9]{0,12}(\d+(?:\.\d+)?)/.exec(
    text,
  );
  const left = leftMatch ? Number(leftMatch[1] ?? leftMatch[2]) : undefined;

  const general = toInches(numbers[0]!);
  if (!sane(general)) return DEFAULT_FORMATTING.marginInches;

  const leftInches = left !== undefined && sane(toInches(left)) ? toInches(left) : general;

  return { top: general, right: general, bottom: general, left: leftInches };
}

export function parseFormatting(row: AssembleInput["formatting"]): ExportFormatting {
  return {
    font: row?.font?.trim() || DEFAULT_FORMATTING.font,
    fontSizePt: parseFontSize(row?.fontSize),
    lineSpacing: parseLineSpacing(row?.lineSpacing),
    marginInches: parseMargins(row?.margins),
  };
}

/**
 * Renders one reference for the bibliography.
 *
 * A student's own verbatim text always wins. Structured fields are assembled
 * only when there is no raw entry, and nothing absent is invented — a missing
 * year is left out rather than guessed, because a fabricated citation is worse
 * than an incomplete one.
 */
export function formatReference(reference: AssembleInput["references"][number]): string {
  if (reference.raw?.trim()) return reference.raw.trim();

  const parts: string[] = [];

  if (reference.authors.length > 0) parts.push(reference.authors.join(", "));
  if (reference.year) parts.push(`(${reference.year})`);
  parts.push(reference.title.replace(/\.?$/, "."));

  if (reference.publication) {
    const volume = [reference.volume, reference.issue ? `(${reference.issue})` : null]
      .filter(Boolean)
      .join("");
    parts.push([reference.publication, volume].filter(Boolean).join(", ") + (reference.pages ? "," : "."));
  }
  if (reference.pages) parts.push(`${reference.pages}.`);
  if (reference.publisher) parts.push(`${reference.publisher}.`);
  if (reference.doi) parts.push(`https://doi.org/${reference.doi.replace(/^https?:\/\/doi\.org\//, "")}`);
  else if (reference.url) parts.push(reference.url);

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Rebuilds the chapter tree and parses every section's stored HTML. */
function buildChapters(sections: AssembleInput["sections"]): ExportChapter[] {
  const byParent = new Map<string | null, AssembleInput["sections"]>();
  for (const section of sections) {
    const list = byParent.get(section.parentId) ?? [];
    list.push(section);
    byParent.set(section.parentId, list);
  }

  // `order` is scoped to a parent, so each level is sorted separately rather
  // than sorting the flat list — which would interleave chapters.
  const sortByOrder = (list: AssembleInput["sections"]) =>
    [...list].sort((a, b) => a.order - b.order);

  return sortByOrder(byParent.get(null) ?? []).map((chapter) => ({
    number: chapter.number,
    title: chapter.title,
    blocks: parseSectionHtml(chapter.content),
    sections: sortByOrder(byParent.get(chapter.id) ?? []).map((section) => ({
      number: section.number,
      title: section.title,
      blocks: parseSectionHtml(section.content),
    })),
  }));
}

/** Assembles the canonical document the renderers consume. */
export function assembleDocument(input: AssembleInput): ExportDocument {
  const chapters = buildChapters(input.sections);

  /*
   * Numbering happens before the lists are read, because it is what fills them.
   * The same pass writes the caption into each table and figure, so the body
   * and the index are produced from one source rather than two that agree by
   * luck.
   */
  const contentsLists = numberTablesAndFigures(chapters);

  return {
    title: input.project.title,
    topic: input.project.topic,
    author: input.author,
    institution: input.institution?.institution ?? null,
    faculty: input.institution?.faculty ?? null,
    department: input.institution?.department ?? null,
    programme: input.institution?.programme ?? null,
    degree: input.institution?.degree ?? null,
    dateLabel: input.dateLabel,
    frontMatter: buildFrontMatter({
      title: input.project.title,
      author: input.author,
      institution: input.institution?.institution ?? null,
      department: input.institution?.department ?? null,
      degree: input.institution?.degree ?? null,
      programme: input.institution?.programme ?? null,
      matricNumber: input.institution?.matricNumber ?? null,
      supervisorName: input.institution?.supervisorName ?? null,
      supervisorTitle: input.institution?.supervisorTitle ?? null,
      headOfDepartment: input.institution?.headOfDepartment ?? null,
      dedication: input.frontMatter?.dedication ?? null,
      acknowledgements: input.frontMatter?.acknowledgements ?? null,
      abstract: input.frontMatter?.abstract ?? null,
      keywords: input.frontMatter?.keywords ?? null,
      dateLabel: input.dateLabel,
    }),
    contentsLists,
    chapters,
    references: input.references.map(formatReference).filter(Boolean),
    formatting: parseFormatting(input.formatting),
    // Whether to mark the document is the policy's decision, not the
    // assembler's. A DEMO project exported by an admin is deliberately clean.
    disclaimer: input.withDisclaimer ? DEMO_DISCLAIMER : null,
  };
}

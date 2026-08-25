import type {
  Block,
  ExportChapter,
  FrontMatterPage,
  Inline,
} from "@/server/services/export/document";

/**
 * The pages a project opens with, and the numbering of its tables and figures.
 *
 * Every Nigerian university project carries these, and none of them existed:
 * the export produced a title page, the chapters and the references, so a
 * student who had paid for consistent formatting still assembled Certification,
 * Declaration, Dedication, Acknowledgements and the Abstract by hand in Word.
 * That is exactly where the formatting stops matching, and it is the last hour
 * of a project rather than the first.
 *
 * Two rules hold throughout:
 *
 * 1. A page with nothing to say is omitted, never printed empty. A Dedication
 *    heading over blank space looks like a defect in the document.
 * 2. Nothing here invents anything. A Certification page names a supervisor
 *    only if a supervisor was named; the blanks are left as signature rules for
 *    a pen, which is what they are for.
 */

const text = (value: string, opts: { bold?: boolean; italic?: boolean } = {}): Inline => ({
  kind: "text",
  text: value,
  ...opts,
});

const para = (...runs: Inline[]): Block => ({ kind: "paragraph", runs });

/** A ruled blank line to sign on, with its label underneath. */
function signature(label: string): Block[] {
  return [
    para(text(" ")),
    para(text("__________________________")),
    para(text(label, { bold: true })),
  ];
}

export interface FrontMatterInput {
  readonly title: string;
  readonly author: string;
  readonly institution: string | null;
  readonly department: string | null;
  readonly degree: string | null;
  readonly programme: string | null;
  readonly matricNumber: string | null;
  readonly supervisorName: string | null;
  readonly supervisorTitle: string | null;
  readonly headOfDepartment: string | null;
  readonly dedication: string | null;
  readonly acknowledgements: string | null;
  readonly abstract: string | null;
  readonly keywords: string | null;
  readonly dateLabel: string;
}

/** Free text into paragraphs, one per blank line. Empty input yields nothing. */
function prose(value: string | null): Block[] {
  if (!value?.trim()) return [];
  return value
    .split(/\r?\n\s*\r?\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => para(text(paragraph)));
}

export function buildFrontMatter(input: FrontMatterInput): FrontMatterPage[] {
  const pages: FrontMatterPage[] = [];

  /*
   * Declaration — the student's own statement of authorship.
   *
   * Included whenever a matriculation number is known, because that is what
   * makes it a declaration rather than a sentence. Without one there is nothing
   * to identify the person declaring.
   */
  if (input.matricNumber?.trim()) {
    pages.push({
      heading: "DECLARATION",
      blocks: [
        para(
          text("I, "),
          text(input.author.toUpperCase(), { bold: true }),
          text(", with matriculation number "),
          text(input.matricNumber.trim(), { bold: true }),
          text(
            ", hereby declare that this project titled “" +
              input.title +
              "” was carried out by me. It is a record of my own work and has not been " +
              "submitted, in whole or in part, for any other degree or diploma at this or any " +
              "other institution. All sources of information used have been duly acknowledged.",
          ),
        ),
        ...signature(`${input.author.toUpperCase()}  Date`),
      ],
    });
  }

  /*
   * Certification — signed by the people who supervised and approved it.
   *
   * Needs at least a supervisor to be worth a page. The head of department line
   * is added only when that person is named; a blank rule labelled with nobody
   * is not something a student can take to anyone to sign.
   */
  if (input.supervisorName?.trim()) {
    const supervisor = [input.supervisorTitle?.trim(), input.supervisorName.trim()]
      .filter(Boolean)
      .join(" ");

    pages.push({
      heading: "CERTIFICATION",
      blocks: [
        para(
          text("This is to certify that this project titled “"),
          text(input.title, { bold: true }),
          text("” was carried out by "),
          text(input.author.toUpperCase(), { bold: true }),
          text(input.matricNumber?.trim() ? ` (${input.matricNumber.trim()})` : ""),
          text(
            [
              " and has been approved as meeting the requirements for the award of ",
              input.degree?.trim() || "the degree",
              input.department?.trim() ? ` in the Department of ${input.department.trim()}` : "",
              input.institution?.trim() ? `, ${input.institution.trim()}` : "",
              ".",
            ].join(""),
          ),
        ),
        ...signature(`${supervisor}  Date\n(Supervisor)`),
        ...(input.headOfDepartment?.trim()
          ? signature(`${input.headOfDepartment.trim()}  Date\n(Head of Department)`)
          : []),
      ],
    });
  }

  const dedication = prose(input.dedication);
  if (dedication.length > 0) pages.push({ heading: "DEDICATION", blocks: dedication });

  const acknowledgements = prose(input.acknowledgements);
  if (acknowledgements.length > 0) {
    pages.push({ heading: "ACKNOWLEDGEMENTS", blocks: acknowledgements });
  }

  const abstract = prose(input.abstract);
  if (abstract.length > 0) {
    const blocks = [...abstract];
    if (input.keywords?.trim()) {
      blocks.push(para(text("Keywords: ", { bold: true }), text(input.keywords.trim())));
    }
    pages.push({ heading: "ABSTRACT", blocks });
  }

  return pages;
}

/**
 * Numbers every table and figure, and returns the lists that index them.
 *
 * One pass produces both the caption printed in the body and the entry in the
 * list, so the two cannot drift — which is the whole reason a student gets this
 * wrong by hand. Renumbering after inserting a table in Chapter Three means
 * editing every later caption AND the list; here it is recomputed on export.
 *
 * Numbered per chapter — "Table 4.1", "Figure 3.2" — which is the convention,
 * and restarts within each chapter. The caption text is the title of the
 * section the table sits in, because nothing else in the document describes it:
 * the editor stores no captions of its own.
 *
 * Mutates the blocks it is given. They are freshly parsed for this export and
 * belong to nobody else.
 */
export function numberTablesAndFigures(chapters: ExportChapter[]): FrontMatterPage[] {
  const tables: Inline[][] = [];
  const figures: Inline[][] = [];

  chapters.forEach((chapter, chapterIndex) => {
    // A chapter with no number of its own still needs one here, or every table
    // in it would be "Table .1".
    const chapterLabel = chapter.number?.trim() || String(chapterIndex + 1);
    let tableCount = 0;
    let figureCount = 0;

    const walk = (blocks: Block[], caption: string) => {
      for (const block of blocks) {
        if (block.kind === "table") {
          tableCount += 1;
          const label = `Table ${chapterLabel}.${tableCount}`;
          block.label = `${label}: ${caption}`;
          tables.push([text(label, { bold: true }), text(` ${caption}`)]);
        } else if (block.kind === "image") {
          figureCount += 1;
          const label = `Figure ${chapterLabel}.${figureCount}`;
          // An image's alt text describes it better than the section title
          // does, when there is any.
          const description = block.alt?.trim() && block.alt.trim() !== "Figure"
            ? block.alt.trim()
            : caption;
          block.label = `${label}: ${description}`;
          figures.push([text(label, { bold: true }), text(` ${description}`)]);
        }
      }
    };

    walk(chapter.blocks, chapter.title);
    for (const section of chapter.sections) {
      walk(section.blocks, section.title);
    }
  });

  const pages: FrontMatterPage[] = [];
  if (tables.length > 0) {
    pages.push({
      heading: "LIST OF TABLES",
      blocks: tables.map((runs) => ({ kind: "paragraph", runs })),
    });
  }
  if (figures.length > 0) {
    pages.push({
      heading: "LIST OF FIGURES",
      blocks: figures.map((runs) => ({ kind: "paragraph", runs })),
    });
  }
  return pages;
}

import { describe, expect, it } from "vitest";

import type { Block, ExportChapter, FrontMatterPage } from "@/server/services/export/document";
import {
  buildFrontMatter,
  numberTablesAndFigures,
  type FrontMatterInput,
} from "@/server/services/export/front-matter";

/**
 * The pages a project opens with.
 *
 * Every Nigerian university project carries these and the export produced none
 * of them, so a student who had paid for consistent formatting still assembled
 * Certification, Declaration, Dedication, Acknowledgements and the Abstract by
 * hand in Word — which is exactly where the formatting stops matching.
 *
 * The rule these tests mostly hold is the unglamorous one: a page with nothing
 * to say is omitted rather than printed empty.
 */

const BASE: FrontMatterInput = {
  title: "Social Media Use and Academic Performance",
  author: "Ada Okeke",
  institution: "Madonna University",
  department: "Computer Science",
  degree: "Bachelor of Science",
  programme: "B.Sc. Computer Science",
  matricNumber: null,
  supervisorName: null,
  supervisorTitle: null,
  headOfDepartment: null,
  dedication: null,
  acknowledgements: null,
  abstract: null,
  keywords: null,
  dateLabel: "August 2026",
};

const headings = (pages: FrontMatterPage[]) => pages.map((page) => page.heading);

const textOf = (page: FrontMatterPage): string =>
  page.blocks
    .flatMap((block: Block) => (block.kind === "paragraph" ? block.runs.map((r) => r.text) : []))
    .join(" ");

describe("a project with nothing filled in", () => {
  it("produces no pages at all rather than empty ones", () => {
    // A Dedication heading over blank space reads as a fault in the document,
    // not as a student who has not written one yet.
    expect(buildFrontMatter(BASE)).toEqual([]);
  });

  it("treats whitespace as nothing", () => {
    const pages = buildFrontMatter({ ...BASE, dedication: "   \n\n  ", acknowledgements: "" });

    expect(pages).toEqual([]);
  });
});

describe("the order departments expect", () => {
  it("runs declaration, certification, dedication, acknowledgements, abstract", () => {
    const pages = buildFrontMatter({
      ...BASE,
      matricNumber: "CS/2019/001",
      supervisorName: "J. Eze",
      supervisorTitle: "Dr.",
      dedication: "To my parents.",
      acknowledgements: "I thank my supervisor.",
      abstract: "This study examines social media use.",
    });

    expect(headings(pages)).toEqual([
      "DECLARATION",
      "CERTIFICATION",
      "DEDICATION",
      "ACKNOWLEDGEMENTS",
      "ABSTRACT",
    ]);
  });

  it("keeps the order when some pages are missing", () => {
    const pages = buildFrontMatter({ ...BASE, abstract: "An abstract.", dedication: "To Ada." });

    expect(headings(pages)).toEqual(["DEDICATION", "ABSTRACT"]);
  });
});

describe("declaration", () => {
  it("needs a matriculation number to be a declaration at all", () => {
    // Without one there is nobody identified as declaring anything, so the page
    // is not worth printing.
    expect(headings(buildFrontMatter(BASE))).not.toContain("DECLARATION");
    expect(headings(buildFrontMatter({ ...BASE, matricNumber: "CS/2019/001" }))).toContain(
      "DECLARATION",
    );
  });

  it("names the student, the number and the title", () => {
    const page = buildFrontMatter({ ...BASE, matricNumber: "CS/2019/001" })[0]!;
    const body = textOf(page);

    expect(body).toContain("ADA OKEKE");
    expect(body).toContain("CS/2019/001");
    expect(body).toContain("Social Media Use and Academic Performance");
  });
});

describe("certification", () => {
  it("is omitted when no supervisor has been named", () => {
    // A signature rule labelled with nobody is not something a student can take
    // to anyone to sign.
    expect(headings(buildFrontMatter(BASE))).not.toContain("CERTIFICATION");
  });

  it("carries the supervisor's title and name", () => {
    const pages = buildFrontMatter({
      ...BASE,
      supervisorName: "J. Eze",
      supervisorTitle: "Dr.",
    });
    const body = textOf(pages[0]!);

    expect(body).toContain("Dr. J. Eze");
    expect(body).toContain("Supervisor");
  });

  it("adds a head of department line only when one is named", () => {
    const without = textOf(buildFrontMatter({ ...BASE, supervisorName: "J. Eze" })[0]!);
    expect(without).not.toContain("Head of Department");

    const with_ = textOf(
      buildFrontMatter({ ...BASE, supervisorName: "J. Eze", headOfDepartment: "P. Nwosu" })[0]!,
    );
    expect(with_).toContain("P. Nwosu");
    expect(with_).toContain("Head of Department");
  });

  it("invents no degree it was not given", () => {
    const body = textOf(
      buildFrontMatter({ ...BASE, degree: null, supervisorName: "J. Eze" })[0]!,
    );

    expect(body).toContain("the degree");
    expect(body).not.toMatch(/undefined|null/);
  });
});

describe("abstract", () => {
  it("splits prose into paragraphs on blank lines", () => {
    const page = buildFrontMatter({ ...BASE, abstract: "First para.\n\nSecond para." })[0]!;

    expect(page.blocks).toHaveLength(2);
  });

  it("appends keywords as their own line when given", () => {
    const page = buildFrontMatter({
      ...BASE,
      abstract: "An abstract.",
      keywords: "social media, academic performance",
    })[0]!;

    expect(textOf(page)).toContain("Keywords:");
    expect(textOf(page)).toContain("social media, academic performance");
  });

  it("omits the keywords line when there are none", () => {
    const page = buildFrontMatter({ ...BASE, abstract: "An abstract." })[0]!;

    expect(textOf(page)).not.toContain("Keywords");
  });
});

/* ---- numbering ---------------------------------------------------------- */

const table = (): Block => ({
  kind: "table",
  rows: [{ header: true, cells: [[{ kind: "text", text: "Level" }]] }],
});

const figure = (alt = "Figure"): Block => ({ kind: "image", alt });

function chapters(): ExportChapter[] {
  return [
    {
      number: "3",
      title: "Research Methodology",
      blocks: [],
      sections: [{ number: "3.1", title: "Research Design", blocks: [table()] }],
    },
    {
      number: "4",
      title: "Data Presentation",
      blocks: [],
      sections: [
        { number: "4.1", title: "Response Rate", blocks: [table(), figure("Usage by level")] },
        { number: "4.2", title: "Test of Hypotheses", blocks: [table()] },
      ],
    },
  ];
}

describe("numbering tables and figures", () => {
  it("restarts numbering in each chapter", () => {
    // "Table 4.1" is the convention, not "Table 2". Getting this wrong by hand
    // across a seventy-page document is exactly the tedium being removed.
    const all = chapters();
    numberTablesAndFigures(all);

    const labels = all
      .flatMap((c) => c.sections)
      .flatMap((s) => s.blocks)
      .filter((b) => b.kind === "table")
      .map((b) => (b as { label?: string }).label);

    expect(labels).toEqual([
      "Table 3.1: Research Design",
      "Table 4.1: Response Rate",
      "Table 4.2: Test of Hypotheses",
    ]);
  });

  it("numbers figures on their own sequence", () => {
    const all = chapters();
    numberTablesAndFigures(all);

    const figures = all
      .flatMap((c) => c.sections)
      .flatMap((s) => s.blocks)
      .filter((b) => b.kind === "image")
      .map((b) => (b as { label?: string }).label);

    expect(figures).toEqual(["Figure 4.1: Usage by level"]);
  });

  it("builds the lists from the same labels it wrote into the body", () => {
    // One pass produces both, so a caption and its index entry cannot drift —
    // which is the failure a student hits after inserting one table.
    const all = chapters();
    const pages = numberTablesAndFigures(all);

    expect(headings(pages)).toEqual(["LIST OF TABLES", "LIST OF FIGURES"]);
    expect(textOf(pages[0]!)).toContain("Table 4.2");
    expect(textOf(pages[0]!)).toContain("Test of Hypotheses");
  });

  it("omits a list when the project has none of that thing", () => {
    const only = [
      { number: "1", title: "Introduction", blocks: [table()], sections: [] },
    ] satisfies ExportChapter[];

    expect(headings(numberTablesAndFigures(only))).toEqual(["LIST OF TABLES"]);
  });

  it("produces no lists at all for a project with neither", () => {
    const plain = [
      { number: "1", title: "Introduction", blocks: [], sections: [] },
    ] satisfies ExportChapter[];

    expect(numberTablesAndFigures(plain)).toEqual([]);
  });

  it("still numbers a chapter that has no number of its own", () => {
    // Otherwise every table in it becomes "Table .1".
    const unnumbered = [
      { number: null, title: "Introduction", blocks: [table()], sections: [] },
    ] satisfies ExportChapter[];

    numberTablesAndFigures(unnumbered);

    expect((unnumbered[0]!.blocks[0] as { label?: string }).label).toBe(
      "Table 1.1: Introduction",
    );
  });
});

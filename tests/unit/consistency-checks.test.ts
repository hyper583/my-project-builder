import { describe, expect, it } from "vitest";

import { runChecks, type CheckInput } from "@/server/services/consistency/checks";

/**
 * The deterministic checks.
 *
 * Two failure modes matter, and they pull in opposite directions: missing a
 * real contradiction, and crying wolf. A check that fires on ordinary prose
 * gets ignored, which is worse than not having it — so the false-positive
 * cases below are as important as the true-positive ones.
 */

function input(overrides: Partial<CheckInput> = {}): CheckInput {
  return {
    research: {
      aim: "To examine the effect of social media on performance",
      objectives: ["One", "Two", "Three"],
      researchQuestions: ["Q1", "Q2", "Q3"],
      hypotheses: [],
      sampleSize: "120",
      targetPopulation: "Undergraduates",
      researchDesign: "Survey",
    },
    sections: [],
    references: [],
    citedReferenceIds: [],
    ...overrides,
  };
}

const kinds = (input: CheckInput) => runChecks(input).map((f) => f.kind);

describe("objectives and research questions", () => {
  it("flags a count mismatch", () => {
    const found = runChecks(
      input({
        research: { ...input().research!, objectives: ["One", "Two", "Three"], researchQuestions: ["Q1"] },
      }),
    );
    const issue = found.find((f) => f.kind === "OBJECTIVES_QUESTIONS_MISMATCH");
    expect(issue?.severity).toBe("HIGH");
    expect(issue?.detail).toContain("3 objectives");
  });

  it("stays quiet when they match", () => {
    expect(kinds(input())).not.toContain("OBJECTIVES_QUESTIONS_MISMATCH");
  });

  it("stays quiet when one side is empty, because nothing has been claimed yet", () => {
    const early = input({
      research: { ...input().research!, researchQuestions: [] },
    });
    expect(kinds(early)).not.toContain("OBJECTIVES_QUESTIONS_MISMATCH");
  });

  it("flags objectives with no aim", () => {
    const found = kinds(input({ research: { ...input().research!, aim: null } }));
    expect(found).toContain("OBJECTIVES_WITHOUT_AIM");
  });
});

describe("sample size contradictions", () => {
  it("finds a number in the prose that contradicts the stated sample size", () => {
    const found = runChecks(
      input({
        sections: [
          {
            id: "s1",
            parentId: "c1",
            number: "3.4",
            title: "Sample Size",
            content: "<p>A total of 200 respondents were selected for the study.</p>",
          },
        ],
      }),
    );

    const issue = found.find((f) => f.kind === "SAMPLE_SIZE_CONTRADICTION");
    expect(issue?.severity).toBe("HIGH");
    expect(issue?.detail).toContain("120");
    expect(issue?.detail).toContain("200");
    expect(issue?.sectionIds).toEqual(["s1"]);
  });

  it("stays quiet when the prose agrees", () => {
    const found = kinds(
      input({
        sections: [
          {
            id: "s1",
            parentId: "c1",
            number: "3.4",
            title: "Sample Size",
            content: "<p>A total of 120 respondents were selected.</p>",
          },
        ],
      }),
    );
    expect(found).not.toContain("SAMPLE_SIZE_CONTRADICTION");
  });

  it("ignores numbers that are not sample sizes", () => {
    // Years, page counts and Likert points must not trigger it — a check that
    // fires on ordinary prose gets ignored entirely.
    const found = kinds(
      input({
        sections: [
          {
            id: "s1",
            parentId: "c1",
            number: "2.1",
            title: "Literature",
            content:
              "<p>Okeke (2019) surveyed the field, and a 2021 review covering 350 pages " +
              "used a 5-point Likert scale across 1995 and 2003.</p>",
          },
        ],
      }),
    );
    expect(found).not.toContain("SAMPLE_SIZE_CONTRADICTION");
  });
});

describe("document completeness", () => {
  it("reports outstanding markers and which sections hold them", () => {
    const found = runChecks(
      input({
        sections: [
          {
            id: "s1",
            parentId: "c1",
            number: "4.1",
            title: "Findings",
            content: "<p>Results showed [STUDENT DATA REQUIRED: mean score] overall.</p>",
          },
        ],
      }),
    );

    const issue = found.find((f) => f.kind === "OUTSTANDING_PLACEHOLDERS");
    expect(issue?.severity).toBe("HIGH");
    expect(issue?.sectionIds).toEqual(["s1"]);
  });

  it("reports empty sections but ignores empty chapters", () => {
    // A chapter is a container for its sections; having no prose of its own is
    // normal and must not be reported as a gap.
    const found = runChecks(
      input({
        sections: [
          { id: "c1", parentId: null, number: "1", title: "Introduction", content: null },
          { id: "s1", parentId: "c1", number: "1.1", title: "Background", content: null },
        ],
      }),
    );

    const issue = found.find((f) => f.kind === "EMPTY_SECTIONS");
    expect(issue?.sectionIds).toEqual(["s1"]);
  });

  it("flags a gap in chapter numbering", () => {
    const found = kinds(
      input({
        sections: [
          { id: "c1", parentId: null, number: "1", title: "One", content: "<p>x</p>" },
          { id: "c2", parentId: null, number: "2", title: "Two", content: "<p>x</p>" },
          { id: "c4", parentId: null, number: "4", title: "Four", content: "<p>x</p>" },
        ],
      }),
    );
    expect(found).toContain("CHAPTER_NUMBERING_GAP");
  });

  it("stays quiet on consecutive chapters", () => {
    const found = kinds(
      input({
        sections: [
          { id: "c1", parentId: null, number: "1", title: "One", content: "<p>x</p>" },
          { id: "c2", parentId: null, number: "2", title: "Two", content: "<p>x</p>" },
        ],
      }),
    );
    expect(found).not.toContain("CHAPTER_NUMBERING_GAP");
  });
});

describe("references", () => {
  it("flags entries that could not be verified", () => {
    const found = runChecks(
      input({
        references: [
          { id: "r1", title: "A study", verification: "NEEDS_REVIEW" },
          { id: "r2", title: "Another", verification: "VERIFIED" },
        ],
        citedReferenceIds: ["r1", "r2"],
      }),
    );
    const issue = found.find((f) => f.kind === "REFERENCES_NEED_REVIEW");
    expect(issue?.detail).toContain("never invented");
  });

  it("flags references that are never cited", () => {
    const found = runChecks(
      input({
        references: [
          { id: "r1", title: "Cited work", verification: "VERIFIED" },
          { id: "r2", title: "Orphan work", verification: "VERIFIED" },
        ],
        citedReferenceIds: ["r1"],
      }),
    );
    const issue = found.find((f) => f.kind === "UNCITED_REFERENCES");
    expect(issue?.severity).toBe("LOW");
    expect(issue?.detail).toContain("Orphan work");
  });
});

describe("fingerprints", () => {
  it("are stable across runs, so a finding is not duplicated", () => {
    const scenario = input({
      sections: [
        {
          id: "s1",
          parentId: "c1",
          number: "3.4",
          title: "Sample",
          content: "<p>200 respondents were selected.</p>",
        },
      ],
    });

    const first = runChecks(scenario).map((f) => f.fingerprint).sort();
    const second = runChecks(scenario).map((f) => f.fingerprint).sort();
    expect(first).toEqual(second);
  });

  it("change when the problem changes, so a fixed issue is not confused with a new one", () => {
    const before = runChecks(
      input({
        sections: [
          { id: "s1", parentId: "c1", number: "3.4", title: "S", content: "<p>200 respondents.</p>" },
        ],
      }),
    ).find((f) => f.kind === "SAMPLE_SIZE_CONTRADICTION")!;

    const after = runChecks(
      input({
        sections: [
          { id: "s1", parentId: "c1", number: "3.4", title: "S", content: "<p>300 respondents.</p>" },
        ],
      }),
    ).find((f) => f.kind === "SAMPLE_SIZE_CONTRADICTION")!;

    expect(before.fingerprint).not.toBe(after.fingerprint);
  });
});

describe("a clean project", () => {
  it("produces no findings at all", () => {
    const clean = input({
      sections: [
        { id: "c1", parentId: null, number: "1", title: "Introduction", content: "<p>Chapter.</p>" },
        { id: "s1", parentId: "c1", number: "1.1", title: "Background", content: "<p>Written.</p>" },
      ],
      references: [{ id: "r1", title: "A study", verification: "VERIFIED" }],
      citedReferenceIds: ["r1"],
    });
    expect(runChecks(clean)).toEqual([]);
  });
});

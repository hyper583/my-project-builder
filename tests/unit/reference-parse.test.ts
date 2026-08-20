import { describe, expect, it } from "vitest";

import { parseCitation } from "@/server/services/references/parse";

/**
 * Citation parsing.
 *
 * The parser exists to save retyping, not to produce bibliographic truth. The
 * rule it must never break is that an absent field stays null — a citation
 * with an invented year or a plausible journal name is worse than an
 * incomplete one, because the student cannot see that it is wrong.
 *
 * So the tests below check two things in equal measure: that it reads what is
 * genuinely there, and that it invents nothing when it is not.
 */

describe("reading what is there", () => {
  it("reads a standard APA journal citation", () => {
    const parsed = parseCitation(
      "Okeke, A. (2026). Study habits and academic performance. Journal of Education, 4(2), 11-20.",
    );

    expect(parsed.authors).toEqual(["Okeke, A."]);
    expect(parsed.year).toBe("2026");
    expect(parsed.title).toBe("Study habits and academic performance");
    expect(parsed.publication).toBe("Journal of Education");
    expect(parsed.volume).toBe("4");
    expect(parsed.issue).toBe("2");
    expect(parsed.pages).toBe("11-20");
  });

  it("keeps multi-author names together", () => {
    // "Okeke, A." must not split into "Okeke" and "A." — the comma belongs to
    // the name, and only a following surname starts a new author.
    const parsed = parseCitation(
      "Okeke, A., Bello, T., & Adeyemi, K. (2025). A collaborative study. Journal of Things, 2(1), 5-9.",
    );

    expect(parsed.authors).toEqual(["Okeke, A.", "Bello, T.", "Adeyemi, K."]);
  });

  it("reads a DOI", () => {
    const parsed = parseCitation(
      "Okeke, A. (2026). A study. Journal, 1(1), 1-2. https://doi.org/10.1234/abcd.5678",
    );
    expect(parsed.doi).toBe("10.1234/abcd.5678");
  });

  it("reads a plain URL when there is no DOI", () => {
    const parsed = parseCitation(
      "Okeke, A. (2026). A web report. Some Body. https://example.org/report",
    );
    expect(parsed.url).toBe("https://example.org/report");
    expect(parsed.doi).toBeNull();
  });

  it("handles a citation with no volume or pages", () => {
    const parsed = parseCitation("Okeke, A. (2026). A standalone book. Academic Press.");

    expect(parsed.title).toBe("A standalone book");
    expect(parsed.publication).toBe("Academic Press");
    expect(parsed.volume).toBeNull();
    expect(parsed.pages).toBeNull();
  });

  it("reads en-dashed page ranges", () => {
    const parsed = parseCitation("Okeke, A. (2026). A study. Journal, 4(2), 11–20.");
    expect(parsed.pages).toBe("11-20");
  });
});

describe("inventing nothing", () => {
  it("returns everything null for text it cannot read", () => {
    const parsed = parseCitation("see the handout my supervisor gave me");

    expect(parsed.authors).toEqual([]);
    expect(parsed.year).toBeNull();
    expect(parsed.title).toBeNull();
    expect(parsed.publication).toBeNull();
    expect(parsed.parsedAnything).toBe(false);
  });

  it("returns everything null for empty input", () => {
    expect(parseCitation("")).toMatchObject({ authors: [], year: null, parsedAnything: false });
    expect(parseCitation("   ")).toMatchObject({ parsedAnything: false });
  });

  it("leaves a missing year null rather than guessing one", () => {
    const parsed = parseCitation("Okeke, A. Study habits and performance. Journal of Education.");
    expect(parsed.year).toBeNull();
  });

  it("leaves publication null when the citation stops at the title", () => {
    const parsed = parseCitation("Okeke, A. (2026). An unpublished manuscript");

    expect(parsed.title).toBe("An unpublished manuscript");
    expect(parsed.publication).toBeNull();
    expect(parsed.volume).toBeNull();
    expect(parsed.issue).toBeNull();
    expect(parsed.pages).toBeNull();
  });

  it("never produces the strings a careless default would leave behind", () => {
    for (const input of [
      "nonsense",
      "Okeke",
      "(2026)",
      "https://example.org",
      "10.1234/x",
    ]) {
      const parsed = parseCitation(input);
      const values = [parsed.title, parsed.publication, parsed.year, ...parsed.authors];
      for (const value of values) {
        expect(value ?? "").not.toMatch(/undefined|null|n\.d\.|unknown/i);
      }
    }
  });

  it("reports whether it read anything, so the caller can tell", () => {
    expect(parseCitation("Okeke, A. (2026). A study. Journal.").parsedAnything).toBe(true);
    expect(parseCitation("just some words").parsedAnything).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";

import { retrieveSources } from "@/server/services/references/retrieve";

/**
 * Source retrieval.
 *
 * The network is stubbed so these never depend on an external service being
 * up. What they protect is that the shape of a real API response is read
 * correctly, that the recency filter reaches the query rather than being a
 * hint, and — most importantly — that a failure degrades rather than
 * fabricating.
 *
 * Verified against the live APIs separately: a topic search returned eleven
 * real works, every one with a resolving DOI, the five-year filter excluding
 * everything before 2022.
 */

const openAlexPayload = {
  results: [
    {
      title: "Students' voices on generative AI",
      display_name: "Students' voices on generative AI",
      publication_year: 2023,
      doi: "https://doi.org/10.1186/s41239-023-00411-8",
      cited_by_count: 2018,
      authorships: [
        { author: { display_name: "Cecilia Ka Yuk Chan" } },
        { author: { display_name: "Wenjie Hu" } },
      ],
      primary_location: {
        source: { display_name: "International Journal of Educational Technology" },
      },
      abstract_inverted_index: { This: [0], study: [1], examined: [2] },
    },
  ],
};

const crossrefPayload = {
  message: {
    items: [
      {
        DOI: "10.3390/ijerph19169960",
        title: ["The Use of Social Media in Children and Adolescents"],
        author: [{ family: "Bozzola", given: "Elena" }, { family: "Spina", given: "Giulia" }],
        issued: { "date-parts": [[2022, 8, 12]] },
        "container-title": ["International Journal of Environmental Research"],
        abstract: "<jats:p>Social media use has grown.</jats:p>",
        "is-referenced-by-count": 548,
      },
    ],
  },
};

/** A fetch that answers each database from a fixture, recording the URLs. */
function stubFetch(calls: string[] = []) {
  return Object.assign(
    vi.fn(async (url: string | URL) => {
      const href = String(url);
      calls.push(href);
      const body = href.includes("openalex") ? openAlexPayload : crossrefPayload;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
    { calls },
  ) as unknown as typeof fetch & { calls: string[] };
}

describe("reading real database responses", () => {
  it("reads OpenAlex and Crossref records into one shape", async () => {
    const sources = await retrieveSources({ query: "social media", fetchImpl: stubFetch() });

    expect(sources).toHaveLength(2);

    const openAlex = sources.find((s) => s.source === "openalex")!;
    expect(openAlex.title).toBe("Students' voices on generative AI");
    expect(openAlex.authors).toEqual(["Cecilia Ka Yuk Chan", "Wenjie Hu"]);
    expect(openAlex.year).toBe("2023");
    // The DOI prefix is stripped so the bare identifier is stored.
    expect(openAlex.doi).toBe("10.1186/s41239-023-00411-8");
    expect(openAlex.url).toBe("https://doi.org/10.1186/s41239-023-00411-8");

    const crossref = sources.find((s) => s.source === "crossref")!;
    expect(crossref.authors).toEqual(["Bozzola, Elena", "Spina, Giulia"]);
    expect(crossref.year).toBe("2022");
    // JATS markup is stripped from the abstract.
    expect(crossref.abstract).toBe("Social media use has grown.");
  });

  it("reassembles an OpenAlex inverted abstract into readable text", async () => {
    const sources = await retrieveSources({ query: "x", fetchImpl: stubFetch() });
    const openAlex = sources.find((s) => s.source === "openalex")!;
    expect(openAlex.abstract).toBe("This study examined");
  });

  it("orders well-cited work first", async () => {
    const sources = await retrieveSources({ query: "x", fetchImpl: stubFetch() });
    expect(sources[0]!.citedByCount).toBe(2018);
    expect(sources[1]!.citedByCount).toBe(548);
  });
});

describe("recency is a filter, not a hint", () => {
  it("sends a date filter to both databases", async () => {
    const calls: string[] = [];
    await retrieveSources({ query: "x", recencyYears: 5, fetchImpl: stubFetch(calls) });

    const since = new Date().getFullYear() - 4;
    const openAlexCall = calls.find((c) => c.includes("openalex"))!;
    const crossrefCall = calls.find((c) => c.includes("crossref"))!;

    // Encoded into the filter parameter, so old work never reaches us.
    expect(decodeURIComponent(openAlexCall)).toContain(`from_publication_date:${since}-01-01`);
    expect(decodeURIComponent(crossrefCall)).toContain(`from-pub-date:${since}-01-01`);
  });

  it("sends no date filter when no limit was asked for", async () => {
    const calls: string[] = [];
    await retrieveSources({ query: "x", fetchImpl: stubFetch(calls) });

    for (const call of calls) {
      expect(decodeURIComponent(call)).not.toContain("from_publication_date");
      expect(decodeURIComponent(call)).not.toContain("from-pub-date");
    }
  });

  it("ignores a nonsensical recency value rather than excluding everything", async () => {
    const calls: string[] = [];
    await retrieveSources({ query: "x", recencyYears: 0, fetchImpl: stubFetch(calls) });
    expect(decodeURIComponent(calls[0]!)).not.toContain("from_publication_date");
  });
});

describe("failing without fabricating", () => {
  it("returns the other database's results when one is down", async () => {
    // Half a reading list beats an error page, and beats inventing the rest.
    const halfDown = vi.fn(async (url: string | URL) => {
      if (String(url).includes("openalex")) throw new Error("network");
      return new Response(JSON.stringify(crossrefPayload), { status: 200 });
    }) as unknown as typeof fetch;

    const sources = await retrieveSources({ query: "x", fetchImpl: halfDown });
    expect(sources).toHaveLength(1);
    expect(sources[0]!.source).toBe("crossref");
  });

  it("raises rather than returning nothing when both are down", async () => {
    const allDown = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;

    await expect(retrieveSources({ query: "x", fetchImpl: allDown })).rejects.toThrow(
      /could not reach the reference databases/i,
    );
  });

  it("returns nothing for an empty query without calling out", async () => {
    const fetchImpl = stubFetch();
    expect(await retrieveSources({ query: "   ", fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("drops duplicates that both databases returned", async () => {
    const sameWork = vi.fn(async (url: string | URL) =>
      new Response(
        JSON.stringify(
          String(url).includes("openalex")
            ? {
                results: [
                  {
                    title: "A shared paper",
                    publication_year: 2024,
                    doi: "https://doi.org/10.1/shared",
                    authorships: [],
                  },
                ],
              }
            : {
                message: {
                  items: [
                    {
                      DOI: "10.1/shared",
                      title: ["A shared paper"],
                      author: [],
                      issued: { "date-parts": [[2024]] },
                    },
                  ],
                },
              },
        ),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const sources = await retrieveSources({ query: "x", fetchImpl: sameWork });
    expect(sources).toHaveLength(1);
  });

  it("discards records with no usable title", async () => {
    const rubbish = vi.fn(async () =>
      new Response(JSON.stringify({ results: [{ title: "", authorships: [] }] }), { status: 200 }),
    ) as unknown as typeof fetch;

    expect(await retrieveSources({ query: "x", fetchImpl: rubbish })).toEqual([]);
  });
});

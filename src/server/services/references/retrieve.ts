import { AppError } from "@/server/errors";

/**
 * Finding real published sources for a topic.
 *
 * This is the honest version of "the AI does the research". A model asked to
 * recall citations produces plausible ones — real-sounding authors, genuine
 * journal names, DOIs that resolve to nothing — and in academic work that is
 * not a poor answer, it is a misconduct hearing waiting to happen. Marking
 * them for review does not save it either: the student who asked the AI to do
 * the research is precisely the one who will not check.
 *
 * So nothing here is generated. Records come from OpenAlex and Crossref, two
 * free bibliographic databases covering well over a hundred million works
 * between them. Every field returned is a field the database holds, and every
 * DOI resolves.
 *
 * Recency is a real filter rather than a hint. Both APIs support filtering by
 * publication date, so "only the last five years" excludes older work at the
 * source instead of asking a model to prefer recent things.
 */

export interface RetrievedSource {
  title: string;
  authors: string[];
  year: string | null;
  publication: string | null;
  doi: string | null;
  url: string | null;
  /** Which database this came from, recorded so provenance is never guessed. */
  source: "openalex" | "crossref";
  citedByCount: number | null;
  abstract: string | null;
}

export interface RetrieveOptions {
  /** Free-text topic or search phrase. */
  query: string;
  /** Only works published within this many years. Undefined means any age. */
  recencyYears?: number | null;
  limit?: number;
  /** Overridable so tests never reach the network. */
  fetchImpl?: typeof fetch;
}

/**
 * A contact address, which both APIs ask for in the polite pool.
 *
 * Identifying the caller is a condition of their fair-use policies and buys
 * higher rate limits. It is not authentication and carries no secret.
 */
const POLITE_AGENT = "MyProjectBuilder/1.0 (academic writing assistant)";

const TIMEOUT_MS = 12_000;

async function getJson(
  url: string,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": POLITE_AGENT },
    });
    if (!response.ok) throw new Error(`${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * OpenAlex stores abstracts as an inverted index — a map of word to positions —
 * so the readable text has to be reassembled from it.
 */
function rebuildAbstract(inverted: unknown): string | null {
  if (!inverted || typeof inverted !== "object") return null;

  const positions: Array<[number, string]> = [];
  for (const [word, spots] of Object.entries(inverted as Record<string, number[]>)) {
    if (!Array.isArray(spots)) continue;
    for (const spot of spots) positions.push([spot, word]);
  }
  if (positions.length === 0) return null;

  return positions
    .sort((a, b) => a[0] - b[0])
    .map(([, word]) => word)
    .join(" ")
    .slice(0, 1200);
}

function earliestYear(recencyYears: number | null | undefined): number | null {
  if (!recencyYears || recencyYears <= 0) return null;
  return new Date().getFullYear() - recencyYears + 1;
}

async function fromOpenAlex(options: RetrieveOptions): Promise<RetrievedSource[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const limit = options.limit ?? 12;
  const since = earliestYear(options.recencyYears);

  const filters = ["has_doi:true", "type:article"];
  if (since) filters.push(`from_publication_date:${since}-01-01`);

  const url =
    "https://api.openalex.org/works" +
    `?search=${encodeURIComponent(options.query)}` +
    `&filter=${encodeURIComponent(filters.join(","))}` +
    `&per-page=${limit}` +
    "&sort=relevance_score:desc";

  const payload = (await getJson(url, fetchImpl)) as {
    results?: Array<Record<string, unknown>>;
  };

  return (payload.results ?? []).map((work) => {
    const authorships = (work.authorships ?? []) as Array<{ author?: { display_name?: string } }>;
    const venue = work.primary_location as { source?: { display_name?: string } } | undefined;
    const doi = typeof work.doi === "string" ? work.doi.replace(/^https?:\/\/doi\.org\//, "") : null;

    return {
      title: String(work.title ?? work.display_name ?? "").trim(),
      authors: authorships
        .map((a) => a.author?.display_name?.trim())
        .filter((name): name is string => Boolean(name)),
      year: work.publication_year ? String(work.publication_year) : null,
      publication: venue?.source?.display_name?.trim() ?? null,
      doi,
      url: doi ? `https://doi.org/${doi}` : null,
      source: "openalex" as const,
      citedByCount: typeof work.cited_by_count === "number" ? work.cited_by_count : null,
      abstract: rebuildAbstract(work.abstract_inverted_index),
    };
  });
}

async function fromCrossref(options: RetrieveOptions): Promise<RetrievedSource[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const limit = options.limit ?? 12;
  const since = earliestYear(options.recencyYears);

  const filters = ["type:journal-article"];
  if (since) filters.push(`from-pub-date:${since}-01-01`);

  const url =
    "https://api.crossref.org/works" +
    `?query=${encodeURIComponent(options.query)}` +
    `&filter=${encodeURIComponent(filters.join(","))}` +
    `&rows=${limit}` +
    "&select=DOI,title,author,issued,container-title,abstract,is-referenced-by-count";

  const payload = (await getJson(url, fetchImpl)) as {
    message?: { items?: Array<Record<string, unknown>> };
  };

  return (payload.message?.items ?? []).map((item) => {
    const authors = (item.author ?? []) as Array<{ family?: string; given?: string }>;
    const issued = item.issued as { "date-parts"?: number[][] } | undefined;
    const year = issued?.["date-parts"]?.[0]?.[0];
    const doi = typeof item.DOI === "string" ? item.DOI : null;

    return {
      title: String((item.title as string[])?.[0] ?? "").trim(),
      authors: authors
        .map((a) => [a.family, a.given].filter(Boolean).join(", "))
        .filter(Boolean),
      year: year ? String(year) : null,
      publication: String((item["container-title"] as string[])?.[0] ?? "").trim() || null,
      doi,
      url: doi ? `https://doi.org/${doi}` : null,
      source: "crossref" as const,
      citedByCount:
        typeof item["is-referenced-by-count"] === "number"
          ? (item["is-referenced-by-count"] as number)
          : null,
      abstract:
        typeof item.abstract === "string"
          ? item.abstract.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200)
          : null,
    };
  });
}

/** Drops duplicates by DOI, then by normalised title. */
function dedupe(sources: RetrievedSource[]): RetrievedSource[] {
  const seen = new Set<string>();
  const out: RetrievedSource[] = [];

  for (const source of sources) {
    const key = source.doi?.toLowerCase() ?? source.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(source);
  }

  return out;
}

/**
 * Finds real published sources for a topic.
 *
 * Both databases are queried and the results merged, because their coverage
 * differs — OpenAlex is broader for open scholarship, Crossref is stronger on
 * publisher metadata. A failure in one is not fatal: the other's results are
 * still returned, since half a reading list beats an error page. Only when
 * both fail does this raise.
 */
export async function retrieveSources(options: RetrieveOptions): Promise<RetrievedSource[]> {
  if (!options.query.trim()) return [];

  const attempts = await Promise.allSettled([fromOpenAlex(options), fromCrossref(options)]);

  const found = attempts
    .filter((a): a is PromiseFulfilledResult<RetrievedSource[]> => a.status === "fulfilled")
    .flatMap((a) => a.value)
    .filter((source) => source.title.length > 3);

  if (found.length === 0 && attempts.every((a) => a.status === "rejected")) {
    throw new AppError("AI_FAILED", {
      message:
        "Could not reach the reference databases just now. Your project is unchanged — try again in a moment.",
    });
  }

  // Well-cited work first: for a literature review the widely-read papers are
  // the ones a supervisor expects to see.
  return dedupe(found).sort((a, b) => (b.citedByCount ?? 0) - (a.citedByCount ?? 0));
}

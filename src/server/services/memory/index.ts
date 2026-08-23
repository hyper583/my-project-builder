import { prisma } from "@/server/db";
import type { CitableReference, UntrustedSource } from "@/server/services/ai/types";
import { formatReference } from "@/server/services/export/assemble";
import { inTextCitation } from "@/server/services/references/cite";

/**
 * Project memory.
 *
 * Assembles the trusted facts a model needs for one stage. Deliberately not
 * "send the whole project every time": the facts below are compact and always
 * relevant, while source material is retrieved per stage by relevance, so a
 * project with fifty uploaded pages does not pay for all of them on every call.
 *
 * Everything this module returns is TRUSTED — it is assembled from our own
 * database columns, not from document text. Untrusted material is returned
 * separately as `sources` so the prompt layer can fence it.
 */

export interface ProjectMemory {
  /** Compact, trusted project facts. Safe to place in the prompt directly. */
  readonly context: string;
  /** Untrusted extracted document text, fenced by the prompt layer. */
  readonly sources: UntrustedSource[];
  /**
   * Verified published works this project may cite.
   *
   * Empty until the retrieval stage has run, which is why that stage moved
   * ahead of the writing: for as long as it ran last, every chapter was
   * written with nothing to cite and the citations in the prose referred to
   * no record at all.
   */
  readonly references: CitableReference[];
}

/**
 * The works the model is allowed to cite.
 *
 * VERIFIED only. Those came from a bibliographic database and their DOIs
 * resolve; entries a student typed or pasted are unverified by definition, and
 * feeding them back as citable would launder a guess into an authority.
 */
async function citableReferences(projectId: string, limit: number): Promise<CitableReference[]> {
  /*
   * Insertion order, which is citation-rank order.
   *
   * `retrieveSources` sorts by how often a work has been cited — for a
   * literature review the widely-read papers are the ones a supervisor expects
   * — and `findSources` writes them in that order. Ordering by year here threw
   * that away and put the newest first, so the model was shown obscure papers
   * from this year while the foundational, heavily-cited ones sat at the
   * bottom of a list of thirty. It cited nothing from the list at all.
   */
  const rows = await prisma.projectReference.findMany({
    where: { projectId, verification: "VERIFIED" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  return rows.flatMap((row) => {
    // Some records repeat an author verbatim. Left alone it reaches the model
    // as "Keerthana L E, Keerthana L E", which reads as two people.
    const authors = [...new Set(row.authors.map((a) => a.trim()).filter(Boolean))];
    const inText = inTextCitation({ authors, year: row.year });
    const full = formatReference({ ...row, authors });
    // A work with no usable author or year has no citation form, so offering
    // it invites the model to invent one.
    if (!inText || !full) return [];
    return [{ inText, full }];
  });
}

function line(label: string, value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  return `${label}: ${value.trim()}`;
}

function list(label: string, values: readonly string[]): string | null {
  if (values.length === 0) return null;
  return `${label}:\n${values.map((v, i) => `  ${i + 1}. ${v}`).join("\n")}`;
}

/**
 * The stable facts that must stay consistent across every chapter.
 *
 * These are exactly the values the consistency engine later checks, which is
 * the point: the same numbers reach every stage, so chapters cannot disagree
 * about the sample size because they were each told something different.
 */
export async function buildProjectMemory(
  projectId: string,
  options: { query?: string; maxSources?: number; maxReferences?: number } = {},
): Promise<ProjectMemory> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      institution: true,
      research: true,
      methodology: true,
      formatting: true,
      instructions: { orderBy: { createdAt: "asc" } },
      variables: { orderBy: { order: "asc" } },
    },
  });

  const i = project.institution;
  const r = project.research;
  const f = project.formatting;

  const facts = [
    line("Topic", project.topic),
    project.topicApproved === "YES"
      ? "Topic status: officially approved — reproduce this wording exactly and do not alter it"
      : null,
    line("Research area", project.researchArea),
    line("Project type", project.projectTypeCustom ?? project.projectType),
    line("Institution", i?.institution),
    line("Faculty", i?.faculty),
    line("Department", i?.department),
    line("Programme", i?.programme),
    line("Academic level", i?.academicLevel),
    line("Research problem", r?.researchProblem),
    line("Aim", r?.aim),
    list("Objectives", r?.objectives ?? []),
    list("Research questions", r?.researchQuestions ?? []),
    list("Hypotheses", r?.hypotheses ?? []),
    line("Study location", r?.studyLocation),
    line("Target population", r?.targetPopulation),
    line("Sample population", r?.samplePopulation),
    line("Sample size", r?.sampleSize),
    line("Sampling technique", r?.samplingTechnique),
    line("Research design", r?.researchDesign),
    line("Data collection method", r?.dataCollectionMethod),
    line("Research instruments", r?.researchInstruments),
    line("Data analysis method", r?.dataAnalysisMethod),
    line("Theoretical framework", r?.theoreticalFramework),
    line("Conceptual framework", r?.conceptualFramework),
    line("Scope", r?.scope),
    line("Limitations", r?.limitations),
    line("Key terminology", r?.keyTerminology),
    line("Citation style", f?.citationStyleCustom ?? f?.citationStyle),
    line("Chapter numbering", f?.chapterNumbering),
    line("Formatting notes", f?.customInstructions),
  ].filter((entry): entry is string => entry !== null);

  const variables = project.variables.map(
    (v) => `  ${v.kind.toLowerCase()}: ${v.name}${v.description ? ` — ${v.description}` : ""}`,
  );
  if (variables.length > 0) facts.push(`Variables:\n${variables.join("\n")}`);

  for (const instruction of project.instructions) {
    const heading =
      instruction.source === "SUPERVISOR"
        ? "Supervisor instructions"
        : instruction.source === "DEPARTMENT"
          ? "Departmental requirements"
          : "Additional information from the student";
    facts.push(`${heading}:\n${instruction.content.trim()}`);
  }

  if (project.methodology) {
    const data = project.methodology.data as Record<string, unknown>;
    const entries = Object.entries(data)
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
      .map(([key, value]) => `  ${key}: ${Array.isArray(value) ? value.join("; ") : String(value)}`);
    if (entries.length > 0) {
      facts.push(`Methodology (${project.methodology.type}):\n${entries.join("\n")}`);
    }
  }

  const sources = await retrieveSources(projectId, options.query, options.maxSources ?? 6);
  // Capped: the list rides in the cached prefix on every section call, so it is
  // paid for once and read back cheaply, but an unbounded bibliography would
  // still crowd out the project facts it sits beside.
  const references = await citableReferences(projectId, options.maxReferences ?? 30);

  return { context: facts.join("\n\n"), sources, references };
}

/**
 * Retrieves the most relevant chunks of the student's uploaded material.
 *
 * Uses the Postgres full-text index added in migration
 * `20260819090000_document_fulltext_index`. When no query is supplied — the
 * early pipeline stages, where nothing specific is being asked — it falls back
 * to the opening chunks of each document, which is where supervisor
 * instructions and briefs almost always are.
 */
async function retrieveSources(
  projectId: string,
  query: string | undefined,
  limit: number,
): Promise<UntrustedSource[]> {
  if (query && query.trim().length > 2) {
    const rows = await prisma.$queryRaw<Array<{ name: string; text: string }>>`
      SELECT d."originalName" AS name, c.text AS text
      FROM document_chunk c
      JOIN document_extraction e ON e.id = c."extractionId"
      JOIN project_document d ON d.id = e."documentId"
      WHERE d."projectId" = ${projectId}
        AND to_tsvector('english', c.text) @@ plainto_tsquery('english', ${query})
      ORDER BY ts_rank(to_tsvector('english', c.text), plainto_tsquery('english', ${query})) DESC
      LIMIT ${limit}
    `;
    if (rows.length > 0) {
      return rows.map((row) => ({ label: row.name, text: row.text }));
    }
  }

  const rows = await prisma.$queryRaw<Array<{ name: string; text: string }>>`
    SELECT d."originalName" AS name, c.text AS text
    FROM document_chunk c
    JOIN document_extraction e ON e.id = c."extractionId"
    JOIN project_document d ON d.id = e."documentId"
    WHERE d."projectId" = ${projectId} AND c."order" = 0
    ORDER BY d."createdAt" ASC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({ label: row.name, text: row.text }));
}

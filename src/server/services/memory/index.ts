import { prisma } from "@/server/db";
import type { UntrustedSource } from "@/server/services/ai/types";

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
  options: { query?: string; maxSources?: number } = {},
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

  return { context: facts.join("\n\n"), sources };
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

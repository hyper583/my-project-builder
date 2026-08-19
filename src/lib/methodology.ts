import { z } from "zod";

/**
 * Project-type-specific methodology forms.
 *
 * Different disciplines need genuinely different questions, so the fields are
 * declared here as data and stored in `ProjectMethodology.data` as JSON,
 * validated by the matching Zod schema. Adding a new project type is a new
 * entry in this file — not a database migration.
 */

export type MethodologyKey = "general" | "experimental" | "questionnaire" | "software" | "business";

export interface MethodologyField {
  readonly name: string;
  readonly label: string;
  readonly kind: "text" | "textarea" | "list";
  readonly hint?: string;
}

export interface MethodologyForm {
  readonly key: MethodologyKey;
  readonly label: string;
  readonly description: string;
  readonly fields: readonly MethodologyField[];
}

export const METHODOLOGY_FORMS: Record<MethodologyKey, MethodologyForm> = {
  general: {
    key: "general",
    label: "General research methodology",
    description: "Suits most written research projects.",
    fields: [
      { name: "approach", label: "Research approach", kind: "text", hint: "Qualitative, quantitative or mixed methods." },
      { name: "procedure", label: "Procedure", kind: "textarea", hint: "The steps you will follow, in order." },
      { name: "instruments", label: "Instruments and tools", kind: "textarea" },
      { name: "ethicalConsiderations", label: "Ethical considerations", kind: "textarea" },
    ],
  },
  experimental: {
    key: "experimental",
    label: "Experimental / laboratory methodology",
    description: "For laboratory work and controlled experiments.",
    fields: [
      { name: "materials", label: "Materials", kind: "textarea" },
      { name: "equipment", label: "Equipment", kind: "textarea" },
      { name: "experimentalDesign", label: "Experimental design", kind: "textarea", hint: "For example, completely randomised design with three replicates." },
      { name: "procedure", label: "Procedure", kind: "textarea" },
      { name: "controlGroups", label: "Control groups", kind: "textarea" },
      { name: "measurements", label: "Measurements taken", kind: "textarea" },
      { name: "replication", label: "Replication", kind: "text" },
    ],
  },
  questionnaire: {
    key: "questionnaire",
    label: "Questionnaire / survey methodology",
    description: "For survey-based studies.",
    fields: [
      { name: "targetRespondents", label: "Target respondents", kind: "textarea" },
      { name: "questionnaireType", label: "Questionnaire type", kind: "text", hint: "Structured, semi-structured or unstructured." },
      { name: "sections", label: "Questionnaire sections", kind: "list", hint: "One per section, in the order they appear." },
      { name: "responseScale", label: "Response scale", kind: "text", hint: "For example, a 5-point Likert scale." },
      { name: "distributionMethod", label: "Distribution method", kind: "textarea" },
      { name: "validityReliability", label: "Validity and reliability", kind: "textarea" },
    ],
  },
  software: {
    key: "software",
    label: "Software project methodology",
    description: "For systems and application development projects.",
    fields: [
      { name: "problem", label: "Problem being solved", kind: "textarea" },
      { name: "existingSystem", label: "Existing system", kind: "textarea" },
      { name: "proposedSystem", label: "Proposed system", kind: "textarea" },
      { name: "technologyStack", label: "Technology stack", kind: "textarea" },
      { name: "users", label: "Users and roles", kind: "textarea" },
      { name: "functionalRequirements", label: "Functional requirements", kind: "list" },
      { name: "nonFunctionalRequirements", label: "Non-functional requirements", kind: "list" },
      { name: "databaseRequirements", label: "Database requirements", kind: "textarea" },
      { name: "systemArchitecture", label: "System architecture", kind: "textarea" },
      { name: "modules", label: "Modules", kind: "list" },
      { name: "developmentModel", label: "Development model", kind: "text", hint: "For example, Waterfall, Agile or SSADM." },
    ],
  },
  business: {
    key: "business",
    label: "Business / management methodology",
    description: "For organisational and management studies.",
    fields: [
      { name: "organisation", label: "Organisation studied", kind: "textarea" },
      { name: "industry", label: "Industry / sector", kind: "text" },
      { name: "population", label: "Population", kind: "textarea" },
      { name: "researchDesign", label: "Research design", kind: "textarea" },
      { name: "dataCollection", label: "Data collection", kind: "textarea" },
      { name: "analysisTechnique", label: "Analysis technique", kind: "textarea" },
    ],
  },
};

/** Maps a project type key to the methodology form it should show. */
export const PROJECT_TYPE_TO_METHODOLOGY: Record<string, MethodologyKey> = {
  "undergraduate-project": "general",
  "final-year-project": "general",
  "research-project": "general",
  seminar: "general",
  thesis: "general",
  dissertation: "general",
  "research-paper": "general",
  "case-study": "business",
  "laboratory-project": "experimental",
  "software-project": "software",
  other: "general",
};

export function methodologyKeyFor(projectType: string | null | undefined): MethodologyKey {
  if (!projectType) return "general";
  return PROJECT_TYPE_TO_METHODOLOGY[projectType] ?? "general";
}

/**
 * Builds a Zod schema for one methodology form. Every field is optional and
 * length-capped; unknown keys are stripped so a tampered payload cannot inject
 * arbitrary JSON into the record.
 */
export function methodologySchemaFor(key: MethodologyKey) {
  const form = METHODOLOGY_FORMS[key];
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of form.fields) {
    shape[field.name] =
      field.kind === "list"
        ? z.array(z.string().trim().max(1000)).max(50).optional()
        : z.string().trim().max(5000).optional();
  }
  return z.object(shape).strip();
}

export type MethodologyData = Record<string, string | string[] | undefined>;

"use client";

import { useCallback } from "react";

import {
  ListField,
  RadioField,
  SaveIndicator,
  SelectField,
  StepIntro,
  TextAreaField,
  TextField,
} from "@/components/wizard/fields";
import { useAutosave } from "@/components/wizard/use-autosave";
import { METHODOLOGY_FORMS, type MethodologyKey } from "@/lib/methodology";
import {
  saveFormattingStep,
  saveInstitutionStep,
  saveInstructionsStep,
  saveMethodologyStep,
  saveProjectTypeStep,
  saveResearchStep,
  saveTopicStep,
} from "@/server/actions/wizard";

/** Splits a comma-separated string into a list, and back, for keyword entry. */
const toList = (value: string) => value.split(",").map((s) => s.trim()).filter(Boolean);

// ============================================================
// Step 1 — Institution
// ============================================================

export interface InstitutionValues {
  institution: string;
  campus: string;
  faculty: string;
  department: string;
  programme: string;
  degree: string;
  academicLevel: string;
}

const LEVELS = ["100 Level", "200 Level", "300 Level", "400 Level", "500 Level", "Postgraduate"];

export function InstitutionStep({
  projectId,
  initial,
  institutions,
  departments,
}: {
  projectId: string;
  initial: InstitutionValues;
  institutions: string[];
  departments: string[];
}) {
  const save = useCallback(
    (values: InstitutionValues) => saveInstitutionStep({ projectId, ...values }),
    [projectId],
  );
  const { values, setField, state, message } = useAutosave(initial, save);

  return (
    <div className="space-y-6">
      <StepIntro>
        Where you are studying. If your institution isn&apos;t in the list, just type it —
        custom values are always accepted.
      </StepIntro>

      <datalist id="institutions">
        {institutions.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id="departments">
        {departments.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id="levels">
        {LEVELS.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Institution" value={values.institution} list="institutions" onChange={(v) => setField("institution", v)} hint="Type your own if it isn't listed." />
        <TextField label="Campus" value={values.campus} onChange={(v) => setField("campus", v)} hint="Leave blank if your institution has one campus." />
        <TextField label="Faculty" value={values.faculty} onChange={(v) => setField("faculty", v)} />
        <TextField label="Department" value={values.department} list="departments" onChange={(v) => setField("department", v)} />
        <TextField label="Programme" value={values.programme} onChange={(v) => setField("programme", v)} hint="For example, B.Sc. Computer Science." />
        <TextField label="Degree" value={values.degree} onChange={(v) => setField("degree", v)} />
        <TextField label="Academic level" value={values.academicLevel} list="levels" onChange={(v) => setField("academicLevel", v)} hint="For example, 400 Level." />
      </div>

      <SaveIndicator state={state} message={message} />
    </div>
  );
}

// ============================================================
// Step 2 — Project type
// ============================================================

export interface ProjectTypeValues {
  projectType: string;
  projectTypeCustom: string;
}

export function ProjectTypeStep({
  projectId,
  initial,
  types,
}: {
  projectId: string;
  initial: ProjectTypeValues;
  types: ReadonlyArray<{ value: string; label: string }>;
}) {
  const save = useCallback(
    (values: ProjectTypeValues) => saveProjectTypeStep({ projectId, ...values }),
    [projectId],
  );
  const { values, setField, state, message } = useAutosave(initial, save);

  return (
    <div className="space-y-6">
      <StepIntro>
        What kind of project is this? Your answer decides which methodology questions you are
        asked in Step 5.
      </StepIntro>

      <RadioField
        legend="Project type"
        value={values.projectType}
        onChange={(v) => setField("projectType", v)}
        options={types}
      />

      {values.projectType === "other" ? (
        <TextField
          label="Describe your project type"
          value={values.projectTypeCustom}
          onChange={(v) => setField("projectTypeCustom", v)}
        />
      ) : null}

      <SaveIndicator state={state} message={message} />
    </div>
  );
}

// ============================================================
// Step 3 — Topic
// ============================================================

export interface TopicValues {
  topic: string;
  topicApproved: "YES" | "NO" | "UNSURE";
  researchArea: string;
  keywordsText: string;
  description: string;
}

export function TopicStep({ projectId, initial }: { projectId: string; initial: TopicValues }) {
  const save = useCallback(
    (values: TopicValues) =>
      saveTopicStep({
        projectId,
        topic: values.topic,
        topicApproved: values.topicApproved,
        researchArea: values.researchArea,
        keywords: toList(values.keywordsText),
        description: values.description,
      }),
    [projectId],
  );
  const { values, setField, state, message } = useAutosave(initial, save);

  return (
    <div className="space-y-6">
      <StepIntro>
        Your topic drives everything that follows. If it has already been approved, it is kept
        word for word unless you change it here yourself.
      </StepIntro>

      <TextAreaField
        label="Exact project topic"
        value={values.topic}
        onChange={(v) => setField("topic", v)}
        rows={3}
        hint="Enter it exactly as approved, including capitalisation."
      />

      <RadioField
        legend="Is this your officially approved topic?"
        value={values.topicApproved}
        onChange={(v) => setField("topicApproved", v as TopicValues["topicApproved"])}
        options={[
          { value: "YES", label: "Yes" },
          { value: "NO", label: "No" },
          { value: "UNSURE", label: "Not sure" },
        ]}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Research area" value={values.researchArea} onChange={(v) => setField("researchArea", v)} hint="For example, Human–Computer Interaction." />
        <TextField label="Keywords" value={values.keywordsText} onChange={(v) => setField("keywordsText", v)} hint="Separate with commas." />
      </div>

      <TextAreaField label="Project description" value={values.description} onChange={(v) => setField("description", v)} rows={5} hint="A short summary in your own words." />

      <SaveIndicator state={state} message={message} />
    </div>
  );
}

// ============================================================
// Step 4 — Research information
// ============================================================

export interface ResearchValues {
  researchProblem: string;
  aim: string;
  objectives: string[];
  researchQuestions: string[];
  hypotheses: string[];
  studyLocation: string;
  targetPopulation: string;
  samplePopulation: string;
  sampleSize: string;
  samplingTechnique: string;
  researchDesign: string;
  dataCollectionMethod: string;
  researchInstruments: string;
  dataAnalysisMethod: string;
  theoreticalFramework: string;
  conceptualFramework: string;
  limitations: string;
  scope: string;
  keyTerminology: string;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5 border-t border-border pt-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function ResearchStep({
  projectId,
  initial,
}: {
  projectId: string;
  initial: ResearchValues;
}) {
  const save = useCallback(
    (values: ResearchValues) => saveResearchStep({ projectId, ...values }),
    [projectId],
  );
  const { values, setField, state, message } = useAutosave(initial, save);

  return (
    <div className="space-y-6">
      <StepIntro>
        The heart of your project. Fill in what you know — anything you leave blank is simply
        marked as still needed, never invented for you.
      </StepIntro>

      <Group title="Problem and purpose">
        <TextAreaField label="Research problem" value={values.researchProblem} onChange={(v) => setField("researchProblem", v)} rows={4} />
        <TextAreaField label="Aim of the study" value={values.aim} onChange={(v) => setField("aim", v)} rows={3} />
        <ListField label="Objectives" values={values.objectives} onChange={(v) => setField("objectives", v)} addLabel="Add objective" hint="One per line, in the order they appear in your project." />
        <ListField label="Research questions" values={values.researchQuestions} onChange={(v) => setField("researchQuestions", v)} addLabel="Add question" />
        <ListField label="Hypotheses" values={values.hypotheses} onChange={(v) => setField("hypotheses", v)} addLabel="Add hypothesis" hint="Leave empty if your study does not test hypotheses." />
      </Group>

      <Group title="Population and sampling">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Study location" value={values.studyLocation} onChange={(v) => setField("studyLocation", v)} />
          <TextField label="Target population" value={values.targetPopulation} onChange={(v) => setField("targetPopulation", v)} />
          <TextField label="Sample population" value={values.samplePopulation} onChange={(v) => setField("samplePopulation", v)} />
          <TextField label="Sample size" value={values.sampleSize} onChange={(v) => setField("sampleSize", v)} hint="The figure you will use throughout." />
          <TextField label="Sampling technique" value={values.samplingTechnique} onChange={(v) => setField("samplingTechnique", v)} />
          <TextField label="Research design" value={values.researchDesign} onChange={(v) => setField("researchDesign", v)} />
        </div>
      </Group>

      <Group title="Data">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Data collection method" value={values.dataCollectionMethod} onChange={(v) => setField("dataCollectionMethod", v)} />
          <TextField label="Research instruments" value={values.researchInstruments} onChange={(v) => setField("researchInstruments", v)} />
          <TextField label="Data analysis method" value={values.dataAnalysisMethod} onChange={(v) => setField("dataAnalysisMethod", v)} />
        </div>
      </Group>

      <Group title="Framework and scope">
        <TextAreaField label="Theoretical framework" value={values.theoreticalFramework} onChange={(v) => setField("theoreticalFramework", v)} rows={3} />
        <TextAreaField label="Conceptual framework" value={values.conceptualFramework} onChange={(v) => setField("conceptualFramework", v)} rows={3} />
        <TextAreaField label="Scope of the study" value={values.scope} onChange={(v) => setField("scope", v)} rows={3} />
        <TextAreaField label="Limitations" value={values.limitations} onChange={(v) => setField("limitations", v)} rows={3} />
        <TextAreaField label="Key terminology" value={values.keyTerminology} onChange={(v) => setField("keyTerminology", v)} rows={4} hint="Terms your project defines. One per line." />
      </Group>

      <SaveIndicator state={state} message={message} />
    </div>
  );
}

// ============================================================
// Step 5 — Methodology
// ============================================================

export function MethodologyStep({
  projectId,
  methodologyKey,
  initial,
  projectTypeChosen,
}: {
  projectId: string;
  methodologyKey: MethodologyKey;
  initial: Record<string, string | string[]>;
  projectTypeChosen: boolean;
}) {
  const form = METHODOLOGY_FORMS[methodologyKey];
  const save = useCallback(
    (values: Record<string, string | string[]>) => saveMethodologyStep({ projectId, data: values }),
    [projectId],
  );
  const { values, setField, state, message } = useAutosave(initial, save);

  return (
    <div className="space-y-6">
      <StepIntro>
        {projectTypeChosen ? (
          <>
            These questions match your project type. <strong>{form.label}</strong> —{" "}
            {form.description}
          </>
        ) : (
          <>
            You haven&apos;t chosen a project type yet, so these are the general research
            questions. Pick a type in Step 2 to get questions tailored to it.
          </>
        )}
      </StepIntro>

      <div className="space-y-5">
        {form.fields.map((field) => {
          const raw = values[field.name];
          if (field.kind === "list") {
            return (
              <ListField
                key={field.name}
                label={field.label}
                hint={field.hint}
                values={Array.isArray(raw) ? raw : []}
                onChange={(v) => setField(field.name, v)}
              />
            );
          }
          const text = typeof raw === "string" ? raw : "";
          return field.kind === "textarea" ? (
            <TextAreaField key={field.name} label={field.label} hint={field.hint} value={text} rows={4} onChange={(v) => setField(field.name, v)} />
          ) : (
            <TextField key={field.name} label={field.label} hint={field.hint} value={text} onChange={(v) => setField(field.name, v)} />
          );
        })}
      </div>

      <SaveIndicator state={state} message={message} />
    </div>
  );
}

// ============================================================
// Step 7 — Additional information
// ============================================================

export interface InstructionValues {
  student: string;
  supervisor: string;
  department: string;
}

export function InstructionsStep({
  projectId,
  initial,
}: {
  projectId: string;
  initial: InstructionValues;
}) {
  const save = useCallback(
    (values: InstructionValues) => saveInstructionsStep({ projectId, ...values }),
    [projectId],
  );
  const { values, setField, state, message } = useAutosave(initial, save);

  return (
    <div className="space-y-6">
      <StepIntro>
        Tell My Project Builder anything else it needs to know — supervisor instructions,
        departmental requirements, information you have already been given, preferred theories,
        methodology requirements, formatting instructions, or anything that wasn&apos;t covered
        above. This field is deliberately open-ended.
      </StepIntro>

      <TextAreaField label="Additional project information" value={values.student} onChange={(v) => setField("student", v)} rows={10} hint="Anything at all. There is no wrong answer here." />
      <TextAreaField label="Supervisor instructions" value={values.supervisor} onChange={(v) => setField("supervisor", v)} rows={6} hint="Copy them in exactly as given, if you have them in writing." />
      <TextAreaField label="Departmental requirements" value={values.department} onChange={(v) => setField("department", v)} rows={6} />

      <SaveIndicator state={state} message={message} />
    </div>
  );
}

// ============================================================
// Step 8 — Formatting
// ============================================================

export interface FormattingValues {
  citationStyle: string;
  citationStyleCustom: string;
  font: string;
  fontSize: string;
  lineSpacing: string;
  paraSpacing: string;
  margins: string;
  headingStyle: string;
  pageNumbering: string;
  chapterNumbering: string;
  referenceFormat: string;
  tableFormat: string;
  figureFormat: string;
  customInstructions: string;
}

export function FormattingStep({
  projectId,
  initial,
  citationStyles,
}: {
  projectId: string;
  initial: FormattingValues;
  citationStyles: ReadonlyArray<{ value: string; label: string }>;
}) {
  const save = useCallback(
    (values: FormattingValues) => saveFormattingStep({ projectId, ...values }),
    [projectId],
  );
  const { values, setField, state, message } = useAutosave(initial, save);

  return (
    <div className="space-y-6">
      <StepIntro>
        How the finished document should look. These settings drive the Word and PDF export, so
        matching your department&apos;s requirements here saves reformatting later.
      </StepIntro>

      <SelectField label="Citation style" value={values.citationStyle} onChange={(v) => setField("citationStyle", v)} options={citationStyles} />
      {values.citationStyle === "other" ? (
        <TextField label="Describe your citation style" value={values.citationStyleCustom} onChange={(v) => setField("citationStyleCustom", v)} />
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Font" value={values.font} onChange={(v) => setField("font", v)} hint="For example, Times New Roman." />
        <TextField label="Font size" value={values.fontSize} onChange={(v) => setField("fontSize", v)} hint="In points, e.g. 12." />
        <TextField label="Line spacing" value={values.lineSpacing} onChange={(v) => setField("lineSpacing", v)} hint="For example, 2.0 for double spacing." />
        <TextField label="Paragraph spacing" value={values.paraSpacing} onChange={(v) => setField("paraSpacing", v)} />
        <TextField label="Margins" value={values.margins} onChange={(v) => setField("margins", v)} hint="For example, 1.5in left, 1in elsewhere." />
        <TextField label="Heading style" value={values.headingStyle} onChange={(v) => setField("headingStyle", v)} />
        <TextField label="Page numbering" value={values.pageNumbering} onChange={(v) => setField("pageNumbering", v)} />
        <TextField label="Chapter numbering" value={values.chapterNumbering} onChange={(v) => setField("chapterNumbering", v)} hint="Words (CHAPTER ONE) or numerals." />
        <TextField label="Reference formatting" value={values.referenceFormat} onChange={(v) => setField("referenceFormat", v)} />
        <TextField label="Table formatting" value={values.tableFormat} onChange={(v) => setField("tableFormat", v)} />
        <TextField label="Figure formatting" value={values.figureFormat} onChange={(v) => setField("figureFormat", v)} />
      </div>

      <TextAreaField label="Custom formatting instructions" value={values.customInstructions} onChange={(v) => setField("customInstructions", v)} rows={5} />

      <SaveIndicator state={state} message={message} />
    </div>
  );
}

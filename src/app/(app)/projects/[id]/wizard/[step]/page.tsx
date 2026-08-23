import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { WizardRail } from "@/components/wizard/wizard-rail";
import {
  MaterialsStep,
  type UploadedDocument,
} from "@/components/wizard/materials-step";
import {
  StructureStep,
  type StructureChapter,
} from "@/components/wizard/structure-step";
import {
  FormattingStep,
  InstitutionStep,
  InstructionsStep,
  MethodologyStep,
  ProjectTypeStep,
  ResearchStep,
  TopicStep,
} from "@/components/wizard/steps";
import { methodologyKeyFor } from "@/lib/methodology";
import {
  TOTAL_WIZARD_STEPS,
  WIZARD_STEPS,
  phaseForStep,
} from "@/lib/wizard-steps";
import { requireProject } from "@/server/dal/projects";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Project setup" };

/** Empty string rather than null, so inputs stay controlled. */
const s = (v: string | null | undefined) => v ?? "";

export default async function WizardStepPage({
  params,
}: PageProps<"/projects/[id]/wizard/[step]">) {
  const { id, step: rawStep } = await params;
  const step = Number(rawStep);
  if (!Number.isInteger(step) || step < 1 || step > TOTAL_WIZARD_STEPS)
    notFound();

  // Ownership gate. The return value is unused because the full graph is
  // fetched below, but this call must stay: it is what makes a project
  // belonging to someone else indistinguishable from one that does not exist.
  await requireProject(id);
  const meta = WIZARD_STEPS[step - 1]!;

  const detail = await prisma.project.findUnique({
    where: { id },
    include: {
      institution: true,
      research: true,
      methodology: true,
      formatting: true,
      instructions: true,
      sections: { orderBy: [{ order: "asc" }] },
      documents: {
        orderBy: { createdAt: "desc" },
        include: {
          extraction: {
            select: {
              status: true,
              error: true,
              pages: true,
              _count: { select: { chunks: true } },
            },
          },
        },
      },
    },
  });
  if (!detail) notFound();

  const [institutionNames, departmentNames, citationStyles, projectTypes] =
    await Promise.all([
      prisma.institution.findMany({
        select: { name: true },
        orderBy: { name: "asc" },
      }),
      prisma.department.findMany({
        select: { name: true },
        orderBy: { name: "asc" },
        distinct: ["name"],
      }),
      prisma.citationStyle.findMany({ orderBy: { order: "asc" } }),
      prisma.projectTypeDef.findMany({ orderBy: { order: "asc" } }),
    ]);

  const r = detail.research;
  const f = detail.formatting;
  const bySource = (kind: "STUDENT" | "SUPERVISOR" | "DEPARTMENT") =>
    s(detail.instructions.find((i) => i.source === kind)?.content);

  const documents: UploadedDocument[] = detail.documents.map((d) => ({
    id: d.id,
    originalName: d.originalName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    category: d.category,
    extractionStatus: d.extraction?.status ?? null,
    extractionError: d.extraction?.error ?? null,
    pages: d.extraction?.pages ?? null,
    chunks: d.extraction?._count.chunks ?? 0,
  }));

  // Rebuild the chapter tree for the structure step.
  const chapters: StructureChapter[] = detail.sections
    .filter((sec) => sec.parentId === null)
    .map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      number: s(chapter.number),
      children: detail.sections
        .filter((sec) => sec.parentId === chapter.id)
        .map((sec) => ({
          id: sec.id,
          title: sec.title,
          number: s(sec.number),
        })),
    }));

  /**
   * Whether each step has anything recorded against it.
   *
   * Derived from the data already loaded rather than stored as a flag, so the
   * rail cannot claim a step is done after its content has been cleared. It
   * marks "has something", never "is correct" — every field is optional, so
   * there is no such thing as an invalid step.
   */
  const anyOf = (...values: Array<string | null | undefined>) =>
    values.some((value) => (value ?? "").trim().length > 0);

  const stepHasContent: Record<number, boolean> = {
    1: anyOf(
      detail.institution?.institution,
      detail.institution?.faculty,
      detail.institution?.department,
      detail.institution?.programme,
    ),
    2: anyOf(detail.projectType, detail.projectTypeCustom),
    3: anyOf(detail.topic, detail.researchArea, detail.description),
    4:
      anyOf(r?.researchProblem, r?.aim, r?.researchDesign) ||
      (r?.objectives.length ?? 0) > 0,
    5:
      Object.keys((detail.methodology?.data as Record<string, unknown>) ?? {})
        .length > 0,
    6: documents.length > 0,
    7: anyOf(
      bySource("STUDENT"),
      bySource("SUPERVISOR"),
      bySource("DEPARTMENT"),
    ),
    8: anyOf(f?.citationStyle, f?.font, f?.lineSpacing, f?.margins),
    9: chapters.length > 0,
  };

  const phase = phaseForStep(step);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-8">
        <p className="label-caps">Project setup</p>
        <h1 className="mt-2 text-[1.75rem] leading-tight font-semibold tracking-[-0.03em]">
          {detail.title}
        </h1>

        <div className="mt-6 rounded-xl border border-border bg-card p-4 elevated-1 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="flex items-baseline gap-2.5 text-sm">
              <span className="mono text-[0.6875rem] font-medium text-primary">
                {phase.number}
              </span>
              <span className="font-medium">{meta.label}</span>
              <span className="mono text-[0.6875rem] text-subtle-foreground">
                STEP {step}/{TOTAL_WIZARD_STEPS}
              </span>
            </span>
            <span className="mono-figure text-sm text-muted-foreground">
              {detail.completionPct}% complete
            </span>
          </div>

          <Progress
            className="mt-3"
            value={detail.completionPct}
            label="Project setup progress"
          />

          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Every field is optional. Your answers save as you type, so you can
            leave and come back.
          </p>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
        <WizardRail projectId={id} step={step} hasContent={stepHasContent} />

        <div className="min-w-0">
          {step === 1 ? (
            <InstitutionStep
              projectId={id}
              institutions={institutionNames.map((i) => i.name)}
              departments={departmentNames.map((d) => d.name)}
              initial={{
                institution: s(detail.institution?.institution),
                campus: s(detail.institution?.campus),
                faculty: s(detail.institution?.faculty),
                department: s(detail.institution?.department),
                programme: s(detail.institution?.programme),
                degree: s(detail.institution?.degree),
                academicLevel: s(detail.institution?.academicLevel),
              }}
            />
          ) : null}

          {step === 2 ? (
            <ProjectTypeStep
              projectId={id}
              types={projectTypes.map((t) => ({
                value: t.key,
                label: t.label,
              }))}
              initial={{
                projectType: s(detail.projectType),
                projectTypeCustom: s(detail.projectTypeCustom),
              }}
            />
          ) : null}

          {step === 3 ? (
            <TopicStep
              projectId={id}
              initial={{
                topic: s(detail.topic),
                topicApproved: detail.topicApproved,
                researchArea: s(detail.researchArea),
                keywordsText: detail.keywords.join(", "),
                description: s(detail.description),
              }}
            />
          ) : null}

          {step === 4 ? (
            <ResearchStep
              projectId={id}
              initial={{
                researchProblem: s(r?.researchProblem),
                aim: s(r?.aim),
                objectives: r?.objectives ?? [],
                researchQuestions: r?.researchQuestions ?? [],
                hypotheses: r?.hypotheses ?? [],
                studyLocation: s(r?.studyLocation),
                targetPopulation: s(r?.targetPopulation),
                samplePopulation: s(r?.samplePopulation),
                sampleSize: s(r?.sampleSize),
                samplingTechnique: s(r?.samplingTechnique),
                researchDesign: s(r?.researchDesign),
                dataCollectionMethod: s(r?.dataCollectionMethod),
                researchInstruments: s(r?.researchInstruments),
                dataAnalysisMethod: s(r?.dataAnalysisMethod),
                theoreticalFramework: s(r?.theoreticalFramework),
                conceptualFramework: s(r?.conceptualFramework),
                limitations: s(r?.limitations),
                scope: s(r?.scope),
                keyTerminology: s(r?.keyTerminology),
              }}
            />
          ) : null}

          {step === 5 ? (
            <MethodologyStep
              projectId={id}
              methodologyKey={methodologyKeyFor(detail.projectType)}
              projectTypeChosen={Boolean(detail.projectType)}
              initial={
                (detail.methodology?.data as Record<
                  string,
                  string | string[]
                >) ?? {}
              }
            />
          ) : null}

          {step === 6 ? (
            <MaterialsStep projectId={id} documents={documents} />
          ) : null}

          {step === 7 ? (
            <InstructionsStep
              projectId={id}
              initial={{
                student: bySource("STUDENT"),
                supervisor: bySource("SUPERVISOR"),
                department: bySource("DEPARTMENT"),
              }}
            />
          ) : null}

          {step === 8 ? (
            <FormattingStep
              projectId={id}
              citationStyles={citationStyles.map((c) => ({
                value: c.key,
                label: c.label,
              }))}
              initial={{
                citationStyle: s(f?.citationStyle),
                citationStyleCustom: s(f?.citationStyleCustom),
                font: s(f?.font),
                fontSize: s(f?.fontSize),
                lineSpacing: s(f?.lineSpacing),
                paraSpacing: s(f?.paraSpacing),
                margins: s(f?.margins),
                headingStyle: s(f?.headingStyle),
                pageNumbering: s(f?.pageNumbering),
                chapterNumbering: s(f?.chapterNumbering),
                referenceFormat: s(f?.referenceFormat),
                tableFormat: s(f?.tableFormat),
                figureFormat: s(f?.figureFormat),
                customInstructions: s(f?.customInstructions),
              }}
            />
          ) : null}

          {step === 9 ? (
            <StructureStep projectId={id} initial={chapters} />
          ) : null}

          <nav className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
            {step > 1 ? (
              <Button asChild variant="outline">
                <Link href={`/projects/${id}/wizard/${step - 1}`}>Back</Link>
              </Button>
            ) : (
              <span />
            )}
            <Button asChild variant="ghost">
              <Link href="/dashboard">Save and continue later</Link>
            </Button>
            {step < TOTAL_WIZARD_STEPS ? (
              <Button asChild>
                <Link href={`/projects/${id}/wizard/${step + 1}`}>Next</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href={`/projects/${id}/blueprint`}>Review blueprint</Link>
              </Button>
            )}
          </nav>
        </div>
      </div>
    </div>
  );
}

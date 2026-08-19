import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { MaterialsStep, type UploadedDocument } from "@/components/wizard/materials-step";
import { StructureStep, type StructureChapter } from "@/components/wizard/structure-step";
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
import { TOTAL_WIZARD_STEPS, WIZARD_STEPS } from "@/lib/wizard-steps";
import { requireProject } from "@/server/dal/projects";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Project setup" };

/** Empty string rather than null, so inputs stay controlled. */
const s = (v: string | null | undefined) => v ?? "";

export default async function WizardStepPage({ params }: PageProps<"/projects/[id]/wizard/[step]">) {
  const { id, step: rawStep } = await params;
  const step = Number(rawStep);
  if (!Number.isInteger(step) || step < 1 || step > TOTAL_WIZARD_STEPS) notFound();

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
          extraction: { select: { status: true, error: true, pages: true, _count: { select: { chunks: true } } } },
        },
      },
    },
  });
  if (!detail) notFound();

  const [institutionNames, departmentNames, citationStyles, projectTypes] = await Promise.all([
    prisma.institution.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ select: { name: true }, orderBy: { name: "asc" }, distinct: ["name"] }),
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
        .map((sec) => ({ id: sec.id, title: sec.title, number: s(sec.number) })),
    }));

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
      <div className="mb-8">
        <Link href="/dashboard" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Back to my projects
        </Link>
        <h1 className="mt-4 text-3xl font-semibold">{detail.title}</h1>

        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="font-medium">
              Project Setup — Step {step} of {TOTAL_WIZARD_STEPS}: {meta.label}
            </span>
            <span className="text-muted-foreground">{detail.completionPct}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={detail.completionPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Project setup progress"
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${detail.completionPct}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Every field is optional. Your answers save as you type, so you can leave and come back.
          </p>
        </div>

        <nav aria-label="Setup steps" className="mt-5 flex flex-wrap gap-1.5">
          {WIZARD_STEPS.map((entry) => (
            <Link
              key={entry.step}
              href={`/projects/${id}/wizard/${entry.step}`}
              aria-current={entry.step === step ? "step" : undefined}
              className={`rounded-md border px-2.5 py-1 text-sm transition-colors duration-200 ${
                entry.step === step
                  ? "border-primary bg-primary/10 font-medium"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              <span className="tabular-nums">{entry.step}</span>
              <span className="ml-1.5 hidden sm:inline">{entry.label}</span>
            </Link>
          ))}
        </nav>
      </div>

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
          types={projectTypes.map((t) => ({ value: t.key, label: t.label }))}
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
          initial={(detail.methodology?.data as Record<string, string | string[]>) ?? {}}
        />
      ) : null}

      {step === 6 ? <MaterialsStep projectId={id} documents={documents} /> : null}

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
          citationStyles={citationStyles.map((c) => ({ value: c.key, label: c.label }))}
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

      {step === 9 ? <StructureStep projectId={id} initial={chapters} /> : null}

      <nav className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-6">
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
  );
}

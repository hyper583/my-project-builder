import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AlertCircle, PencilLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DemoBanner } from "@/components/demo/demo-banner";
import { resolveExportPolicy } from "@/server/services/export/policy";
import { METHODOLOGY_FORMS, methodologyKeyFor } from "@/lib/methodology";
import { isAiConfigured } from "@/lib/env";
import { requireProject } from "@/server/dal/projects";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Your Project Blueprint" };

const MISSING = "Not provided yet";

function Row({ label, value, step, projectId }: { label: string; value?: string | null; step: number; projectId: string }) {
  const provided = Boolean(value && value.trim().length > 0);
  return (
    <div className="grid gap-1 border-b border-border py-3 last:border-b-0 sm:grid-cols-[14rem_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-muted-foreground">
        <Link href={`/projects/${projectId}/wizard/${step}`} className="group inline-flex items-center gap-1.5 underline-offset-4 hover:underline">
          {label}
          <PencilLine className="size-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
        </Link>
      </dt>
      <dd className={provided ? "leading-relaxed" : "leading-relaxed text-muted-foreground italic"}>
        {provided ? value : MISSING}
      </dd>
    </div>
  );
}

function ListRow({ label, values, step, projectId }: { label: string; values: string[]; step: number; projectId: string }) {
  return (
    <div className="grid gap-1 border-b border-border py-3 last:border-b-0 sm:grid-cols-[14rem_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-muted-foreground">
        <Link href={`/projects/${projectId}/wizard/${step}`} className="underline-offset-4 hover:underline">
          {label}
        </Link>
      </dt>
      <dd>
        {values.length === 0 ? (
          <span className="text-muted-foreground italic">{MISSING}</span>
        ) : (
          <ol className="list-inside list-decimal space-y-1 leading-relaxed">
            {values.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ol>
        )}
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-2 text-xl font-semibold">{title}</h2>
      <dl>{children}</dl>
    </section>
  );
}

export default async function BlueprintPage({ params }: PageProps<"/projects/[id]/blueprint">) {
  const { id } = await params;
  const { user } = await requireProject(id);

  const p = await prisma.project.findUnique({
    where: { id },
    include: {
      institution: true,
      research: true,
      methodology: true,
      formatting: true,
      instructions: true,
      documents: { select: { id: true, originalName: true } },
      sections: { orderBy: { order: "asc" } },
    },
  });
  if (!p) notFound();

  const i = p.institution;
  const r = p.research;
  const f = p.formatting;
  const chapters = p.sections.filter((s) => s.parentId === null);
  // The same resolver the export pipeline uses, so what the banner promises and
  // what an export actually does cannot drift apart.
  const exportPolicy = resolveExportPolicy(
    { id: user.id, role: user.role, planTier: user.planTier },
    { id: p.id, kind: p.kind, ownerId: p.userId },
  );

  const methodologyForm = METHODOLOGY_FORMS[methodologyKeyFor(p.projectType)];
  const methodologyData = (p.methodology?.data ?? {}) as Record<string, string | string[]>;
  const answeredMethodology = methodologyForm.fields.filter((field) => {
    const v = methodologyData[field.name];
    return Array.isArray(v) ? v.length > 0 : Boolean(v && String(v).trim());
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
      <Link href={`/projects/${id}/wizard/9`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← Back to setup
      </Link>

      <h1 className="mt-4 text-3xl font-semibold">Your Project Blueprint</h1>
      <p className="mt-2 max-w-2xl leading-relaxed text-muted-foreground">
        Everything My Project Builder will work from. Check it carefully — anything marked{" "}
        <span className="italic">{MISSING}</span> is simply left blank, never filled in with a
        guess. Select any label to go back and change it.
      </p>

      {p.kind === "DEMO" ? (
        <div className="mt-6">
          <DemoBanner projectId={id} canExport={exportPolicy.allowed} />
        </div>
      ) : null}

      <div className="mt-8 space-y-5">
        <Section title="Institution">
          <Row projectId={id} step={1} label="Institution" value={i?.institution} />
          <Row projectId={id} step={1} label="Campus" value={i?.campus} />
          <Row projectId={id} step={1} label="Faculty" value={i?.faculty} />
          <Row projectId={id} step={1} label="Department" value={i?.department} />
          <Row projectId={id} step={1} label="Programme" value={i?.programme} />
          <Row projectId={id} step={1} label="Degree" value={i?.degree} />
          <Row projectId={id} step={1} label="Academic level" value={i?.academicLevel} />
        </Section>

        <Section title="Project">
          <Row projectId={id} step={2} label="Project type" value={p.projectTypeCustom ?? p.projectType} />
          <Row projectId={id} step={3} label="Topic" value={p.topic} />
          <Row projectId={id} step={3} label="Approved topic" value={p.topicApproved === "YES" ? "Yes — preserved exactly as entered" : p.topicApproved === "NO" ? "No" : "Not sure"} />
          <Row projectId={id} step={3} label="Research area" value={p.researchArea} />
          <ListRow projectId={id} step={3} label="Keywords" values={p.keywords} />
        </Section>

        <Section title="Research">
          <Row projectId={id} step={4} label="Research problem" value={r?.researchProblem} />
          <Row projectId={id} step={4} label="Aim" value={r?.aim} />
          <ListRow projectId={id} step={4} label="Objectives" values={r?.objectives ?? []} />
          <ListRow projectId={id} step={4} label="Research questions" values={r?.researchQuestions ?? []} />
          <ListRow projectId={id} step={4} label="Hypotheses" values={r?.hypotheses ?? []} />
          <Row projectId={id} step={4} label="Study location" value={r?.studyLocation} />
          <Row projectId={id} step={4} label="Target population" value={r?.targetPopulation} />
          <Row projectId={id} step={4} label="Sample size" value={r?.sampleSize} />
          <Row projectId={id} step={4} label="Sampling technique" value={r?.samplingTechnique} />
          <Row projectId={id} step={4} label="Research design" value={r?.researchDesign} />
          <Row projectId={id} step={4} label="Data collection" value={r?.dataCollectionMethod} />
          <Row projectId={id} step={4} label="Data analysis" value={r?.dataAnalysisMethod} />
        </Section>

        <Section title={`Methodology — ${methodologyForm.label}`}>
          {answeredMethodology.length === 0 ? (
            <p className="py-3 text-muted-foreground italic">{MISSING}</p>
          ) : (
            answeredMethodology.map((field) => {
              const v = methodologyData[field.name];
              return Array.isArray(v) ? (
                <ListRow key={field.name} projectId={id} step={5} label={field.label} values={v} />
              ) : (
                <Row key={field.name} projectId={id} step={5} label={field.label} value={String(v)} />
              );
            })
          )}
        </Section>

        <Section title="Materials and instructions">
          <Row projectId={id} step={6} label="Uploaded documents" value={p.documents.length > 0 ? p.documents.map((d) => d.originalName).join(", ") : null} />
          {(["STUDENT", "SUPERVISOR", "DEPARTMENT"] as const).map((source) => (
            <Row
              key={source}
              projectId={id}
              step={7}
              label={source === "STUDENT" ? "Additional information" : source === "SUPERVISOR" ? "Supervisor instructions" : "Departmental requirements"}
              value={p.instructions.find((x) => x.source === source)?.content}
            />
          ))}
        </Section>

        <Section title="Formatting">
          <Row projectId={id} step={8} label="Citation style" value={f?.citationStyleCustom ?? f?.citationStyle} />
          <Row projectId={id} step={8} label="Font" value={f?.font} />
          <Row projectId={id} step={8} label="Font size" value={f?.fontSize} />
          <Row projectId={id} step={8} label="Line spacing" value={f?.lineSpacing} />
          <Row projectId={id} step={8} label="Margins" value={f?.margins} />
          <Row projectId={id} step={8} label="Chapter numbering" value={f?.chapterNumbering} />
        </Section>

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-3 text-xl font-semibold">Proposed project structure</h2>
          {chapters.length === 0 ? (
            <p className="text-muted-foreground italic">
              No chapters yet.{" "}
              <Link href={`/projects/${id}/wizard/9`} className="text-primary underline underline-offset-4">
                Choose a structure
              </Link>
              .
            </p>
          ) : (
            <ol className="space-y-4">
              {chapters.map((chapter) => (
                <li key={chapter.id}>
                  <p className="font-medium">
                    {chapter.number ? `${chapter.number}. ` : ""}
                    {chapter.title}
                  </p>
                  <ul className="mt-1 space-y-0.5 border-l border-border pl-4 text-muted-foreground">
                    {p.sections
                      .filter((s) => s.parentId === chapter.id)
                      .map((s) => (
                        <li key={s.id}>
                          {s.number ? `${s.number} ` : ""}
                          {s.title}
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className="mt-8 rounded-lg border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline">
            <Link href={`/projects/${id}/wizard/1`}>Edit Blueprint</Link>
          </Button>
          <Button disabled={!isAiConfigured} title={isAiConfigured ? undefined : "AI is not configured on this installation"}>
            Generate Project
          </Button>
        </div>

        {!isAiConfigured ? (
          <div role="status" className="mt-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="leading-relaxed">
              <strong className="font-medium">AI is not configured on this installation.</strong>{" "}
              Generation stays disabled until an AI provider key is set, rather than producing
              placeholder text that looks like a real project. Your blueprint is saved and will be
              used exactly as shown once it is configured.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

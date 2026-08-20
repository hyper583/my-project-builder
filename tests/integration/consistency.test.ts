import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createProject, createUser, db, resetDatabase } from "./helpers";
import { analyseProject, listIssues, setIssueStatus } from "@/server/services/consistency";
import { computeHealth } from "@/server/services/health";

/**
 * Reconciliation and health scoring.
 *
 * The checks themselves are unit-tested. What matters here is how repeated
 * runs interact with what a student has already done: a panel that duplicates
 * findings, or that keeps resurrecting one they have judged and dismissed, is
 * a panel they will stop reading.
 */

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await db.$disconnect();
});

/** A project whose prose contradicts its recorded sample size. */
async function projectWithContradiction() {
  const user = await createUser();
  const project = await createProject(user.id);

  await db.projectResearchDetails.create({
    data: {
      projectId: project.id,
      aim: "To examine something",
      objectives: ["One", "Two"],
      researchQuestions: ["Q1", "Q2"],
      sampleSize: "120",
    },
  });

  const chapter = await db.projectSection.create({
    data: { projectId: project.id, parentId: null, number: "3", title: "Methodology", order: 1 },
  });
  const section = await db.projectSection.create({
    data: {
      projectId: project.id,
      parentId: chapter.id,
      number: "3.4",
      title: "Sample Size",
      content: "<p>A total of 200 respondents were selected.</p>",
      order: 1,
      wordCount: 8,
    },
  });

  return { user, project, chapter, section };
}

describe("analysis", () => {
  it("records a finding the checks produce", async () => {
    const { project } = await projectWithContradiction();

    const result = await analyseProject(project.id);
    expect(result.opened).toBeGreaterThan(0);

    const issues = await listIssues(project.id);
    const contradiction = issues.find((i) => i.kind === "SAMPLE_SIZE_CONTRADICTION");
    expect(contradiction?.severity).toBe("HIGH");
    expect(contradiction?.detail).toContain("200");
  });

  it("does not duplicate findings when run repeatedly", async () => {
    const { project } = await projectWithContradiction();

    await analyseProject(project.id);
    await analyseProject(project.id);
    const third = await analyseProject(project.id);

    // Nothing new on later runs, and one row per problem.
    expect(third.opened).toBe(0);

    const rows = await db.consistencyIssue.findMany({
      where: { projectId: project.id, kind: "SAMPLE_SIZE_CONTRADICTION" },
    });
    expect(rows).toHaveLength(1);
  });

  it("leaves a dismissed finding dismissed on the next run", async () => {
    // A student who has judged a finding should not have to judge it again on
    // every analysis, or they will stop reading the panel.
    const { project } = await projectWithContradiction();
    await analyseProject(project.id);

    const [issue] = await listIssues(project.id);
    await setIssueStatus(project.id, issue!.id, "DISMISSED");

    await analyseProject(project.id);

    const stillDismissed = await db.consistencyIssue.findUnique({ where: { id: issue!.id } });
    expect(stillDismissed?.status).toBe("DISMISSED");
    expect(await listIssues(project.id, "OPEN")).not.toContainEqual(
      expect.objectContaining({ id: issue!.id }),
    );
  });

  it("marks a fixed finding resolved rather than deleting it", async () => {
    const { project, section } = await projectWithContradiction();
    await analyseProject(project.id);

    // The student corrects the prose.
    await db.projectSection.update({
      where: { id: section.id },
      data: { content: "<p>A total of 120 respondents were selected.</p>" },
    });

    const result = await analyseProject(project.id);
    expect(result.resolved).toBeGreaterThan(0);

    const resolved = await listIssues(project.id, "RESOLVED");
    expect(resolved.some((i) => i.kind === "SAMPLE_SIZE_CONTRADICTION")).toBe(true);

    const open = await listIssues(project.id, "OPEN");
    expect(open.some((i) => i.kind === "SAMPLE_SIZE_CONTRADICTION")).toBe(false);
  });

  it("refuses to update a finding belonging to another project", async () => {
    const mine = await projectWithContradiction();
    const theirs = await projectWithContradiction();

    await analyseProject(theirs.project.id);
    const [theirIssue] = await listIssues(theirs.project.id);

    await expect(
      setIssueStatus(mine.project.id, theirIssue!.id, "DISMISSED"),
    ).rejects.toThrow();
  });
});

describe("project health", () => {
  it("reports the components behind the score, not just a number", async () => {
    const { project } = await projectWithContradiction();
    await analyseProject(project.id);

    const health = await computeHealth(project.id);

    expect(health.components.map((c) => c.key)).toEqual([
      "setup",
      "written",
      "data",
      "consistency",
      "references",
    ]);
    // Weights describe a whole score.
    expect(health.components.reduce((sum, c) => sum + c.weight, 0)).toBeCloseTo(1, 5);
    expect(health.score).toBeGreaterThanOrEqual(0);
    expect(health.score).toBeLessThanOrEqual(100);
  });

  it("weighs outstanding data heavily enough to matter", async () => {
    // A project can be complete in every other respect and still be
    // unsubmittable because its results are missing.
    const { project, chapter } = await projectWithContradiction();

    const before = await computeHealth(project.id);

    const section = await db.projectSection.create({
      data: {
        projectId: project.id,
        parentId: chapter.id,
        number: "4.1",
        title: "Findings",
        content: "<p>Results were [STUDENT DATA REQUIRED: mean score] overall.</p>",
        order: 2,
        wordCount: 6,
      },
    });
    await db.sectionPlaceholder.createMany({
      data: Array.from({ length: 4 }, () => ({
        sectionId: section.id,
        label: "STUDENT DATA REQUIRED",
        detail: "mean score",
      })),
    });

    const after = await computeHealth(project.id);

    expect(after.counts.placeholders).toBe(4);
    expect(after.components.find((c) => c.key === "data")!.score).toBeLessThan(
      before.components.find((c) => c.key === "data")!.score,
    );
  });

  it("never rounds a score up to flatter the project", async () => {
    const { project } = await projectWithContradiction();
    const health = await computeHealth(project.id);

    const exact = health.components.reduce((sum, c) => sum + c.score * c.weight, 0);
    expect(health.score).toBe(Math.floor(exact));
    expect(health.score).toBeLessThanOrEqual(exact);
  });

  it("bands a project with nothing done as needing work", async () => {
    const user = await createUser();
    const empty = await createProject(user.id);

    const health = await computeHealth(empty.id);
    expect(health.band).toBe("NEEDS_WORK");
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createProject, createUser, db, resetDatabase } from "./helpers";
import { enqueueGeneration } from "@/server/services/jobs/queue";

/**
 * How far a generation run is allowed to write.
 *
 * This is the paywall. Before it, a free account generated the entire project
 * and the workspace rendered every word of it — the Export button was the only
 * thing withheld, so selecting the text and pasting it into Word was a complete
 * bypass of the only thing being sold.
 *
 * The gate is the set of step rows written at enqueue. They live in the
 * database, the worker executes exactly them, and nothing the browser sends can
 * add one. So the property these tests hold is narrow and worth stating: a
 * chapter with no step is a chapter that cannot be written.
 *
 * The second property is what makes the paid run usable — already-written
 * chapters are skipped, so buying a pass continues the project rather than
 * starting it again over the student's edits.
 */

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await db.$disconnect();
});

const CHAPTERS = [
  "Introduction",
  "Literature Review",
  "Methodology",
  "Discussion",
  "Conclusion",
];

/** A five-chapter project, each chapter carrying one section to write into. */
async function seedProject() {
  const user = await createUser();
  const project = await createProject(user.id, { title: "Gate check" });

  const chapters = [];
  for (const [index, title] of CHAPTERS.entries()) {
    const chapter = await db.projectSection.create({
      data: {
        projectId: project.id,
        parentId: null,
        number: String(index + 1),
        title,
        order: index,
      },
    });
    await db.projectSection.create({
      data: {
        projectId: project.id,
        parentId: chapter.id,
        number: `${index + 1}.1`,
        title: `${title} — opening`,
        order: 0,
      },
    });
    chapters.push(chapter);
  }

  return { user, project, chapters };
}

/** Marks a chapter as written the way the pipeline and the editor both do. */
async function write(sectionId: string, words = 500) {
  await db.projectSection.update({
    where: { id: sectionId },
    data: { content: "<p>Written.</p>", wordCount: words },
  });
}

async function chapterStepsOf(jobId: string) {
  const steps = await db.generationStep.findMany({
    where: { jobId, key: { startsWith: "chapter:" } },
    orderBy: { order: "asc" },
    select: { key: true, label: true },
  });
  return steps;
}

describe("what a run is allowed to write", () => {
  it("queues one chapter when the allowance covers one", async () => {
    const { project } = await seedProject();

    const jobId = await enqueueGeneration(project.id, { maxChapters: 1 });

    const steps = await chapterStepsOf(jobId);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.label).toContain("Introduction");
  });

  it("queues every chapter when the allowance is unlimited", async () => {
    const { project } = await seedProject();

    const jobId = await enqueueGeneration(project.id, {
      maxChapters: Number.POSITIVE_INFINITY,
    });

    expect(await chapterStepsOf(jobId)).toHaveLength(CHAPTERS.length);
  });

  it("does not let the allowance walk forward once a chapter is written", async () => {
    /*
     * The bug this was written for.
     *
     * Selecting "the first N unwritten chapters" looks equivalent and is not:
     * with Chapter 1 already written, a free run's single chapter became
     * Chapter 2, and the allowance advanced through the project a chapter at a
     * time. The allowance is a window over the front of the project — once
     * what is inside it is written, there is nothing left to run.
     */
    const { project, chapters } = await seedProject();
    const firstSection = await db.projectSection.findFirstOrThrow({
      where: { parentId: chapters[0]!.id },
    });
    await write(firstSection.id);

    await expect(enqueueGeneration(project.id, { maxChapters: 1 })).rejects.toThrow(
      /no unwritten chapters/i,
    );
  });

  it("still queues the surrounding stages, so one chapter is a real run", async () => {
    // Sources are retrieved and the structure confirmed before any prose is
    // written. A free run that skipped those would produce a chapter citing
    // nothing, which is the failure this pipeline was reordered to prevent.
    const { project } = await seedProject();

    const jobId = await enqueueGeneration(project.id, { maxChapters: 1 });

    const keys = (
      await db.generationStep.findMany({
        where: { jobId },
        orderBy: { order: "asc" },
        select: { key: true },
      })
    ).map((s) => s.key);

    expect(keys[0]).toBe("analyse");
    expect(keys).toContain("references");
    expect(keys).toContain("outline");
    expect(keys.at(-1)).toBe("finalise");
  });
});

describe("continuing a project after it is paid for", () => {
  it("writes only the chapters that are still empty", async () => {
    const { project, chapters } = await seedProject();

    // What the free run produced.
    const firstSection = await db.projectSection.findFirstOrThrow({
      where: { parentId: chapters[0]!.id },
    });
    await write(firstSection.id);

    const jobId = await enqueueGeneration(project.id, {
      maxChapters: Number.POSITIVE_INFINITY,
    });

    const steps = await chapterStepsOf(jobId);
    expect(steps).toHaveLength(CHAPTERS.length - 1);
    expect(steps.some((s) => s.label.includes("Introduction"))).toBe(false);
    expect(steps.some((s) => s.label.includes("Literature Review"))).toBe(true);
  });

  it("treats prose on the chapter itself as written, not only its sections", async () => {
    // A chapter with no children holds its own text. Ignoring that would
    // rewrite it and discard whatever the student had done to it.
    const { project, chapters } = await seedProject();
    await write(chapters[0]!.id);

    const jobId = await enqueueGeneration(project.id, {
      maxChapters: Number.POSITIVE_INFINITY,
    });

    const steps = await chapterStepsOf(jobId);
    expect(steps.some((s) => s.label.includes("Introduction"))).toBe(false);
  });

  it("refuses rather than spending a run on nothing", async () => {
    /*
     * Every chapter within reach is already written. Queuing anyway runs the
     * prologue and epilogue, succeeds, changes not a word, and charges the
     * student a run for it — a job that reports success while doing nothing,
     * which is the exact failure mode this codebase keeps having to close.
     */
    const { project, chapters } = await seedProject();
    const firstSection = await db.projectSection.findFirstOrThrow({
      where: { parentId: chapters[0]!.id },
    });
    await write(firstSection.id);

    await expect(enqueueGeneration(project.id, { maxChapters: 1 })).rejects.toThrow(
      /no unwritten chapters/i,
    );

    expect(await db.generationJob.count({ where: { projectId: project.id } })).toBe(0);
  });

  it("says a pass is what writes the rest when chapters remain", async () => {
    // Two different dead ends with two different answers: more to write but no
    // allowance for it, versus genuinely finished. Telling a free student the
    // project is complete would be a lie.
    const { project, chapters } = await seedProject();
    const firstSection = await db.projectSection.findFirstOrThrow({
      where: { parentId: chapters[0]!.id },
    });
    await write(firstSection.id);

    await expect(
      enqueueGeneration(project.id, { maxChapters: 1 }),
    ).rejects.toMatchObject({
      userMessage: expect.stringContaining("project pass"),
    });
  });

  it("says the project is finished when nothing is left at all", async () => {
    const { project } = await seedProject();
    const sections = await db.projectSection.findMany({
      where: { projectId: project.id },
    });
    for (const section of sections) await write(section.id);

    await expect(
      enqueueGeneration(project.id, { maxChapters: Number.POSITIVE_INFINITY }),
    ).rejects.toMatchObject({
      userMessage: expect.stringContaining("already been written"),
    });
  });
});

describe("defaults", () => {
  it("writes everything when no allowance is given", async () => {
    // The worker and the tests both call this without options in places. An
    // omitted allowance must mean "no limit" rather than "no chapters".
    const { project } = await seedProject();

    const jobId = await enqueueGeneration(project.id);

    expect(await chapterStepsOf(jobId)).toHaveLength(CHAPTERS.length);
  });
});

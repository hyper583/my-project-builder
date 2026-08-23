import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createProject, createUser, db, resetDatabase } from "./helpers";
import { createVersion, listVersions, restoreVersion } from "@/server/services/versions";

/**
 * Version history.
 *
 * Restoring rewrites a student's document, so these tests are weighted towards
 * the ways that could go wrong destructively: losing work that was not meant
 * to be replaced, orphaning the placeholders and citations that hang off
 * section ids, and leaving the document as a mixture of two versions.
 */

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await db.$disconnect();
});

/** A project with one chapter and two sections. */
async function seedProject() {
  const user = await createUser();
  const project = await createProject(user.id, { title: "Original title" });

  const chapter = await db.projectSection.create({
    data: { projectId: project.id, parentId: null, number: "1", title: "Introduction", order: 1 },
  });
  const first = await db.projectSection.create({
    data: {
      projectId: project.id,
      parentId: chapter.id,
      number: "1.1",
      title: "Background",
      content: "<p>The original background text.</p>",
      order: 1,
      wordCount: 5,
    },
  });
  const second = await db.projectSection.create({
    data: {
      projectId: project.id,
      parentId: chapter.id,
      number: "1.2",
      title: "Problem",
      content: "<p>The original problem statement.</p>",
      order: 2,
      wordCount: 4,
    },
  });

  return { user, project, chapter, first, second };
}

describe("version history", () => {
  it("captures the section tree and numbers versions in sequence", async () => {
    const { project } = await seedProject();

    const v1 = await createVersion(project.id, "First draft");
    const v2 = await createVersion(project.id, "Second draft");

    expect(v1.number).toBe(1);
    expect(v2.number).toBe(2);
    expect(v1.sectionCount).toBe(3);
    expect(v1.wordCount).toBe(9);

    const listed = await listVersions(project.id);
    // Newest first, so the most recent is the easiest to reach.
    expect(listed.map((v) => v.number)).toEqual([2, 1]);
  });

  it("restores content that was edited after the snapshot", async () => {
    const { project, first } = await seedProject();
    const version = await createVersion(project.id, "Before rewrite");

    await db.projectSection.update({
      where: { id: first.id },
      data: { content: "<p>A completely rewritten paragraph.</p>", title: "Rewritten" },
    });

    await restoreVersion(project.id, version.id);

    const restored = await db.projectSection.findUnique({ where: { id: first.id } });
    expect(restored?.content).toBe("<p>The original background text.</p>");
    expect(restored?.title).toBe("Background");
  });

  it("takes a safety snapshot first, so a restore can itself be undone", async () => {
    // The failure worth designing against: restoring the wrong version and
    // losing the work you were trying to get back to.
    const { project, first } = await seedProject();
    const original = await createVersion(project.id, "Original");

    await db.projectSection.update({
      where: { id: first.id },
      data: { content: "<p>Work in progress that must not be lost.</p>" },
    });

    const outcome = await restoreVersion(project.id, original.id);
    expect(outcome.safetyVersion.number).toBeGreaterThan(original.number);

    // Undo the restore using the version it created.
    await restoreVersion(project.id, outcome.safetyVersion.id);

    const back = await db.projectSection.findUnique({ where: { id: first.id } });
    expect(back?.content).toBe("<p>Work in progress that must not be lost.</p>");
  });

  it("removes sections added after the snapshot", async () => {
    const { project, chapter } = await seedProject();
    const version = await createVersion(project.id, "Before adding");

    const added = await db.projectSection.create({
      data: { projectId: project.id, parentId: chapter.id, number: "1.3", title: "Added later", order: 3 },
    });

    const outcome = await restoreVersion(project.id, version.id);
    expect(outcome.sectionsRemoved).toBe(1);

    expect(await db.projectSection.findUnique({ where: { id: added.id } })).toBeNull();
  });

  it("recreates a deleted section under its original id", async () => {
    // Ids are preserved rather than regenerated, so anything referencing a
    // section still points at it after a restore.
    const { project, second } = await seedProject();
    const version = await createVersion(project.id, "Before deletion");

    await db.projectSection.delete({ where: { id: second.id } });
    expect(await db.projectSection.findUnique({ where: { id: second.id } })).toBeNull();

    await restoreVersion(project.id, version.id);

    const recreated = await db.projectSection.findUnique({ where: { id: second.id } });
    expect(recreated?.id).toBe(second.id);
    expect(recreated?.title).toBe("Problem");
    expect(recreated?.parentId).not.toBeNull();
  });

  it("recomputes placeholders from the restored text rather than restoring stale ones", async () => {
    const { project, first } = await seedProject();

    await db.projectSection.update({
      where: { id: first.id },
      data: { content: "<p>Respondents reported [STUDENT DATA REQUIRED: sample size] overall.</p>" },
    });
    const withMarker = await createVersion(project.id, "With a marker");

    // The student fills the marker in.
    await db.projectSection.update({
      where: { id: first.id },
      data: { content: "<p>Respondents reported 120 participants overall.</p>" },
    });
    await db.sectionPlaceholder.deleteMany({ where: { sectionId: first.id } });

    await restoreVersion(project.id, withMarker.id);

    // Restoring text that contains a marker must restore the tally with it.
    const markers = await db.sectionPlaceholder.findMany({ where: { sectionId: first.id } });
    expect(markers).toHaveLength(1);
    expect(markers[0]!.detail).toBe("sample size");
  });

  it("refuses a version belonging to a different project", async () => {
    const mine = await seedProject();
    const theirs = await seedProject();
    const theirVersion = await createVersion(theirs.project.id, "Theirs");

    await expect(restoreVersion(mine.project.id, theirVersion.id)).rejects.toThrow();
  });

  it("refuses a snapshot written in an unknown format instead of restoring it", async () => {
    // Better to fail than to write a half-understood shape over real work.
    const { project } = await seedProject();
    const version = await db.projectVersion.create({
      data: { projectId: project.id, label: "Legacy", number: 1, snapshot: { unexpected: true } },
    });

    await expect(restoreVersion(project.id, version.id)).rejects.toThrow();

    // And the document is untouched.
    const sections = await db.projectSection.count({ where: { projectId: project.id } });
    expect(sections).toBe(3);
  });

  it("restores the project title with the sections", async () => {
    const { project } = await seedProject();
    const version = await createVersion(project.id, "Before rename");

    await db.project.update({ where: { id: project.id }, data: { title: "Renamed" } });
    await restoreVersion(project.id, version.id);

    const after = await db.project.findUnique({ where: { id: project.id } });
    expect(after?.title).toBe("Original title");
  });
});

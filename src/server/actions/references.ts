"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertProjectOwnership } from "@/server/dal/projects";
import { requireUser } from "@/server/dal/session";
import { fail, ok, type ActionResult } from "@/server/errors";
import {
  addReference,
  confirmReference,
  deleteReference,
  importCitations,
  updateReference,
  type ImportOutcome,
} from "@/server/services/references";

/** Ownership is proved before any read or write; the service scopes every query too. */
async function ownedProject(projectId: string) {
  const user = await requireUser();
  return assertProjectOwnership(projectId, user);
}

const referenceSchema = z.object({
  projectId: z.string().min(1),
  authors: z.array(z.string()).default([]),
  year: z.string().trim().max(10).optional().nullable(),
  title: z.string().trim().min(1, "A reference needs at least a title.").max(500),
  publication: z.string().trim().max(300).optional().nullable(),
  publisher: z.string().trim().max(300).optional().nullable(),
  volume: z.string().trim().max(20).optional().nullable(),
  issue: z.string().trim().max(20).optional().nullable(),
  pages: z.string().trim().max(30).optional().nullable(),
  doi: z.string().trim().max(200).optional().nullable(),
  url: z.string().trim().max(500).optional().nullable(),
});

export async function createReference(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { projectId, ...fields } = referenceSchema.parse(input);
    const id = await ownedProject(projectId);

    const reference = await addReference(id, fields);
    revalidatePath(`/projects/${id}/blueprint`);
    return ok({ id: reference.id });
  } catch (error) {
    return fail(error);
  }
}

export async function editReference(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { projectId, referenceId, ...fields } = referenceSchema
      .extend({ referenceId: z.string().min(1) })
      .parse(input);
    const id = await ownedProject(projectId);

    await updateReference(id, referenceId, fields);
    revalidatePath(`/projects/${id}/blueprint`);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function importReferences(input: unknown): Promise<ActionResult<ImportOutcome>> {
  try {
    const { projectId, text } = z
      .object({ projectId: z.string().min(1), text: z.string().min(1).max(20_000) })
      .parse(input);
    const id = await ownedProject(projectId);

    const outcome = await importCitations(id, text);
    revalidatePath(`/projects/${id}/blueprint`);
    return ok(outcome);
  } catch (error) {
    return fail(error);
  }
}

const targetSchema = z.object({
  projectId: z.string().min(1),
  referenceId: z.string().min(1),
});

export async function markReferenceChecked(input: unknown): Promise<ActionResult<null>> {
  try {
    const { projectId, referenceId } = targetSchema.parse(input);
    const id = await ownedProject(projectId);

    await confirmReference(id, referenceId);
    revalidatePath(`/projects/${id}/blueprint`);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function removeReference(input: unknown): Promise<ActionResult<null>> {
  try {
    const { projectId, referenceId } = targetSchema.parse(input);
    const id = await ownedProject(projectId);

    await deleteReference(id, referenceId);
    revalidatePath(`/projects/${id}/blueprint`);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

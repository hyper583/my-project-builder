"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/server/dal/session";
import { prisma } from "@/server/db";
import { AppError, fail, ok, type ActionResult } from "@/server/errors";

/**
 * Managing the reference data students choose from.
 *
 * Every mutation here is audited, on the same terms as the rest of the console:
 * these lists shape what every future project can be, so "who added this, and
 * when" is a question worth being able to answer.
 *
 * Renaming deserves particular care. A project stores the NAME or KEY it chose,
 * not a foreign key, so renaming a preset does not follow through to the
 * projects that picked it — they keep the old string. That is not a bug to fix
 * here; it is the cost of letting students type values nobody seeded. What this
 * module does is refuse to pretend otherwise: a rename that would strand
 * projects says how many, and the audit row records both names.
 */

/** Narrowed to what Prisma's Json column accepts, rather than cast at the call site. */
type AuditMetadata = Record<string, string | number | boolean | null>;

async function audit(
  adminId: string,
  action: string,
  targetId: string,
  metadata: AuditMetadata,
) {
  await prisma.auditLog.create({
    data: { userId: adminId, action, targetType: "preset", targetId, metadata },
  });
}

/* ---------------------------------------------------------------- */
/* Project types                                                     */
/* ---------------------------------------------------------------- */

const projectTypeSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(60)
    // Lowercase and hyphenated, because this string is compared in code:
    // `defaultStructureFor` branches on "project-proposal", and a key with a
    // capital or a space would silently take the wrong branch.
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only"),
  label: z.string().trim().min(2).max(80),
  order: z.number().int().min(0).max(999).optional(),
});

export async function createProjectType(input: unknown): Promise<ActionResult<null>> {
  try {
    const admin = await requireAdmin();
    const { key, label, order } = projectTypeSchema.parse(input);

    const clash = await prisma.projectTypeDef.findUnique({ where: { key }, select: { id: true } });
    if (clash) {
      throw new AppError("CONFLICT", {
        userMessage: `A project type with the key "${key}" already exists.`,
      });
    }

    const created = await prisma.projectTypeDef.create({
      data: { key, label, order: order ?? 100 },
      select: { id: true },
    });
    await audit(admin.id, "admin.preset.create", created.id, { kind: "projectType", key, label });

    revalidatePath("/admin/presets");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

const relabelSchema = z.object({ id: z.string().min(1), label: z.string().trim().min(2).max(80) });

/**
 * Renames the label only — never the key.
 *
 * The key is what projects stored and what code branches on. Editing it would
 * strand every project that chose this type and could quietly change which
 * structure template new ones get. A label is presentation; a key is a
 * contract.
 */
export async function renameProjectType(input: unknown): Promise<ActionResult<null>> {
  try {
    const admin = await requireAdmin();
    const { id, label } = relabelSchema.parse(input);

    const existing = await prisma.projectTypeDef.findUnique({ where: { id } });
    if (!existing) throw new AppError("NOT_FOUND");

    await prisma.projectTypeDef.update({ where: { id }, data: { label } });
    await audit(admin.id, "admin.preset.rename", id, {
      kind: "projectType",
      key: existing.key,
      from: existing.label,
      to: label,
    });

    revalidatePath("/admin/presets");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/**
 * Removes a project type, refusing while projects still name it.
 *
 * There is no foreign key to stop this, which is exactly why the check has to
 * be explicit. Deleting a type in use leaves those projects with a
 * `projectType` string nothing recognises: the wizard cannot show their
 * selection, and the fast path rejects that shape for anyone new.
 */
export async function deleteProjectType(input: unknown): Promise<ActionResult<null>> {
  try {
    const admin = await requireAdmin();
    const { id } = z.object({ id: z.string().min(1) }).parse(input);

    const existing = await prisma.projectTypeDef.findUnique({ where: { id } });
    if (!existing) throw new AppError("NOT_FOUND");

    const inUse = await prisma.project.count({
      where: { projectType: existing.key, deletedAt: null },
    });
    if (inUse > 0) {
      throw new AppError("CONFLICT", {
        userMessage: `${inUse} ${inUse === 1 ? "project still uses" : "projects still use"} "${existing.label}". Removing it would leave ${inUse === 1 ? "it" : "them"} with a type nothing recognises.`,
      });
    }

    await prisma.projectTypeDef.delete({ where: { id } });
    await audit(admin.id, "admin.preset.delete", id, {
      kind: "projectType",
      key: existing.key,
      label: existing.label,
    });

    revalidatePath("/admin/presets");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/* ---------------------------------------------------------------- */
/* Citation styles                                                   */
/* ---------------------------------------------------------------- */

const citationSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only"),
  label: z.string().trim().min(2).max(80),
  order: z.number().int().min(0).max(999).optional(),
});

export async function createCitationStyle(input: unknown): Promise<ActionResult<null>> {
  try {
    const admin = await requireAdmin();
    const { key, label, order } = citationSchema.parse(input);

    const clash = await prisma.citationStyle.findUnique({ where: { key }, select: { id: true } });
    if (clash) {
      throw new AppError("CONFLICT", {
        userMessage: `A citation style with the key "${key}" already exists.`,
      });
    }

    const created = await prisma.citationStyle.create({
      data: { key, label, order: order ?? 100 },
      select: { id: true },
    });
    await audit(admin.id, "admin.preset.create", created.id, { kind: "citationStyle", key, label });

    revalidatePath("/admin/presets");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function deleteCitationStyle(input: unknown): Promise<ActionResult<null>> {
  try {
    const admin = await requireAdmin();
    const { id } = z.object({ id: z.string().min(1) }).parse(input);

    const existing = await prisma.citationStyle.findUnique({ where: { id } });
    if (!existing) throw new AppError("NOT_FOUND");

    const inUse = await prisma.projectFormatting.count({ where: { citationStyle: existing.key } });
    if (inUse > 0) {
      throw new AppError("CONFLICT", {
        userMessage: `${inUse} ${inUse === 1 ? "project is" : "projects are"} formatted in "${existing.label}". Removing it would leave ${inUse === 1 ? "it" : "them"} citing a style nothing recognises.`,
      });
    }

    await prisma.citationStyle.delete({ where: { id } });
    await audit(admin.id, "admin.preset.delete", id, {
      kind: "citationStyle",
      key: existing.key,
      label: existing.label,
    });

    revalidatePath("/admin/presets");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/* ---------------------------------------------------------------- */
/* Institutions                                                      */
/* ---------------------------------------------------------------- */

const institutionSchema = z.object({
  name: z.string().trim().min(2).max(200),
  country: z.string().trim().max(80).optional(),
});

export async function createInstitution(input: unknown): Promise<ActionResult<null>> {
  try {
    const admin = await requireAdmin();
    const { name, country } = institutionSchema.parse(input);

    const clash = await prisma.institution.findUnique({ where: { name }, select: { id: true } });
    if (clash) {
      throw new AppError("CONFLICT", { userMessage: `"${name}" is already listed.` });
    }

    const created = await prisma.institution.create({
      data: { name, country: country || null },
      select: { id: true },
    });
    await audit(admin.id, "admin.preset.create", created.id, { kind: "institution", name });

    revalidatePath("/admin/presets");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

const facultySchema = z.object({
  institutionId: z.string().min(1),
  name: z.string().trim().min(2).max(200),
});

export async function createFaculty(input: unknown): Promise<ActionResult<null>> {
  try {
    const admin = await requireAdmin();
    const { institutionId, name } = facultySchema.parse(input);

    const institution = await prisma.institution.findUnique({ where: { id: institutionId } });
    if (!institution) throw new AppError("NOT_FOUND");

    const created = await prisma.faculty.create({
      data: { institutionId, name },
      select: { id: true },
    });
    await audit(admin.id, "admin.preset.create", created.id, {
      kind: "faculty",
      name,
      institution: institution.name,
    });

    revalidatePath("/admin/presets");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

const departmentSchema = z.object({
  facultyId: z.string().min(1),
  name: z.string().trim().min(2).max(200),
});

export async function createDepartment(input: unknown): Promise<ActionResult<null>> {
  try {
    const admin = await requireAdmin();
    const { facultyId, name } = departmentSchema.parse(input);

    const faculty = await prisma.faculty.findUnique({ where: { id: facultyId } });
    if (!faculty) throw new AppError("NOT_FOUND");

    const created = await prisma.department.create({
      data: { facultyId, name },
      select: { id: true },
    });
    await audit(admin.id, "admin.preset.create", created.id, {
      kind: "department",
      name,
      facultyId,
    });

    revalidatePath("/admin/presets");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/**
 * Removes an institution and everything beneath it.
 *
 * The cascade is a schema decision, not one made here: faculties and
 * departments are owned by their institution. What this refuses is removing one
 * that projects still name — and because a project stores the institution's
 * NAME, the check is by name rather than by id.
 */
export async function deleteInstitution(input: unknown): Promise<ActionResult<null>> {
  try {
    const admin = await requireAdmin();
    const { id } = z.object({ id: z.string().min(1) }).parse(input);

    const existing = await prisma.institution.findUnique({
      where: { id },
      include: { faculties: { include: { departments: true } } },
    });
    if (!existing) throw new AppError("NOT_FOUND");

    const inUse = await prisma.projectInstitution.count({ where: { institution: existing.name } });
    if (inUse > 0) {
      throw new AppError("CONFLICT", {
        userMessage: `${inUse} ${inUse === 1 ? "project names" : "projects name"} "${existing.name}". Removing it would take its departments out of the list they chose from.`,
      });
    }

    const departments = existing.faculties.reduce((n, f) => n + f.departments.length, 0);

    await prisma.institution.delete({ where: { id } });
    await audit(admin.id, "admin.preset.delete", id, {
      kind: "institution",
      name: existing.name,
      // Recorded because the cascade removes them too, and the trail should
      // show the size of what went rather than only the row that was clicked.
      cascadedFaculties: existing.faculties.length,
      cascadedDepartments: departments,
    });

    revalidatePath("/admin/presets");
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

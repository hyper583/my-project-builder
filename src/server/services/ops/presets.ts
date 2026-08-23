import { prisma } from "@/server/db";

/**
 * The reference data students choose from.
 *
 * Presets are referenced by their KEY or NAME, never by a foreign key — that is
 * deliberate, and it is what lets a student type an institution nobody has
 * seeded yet. The consequence is that deleting a preset cannot break
 * referential integrity, but it can quietly strand projects that named it:
 * a project whose `projectType` no longer resolves still has a type, it just
 * has one nothing recognises.
 *
 * So every list here carries a usage count. An admin should never be able to
 * remove something without seeing what it would leave behind, and the count is
 * the only honest way to show that when there is no constraint to lean on.
 */

export interface PresetUsage {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly order: number;
  /** Projects currently naming this preset. */
  readonly used: number;
}

export interface InstitutionNode {
  readonly id: string;
  readonly name: string;
  readonly country: string | null;
  readonly used: number;
  readonly faculties: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly departments: ReadonlyArray<{ readonly id: string; readonly name: string; readonly used: number }>;
  }>;
}

/**
 * Project types, with how many projects are built on each.
 *
 * These have the furthest reach of any preset: `defaultStructureFor` keys off
 * them, and the fast path rejects a type it cannot find — so removing one both
 * strands existing projects and makes that shape uncreatable.
 */
export async function listProjectTypes(): Promise<PresetUsage[]> {
  const [types, counts] = await Promise.all([
    prisma.projectTypeDef.findMany({ orderBy: { order: "asc" } }),
    prisma.project.groupBy({
      by: ["projectType"],
      where: { deletedAt: null, projectType: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const used = new Map(counts.map((row) => [row.projectType, row._count._all]));

  return types.map((type) => ({
    id: type.id,
    key: type.key,
    label: type.label,
    order: type.order,
    used: used.get(type.key) ?? 0,
  }));
}

/** Citation styles, with how many projects have chosen each. */
export async function listCitationStyles(): Promise<PresetUsage[]> {
  const [styles, counts] = await Promise.all([
    prisma.citationStyle.findMany({ orderBy: { order: "asc" } }),
    prisma.projectFormatting.groupBy({
      by: ["citationStyle"],
      where: { citationStyle: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const used = new Map(counts.map((row) => [row.citationStyle, row._count._all]));

  return styles.map((style) => ({
    id: style.id,
    key: style.key,
    label: style.label,
    order: style.order,
    used: used.get(style.key) ?? 0,
  }));
}

/**
 * Institutions with their faculty and department tree.
 *
 * Worth knowing when reading this: the wizard FLATTENS this hierarchy. It asks
 * for institution names and department names as two independent autocomplete
 * lists and never walks the tree. The structure is still worth maintaining —
 * it is what makes the department list coherent rather than a bag of names —
 * but nothing downstream enforces that a student's department belongs to their
 * institution, and this page should not imply otherwise.
 */
export async function listInstitutions(): Promise<InstitutionNode[]> {
  const [institutions, byInstitution, byDepartment] = await Promise.all([
    prisma.institution.findMany({
      orderBy: { name: "asc" },
      include: {
        faculties: {
          orderBy: { name: "asc" },
          include: { departments: { orderBy: { name: "asc" } } },
        },
      },
    }),
    prisma.projectInstitution.groupBy({
      by: ["institution"],
      where: { institution: { not: null } },
      _count: { _all: true },
    }),
    prisma.projectInstitution.groupBy({
      by: ["department"],
      where: { department: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const institutionUse = new Map(byInstitution.map((r) => [r.institution, r._count._all]));
  const departmentUse = new Map(byDepartment.map((r) => [r.department, r._count._all]));

  return institutions.map((institution) => ({
    id: institution.id,
    name: institution.name,
    country: institution.country,
    used: institutionUse.get(institution.name) ?? 0,
    faculties: institution.faculties.map((faculty) => ({
      id: faculty.id,
      name: faculty.name,
      departments: faculty.departments.map((department) => ({
        id: department.id,
        name: department.name,
        // Matched by name, because that is how a project stores it.
        used: departmentUse.get(department.name) ?? 0,
      })),
    })),
  }));
}

import {
  CitationStylePanel,
  InstitutionPanel,
  ProjectTypePanel,
} from "@/components/admin/preset-manager";
import { requireAdmin } from "@/server/dal/session";
import {
  listCitationStyles,
  listInstitutions,
  listProjectTypes,
} from "@/server/services/ops/presets";

export const dynamic = "force-dynamic";

/**
 * The reference data students choose from.
 *
 * Nothing here restricts anyone — every one of these lists backs an
 * autocomplete or a dropdown that also accepts a typed value, because the brief
 * requires that a student at an institution nobody seeded can still use the
 * product. What the lists do is make the common case fast and the resulting
 * data consistent enough to group by.
 */
export default async function AdminPresetsPage() {
  await requireAdmin();

  const [types, styles, institutions] = await Promise.all([
    listProjectTypes(),
    listCitationStyles(),
    listInstitutions(),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <header>
        <p className="label-caps">Presets</p>
        <h1 className="mt-2 text-[2rem] leading-none font-semibold tracking-[-0.035em]">
          Reference data
        </h1>
        <p className="mt-2.5 max-w-2xl leading-relaxed text-muted-foreground">
          Projects store the name or key they chose rather than a link to these rows, so a
          student is never blocked by a missing entry — and removing one cannot break a
          project, only strand it. Each item shows how many projects name it before you
          reach for delete.
        </p>
      </header>

      <div className="mt-10 space-y-12 pb-4">
        <ProjectTypePanel types={types} />
        <CitationStylePanel styles={styles} />
        <InstitutionPanel institutions={institutions} />
      </div>
    </div>
  );
}

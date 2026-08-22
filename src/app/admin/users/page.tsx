import { Search } from "lucide-react";

import { UserTable, type UserRow } from "@/components/admin/user-table";
import { requireAdmin } from "@/server/dal/session";
import { listUsers } from "@/server/services/ops/users";

/** Never cached: an administration view showing stale state invites mistakes. */
export const dynamic = "force-dynamic";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(value);
}

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";

  const users = await listUsers(query);

  const rows: UserRow[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    planTier: user.planTier,
    planLabel: user.planLabel,
    suspended: user.suspendedAt !== null,
    createdAt: formatDate(user.createdAt),
    projects: user.projects,
    generations: user.generations,
    generationLimit: user.generationLimit,
    edits: user.edits,
    editLimit: user.editLimit,
    lastActiveAdmin: user.lastActiveAdmin,
    isSelf: user.id === admin.id,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <header>
        <p className="label-caps">People</p>
        <h1 className="mt-2 text-[2rem] leading-none font-semibold tracking-[-0.035em]">
          Accounts
        </h1>
        <p className="mt-2.5 max-w-2xl leading-relaxed text-muted-foreground">
          Names, plans and usage. Not project content — reading someone&apos;s work is a
          separate action and is recorded as one. Every change on this page is logged
          against your account.
        </p>
      </header>

      {/* A plain GET form: the query lives in the URL, so a filtered view can be
          linked to and survives a refresh. */}
      <form role="search" method="GET" className="mt-8">
        <label htmlFor="user-search" className="sr-only">
          Search people by name or email
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="user-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search by name or email"
            className="h-11 w-full field pr-3 pl-9 text-base"
          />
        </div>
      </form>

      <div className="mt-6">
        <UserTable users={rows} />
      </div>
    </div>
  );
}

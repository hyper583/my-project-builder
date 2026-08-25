-- The front pages a Nigerian university project must open with.
--
-- Certification, Declaration, Dedication, Acknowledgements, Abstract, List of
-- Tables and List of Figures. None of them could be produced before, because
-- the data was never asked for: a student who paid for formatting still
-- assembled these by hand in Word, which is precisely where the formatting
-- stops matching the rest of the document.
--
-- Purely additive. Every column is nullable and the new table is empty, so no
-- existing row changes and nothing can fail on data that is already there.
--
-- Written with `prisma migrate diff` + `prisma migrate deploy`, not
-- `prisma migrate dev` — the shadow-database replay cannot be used on this
-- project, because 20260819071500_enable_rls references
-- `public._prisma_migrations`, which does not exist in a fresh shadow database.

-- AlterTable
ALTER TABLE "project_institution" ADD COLUMN     "headOfDepartment" TEXT,
ADD COLUMN     "matricNumber" TEXT,
ADD COLUMN     "supervisorName" TEXT,
ADD COLUMN     "supervisorTitle" TEXT;

-- CreateTable
CREATE TABLE "project_front_matter" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "dedication" TEXT,
    "acknowledgements" TEXT,
    "abstract" TEXT,
    "keywords" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_front_matter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_front_matter_projectId_key" ON "project_front_matter"("projectId");

-- AddForeignKey
ALTER TABLE "project_front_matter" ADD CONSTRAINT "project_front_matter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deny PostgREST access, as every other table in this schema does.
--
-- Supabase exposes `public` to the `anon` and `authenticated` roles and the
-- anon key is publishable by design. This table holds a student's dedication,
-- acknowledgements and abstract; without this it would be readable by anyone
-- holding that key. RLS with no policies denies those roles outright, while
-- Prisma connects as `postgres` and is unaffected.
ALTER TABLE "public"."project_front_matter" ENABLE ROW LEVEL SECURITY;

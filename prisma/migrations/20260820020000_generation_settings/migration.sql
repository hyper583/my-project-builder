-- Generation settings: page budget and source recency.
--
-- Written with `prisma migrate diff` + `prisma migrate deploy`, not
-- `prisma migrate dev` — see 20260820000000_consistency_issues for why the
-- shadow-database replay cannot be used on this project.

CREATE TABLE "project_generation_settings" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "minPages" INTEGER,
    "maxPages" INTEGER,
    "sourceRecencyYears" INTEGER,
    "retrieveSources" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_generation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_generation_settings_projectId_key" ON "project_generation_settings"("projectId");

-- AddForeignKey
ALTER TABLE "project_generation_settings" ADD CONSTRAINT "project_generation_settings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Same posture as every other table: RLS on with no policies, so the
-- publishable anon key reaches nothing.
ALTER TABLE "public"."project_generation_settings" ENABLE ROW LEVEL SECURITY;

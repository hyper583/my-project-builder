-- Consistency findings.
--
-- Written with `prisma migrate diff` + `prisma migrate deploy` rather than
-- `prisma migrate dev`. `migrate dev` replays every migration into a shadow
-- database, and 20260819071500_enable_rls enables RLS on
-- "public"."_prisma_migrations", which does not exist there — so the replay
-- fails before it reaches this migration. Editing that file would change its
-- checksum against an already-migrated database, which is the more dangerous
-- of the two options.

CREATE TYPE "IssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'DISMISSED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "IssueSource" AS ENUM ('CHECK', 'AI');

-- CreateTable
CREATE TABLE "consistency_issue" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" "IssueSource" NOT NULL DEFAULT 'CHECK',
    "severity" "IssueSeverity" NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "summary" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "sectionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consistency_issue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consistency_issue_projectId_status_idx" ON "consistency_issue"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "consistency_issue_projectId_fingerprint_key" ON "consistency_issue"("projectId", "fingerprint");

-- AddForeignKey
ALTER TABLE "consistency_issue" ADD CONSTRAINT "consistency_issue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Same posture as every other table: RLS on with no policies, so the
-- publishable anon key reaches nothing. Prisma connects as `postgres`, which
-- owns the table and bypasses RLS, so the application is unaffected.
ALTER TABLE "public"."consistency_issue" ENABLE ROW LEVEL SECURITY;

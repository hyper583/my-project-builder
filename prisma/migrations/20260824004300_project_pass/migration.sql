-- Project passes: what a student bought, and the project they spent it on.
--
-- The product is priced per project, so a pass is CONSUMED by a project rather
-- than running out on a clock. Entitlements previously came from
-- `user.planTier` alone, which had no end at all: one payment granted a
-- monthly-renewing allowance forever.
--
-- Written with `prisma migrate diff` + `prisma migrate deploy`, not
-- `prisma migrate dev` — see 20260820000000_consistency_issues for why the
-- shadow-database replay cannot be used on this project.

-- CreateTable
CREATE TABLE "project_pass" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "amountMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "provider" TEXT,
    "externalId" TEXT,
    "grantedByUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "project_pass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_pass_projectId_key" ON "project_pass"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_pass_externalId_key" ON "project_pass"("externalId");

-- CreateIndex
CREATE INDEX "project_pass_userId_idx" ON "project_pass"("userId");

-- CreateIndex
CREATE INDEX "project_pass_userId_claimedAt_idx" ON "project_pass"("userId", "claimedAt");

-- AddForeignKey
ALTER TABLE "project_pass" ADD CONSTRAINT "project_pass_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_pass" ADD CONSTRAINT "project_pass_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Same posture as every other table: RLS on with no policies, so the
-- publishable anon key reaches nothing. A pass is a payment record.
ALTER TABLE "public"."project_pass" ENABLE ROW LEVEL SECURITY;

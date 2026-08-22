-- CreateTable
CREATE TABLE "error_log" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "stack" TEXT,
    "origin" TEXT,
    "userId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_heartbeat" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_heartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "error_log_createdAt_idx" ON "error_log"("createdAt");

-- CreateIndex
CREATE INDEX "error_log_code_createdAt_idx" ON "error_log"("code", "createdAt");

-- CreateIndex
CREATE INDEX "worker_heartbeat_provider_lastSeen_idx" ON "worker_heartbeat"("provider", "lastSeen");

-- AddForeignKey
ALTER TABLE "error_log" ADD CONSTRAINT "error_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;


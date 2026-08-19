-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PAID');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'GENERATING', 'READY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectKind" AS ENUM ('REAL', 'DEMO');

-- CreateEnum
CREATE TYPE "TopicApproval" AS ENUM ('YES', 'NO', 'UNSURE');

-- CreateEnum
CREATE TYPE "VariableKind" AS ENUM ('INDEPENDENT', 'DEPENDENT', 'OTHER');

-- CreateEnum
CREATE TYPE "InstructionSource" AS ENUM ('STUDENT', 'SUPERVISOR', 'DEPARTMENT');

-- CreateEnum
CREATE TYPE "SectionKind" AS ENUM ('PRELIMINARY', 'CHAPTER', 'SECTION', 'REFERENCES', 'APPENDIX');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('UPLOAD', 'REFERENCE', 'NOTE', 'SUPERVISOR_INSTRUCTION');

-- CreateEnum
CREATE TYPE "ReferenceVerification" AS ENUM ('VERIFIED', 'NEEDS_REVIEW', 'USER_PROVIDED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('DOCX', 'PDF');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "UsageKind" AS ENUM ('AI_GENERATION', 'AI_EDIT', 'EXPORT', 'UPLOAD_BYTES');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "planTier" "PlanTier" NOT NULL DEFAULT 'FREE',
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "topic" TEXT,
    "topicApproved" "TopicApproval" NOT NULL DEFAULT 'UNSURE',
    "researchArea" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "kind" "ProjectKind" NOT NULL DEFAULT 'REAL',
    "projectType" TEXT,
    "projectTypeCustom" TEXT,
    "wizardStep" INTEGER NOT NULL DEFAULT 1,
    "completionPct" INTEGER NOT NULL DEFAULT 0,
    "wizardState" JSONB,
    "lastGeneratedSection" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_institution" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "institution" TEXT,
    "campus" TEXT,
    "faculty" TEXT,
    "department" TEXT,
    "programme" TEXT,
    "degree" TEXT,
    "academicLevel" TEXT,
    "institutionId" TEXT,
    "facultyId" TEXT,
    "departmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_research_details" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "researchProblem" TEXT,
    "aim" TEXT,
    "objectives" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "researchQuestions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hypotheses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "studyLocation" TEXT,
    "targetPopulation" TEXT,
    "samplePopulation" TEXT,
    "sampleSize" TEXT,
    "samplingTechnique" TEXT,
    "researchDesign" TEXT,
    "dataCollectionMethod" TEXT,
    "researchInstruments" TEXT,
    "dataAnalysisMethod" TEXT,
    "theoreticalFramework" TEXT,
    "conceptualFramework" TEXT,
    "limitations" TEXT,
    "scope" TEXT,
    "keyTerminology" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_research_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_methodology" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_methodology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_variable" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "VariableKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_variable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_instruction" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "source" "InstructionSource" NOT NULL DEFAULT 'STUDENT',
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_instruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_formatting" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "citationStyle" TEXT,
    "citationStyleCustom" TEXT,
    "font" TEXT,
    "fontSize" TEXT,
    "lineSpacing" TEXT,
    "paraSpacing" TEXT,
    "margins" TEXT,
    "headingStyle" TEXT,
    "pageNumbering" TEXT,
    "chapterNumbering" TEXT,
    "referenceFormat" TEXT,
    "tableFormat" TEXT,
    "figureFormat" TEXT,
    "customInstructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_formatting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_section" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" "SectionKind" NOT NULL DEFAULT 'SECTION',
    "number" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_placeholder" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "section_placeholder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_document" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_extraction" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" "ExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "text" TEXT,
    "metadata" JSONB,
    "pages" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_extraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chunk" (
    "id" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "tokenEst" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_chunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_source" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_reference" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "year" TEXT,
    "title" TEXT NOT NULL,
    "publication" TEXT,
    "publisher" TEXT,
    "volume" TEXT,
    "issue" TEXT,
    "pages" TEXT,
    "doi" TEXT,
    "url" TEXT,
    "accessedAt" TIMESTAMP(3),
    "raw" TEXT,
    "verification" "ReferenceVerification" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_citation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "sectionId" TEXT,
    "locator" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_job" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "heartbeat" TIMESTAMP(3),
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generation_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_step" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "generation_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_version" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "number" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'QUEUED',
    "hadDisclaimer" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "storageKey" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "export_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_record" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "UsageKind" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "projectId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "PlanTier" NOT NULL DEFAULT 'FREE',
    "status" TEXT NOT NULL DEFAULT 'active',
    "provider" TEXT,
    "externalId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit" (
    "id" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculty" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "faculty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_type_def" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "methodologyKey" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_type_def_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citation_style" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "citation_style_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formatting_preset" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "values" JSONB NOT NULL,

    CONSTRAINT "formatting_preset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_role_idx" ON "user"("role");

-- CreateIndex
CREATE INDEX "user_planTier_idx" ON "user"("planTier");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_issuer_accountId_key" ON "account"("issuer", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "project_userId_deletedAt_idx" ON "project"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "project_userId_status_idx" ON "project"("userId", "status");

-- CreateIndex
CREATE INDEX "project_kind_idx" ON "project"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "project_institution_projectId_key" ON "project_institution"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_research_details_projectId_key" ON "project_research_details"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_methodology_projectId_key" ON "project_methodology"("projectId");

-- CreateIndex
CREATE INDEX "project_variable_projectId_kind_idx" ON "project_variable"("projectId", "kind");

-- CreateIndex
CREATE INDEX "project_instruction_projectId_idx" ON "project_instruction"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_formatting_projectId_key" ON "project_formatting"("projectId");

-- CreateIndex
CREATE INDEX "project_section_projectId_parentId_order_idx" ON "project_section"("projectId", "parentId", "order");

-- CreateIndex
CREATE INDEX "section_placeholder_sectionId_resolved_idx" ON "section_placeholder"("sectionId", "resolved");

-- CreateIndex
CREATE INDEX "project_document_projectId_idx" ON "project_document"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "document_extraction_documentId_key" ON "document_extraction"("documentId");

-- CreateIndex
CREATE INDEX "document_chunk_extractionId_order_idx" ON "document_chunk"("extractionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "project_source_documentId_key" ON "project_source"("documentId");

-- CreateIndex
CREATE INDEX "project_source_projectId_kind_idx" ON "project_source"("projectId", "kind");

-- CreateIndex
CREATE INDEX "project_reference_projectId_verification_idx" ON "project_reference"("projectId", "verification");

-- CreateIndex
CREATE INDEX "project_citation_projectId_idx" ON "project_citation"("projectId");

-- CreateIndex
CREATE INDEX "project_citation_referenceId_idx" ON "project_citation"("referenceId");

-- CreateIndex
CREATE INDEX "generation_job_status_createdAt_idx" ON "generation_job"("status", "createdAt");

-- CreateIndex
CREATE INDEX "generation_job_projectId_idx" ON "generation_job"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "generation_step_jobId_order_key" ON "generation_step"("jobId", "order");

-- CreateIndex
CREATE INDEX "project_version_projectId_idx" ON "project_version"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_version_projectId_number_key" ON "project_version"("projectId", "number");

-- CreateIndex
CREATE INDEX "ai_conversation_projectId_idx" ON "ai_conversation"("projectId");

-- CreateIndex
CREATE INDEX "ai_message_conversationId_createdAt_idx" ON "ai_message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "export_projectId_idx" ON "export"("projectId");

-- CreateIndex
CREATE INDEX "export_userId_createdAt_idx" ON "export"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "usage_record_userId_kind_createdAt_idx" ON "usage_record"("userId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_userId_key" ON "subscription"("userId");

-- CreateIndex
CREATE INDEX "audit_log_userId_createdAt_idx" ON "audit_log"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_action_createdAt_idx" ON "audit_log"("action", "createdAt");

-- CreateIndex
CREATE INDEX "rate_limit_windowStart_idx" ON "rate_limit"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_identity_bucket_windowStart_key" ON "rate_limit"("identity", "bucket", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "institution_name_key" ON "institution"("name");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_institutionId_name_key" ON "faculty"("institutionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "department_facultyId_name_key" ON "department"("facultyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "project_type_def_key_key" ON "project_type_def"("key");

-- CreateIndex
CREATE UNIQUE INDEX "citation_style_key_key" ON "citation_style"("key");

-- CreateIndex
CREATE UNIQUE INDEX "formatting_preset_key_key" ON "formatting_preset"("key");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_institution" ADD CONSTRAINT "project_institution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_research_details" ADD CONSTRAINT "project_research_details_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_methodology" ADD CONSTRAINT "project_methodology_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_variable" ADD CONSTRAINT "project_variable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_instruction" ADD CONSTRAINT "project_instruction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_formatting" ADD CONSTRAINT "project_formatting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_section" ADD CONSTRAINT "project_section_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_section" ADD CONSTRAINT "project_section_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "project_section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_placeholder" ADD CONSTRAINT "section_placeholder_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "project_section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_document" ADD CONSTRAINT "project_document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_extraction" ADD CONSTRAINT "document_extraction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "project_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "document_extraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_source" ADD CONSTRAINT "project_source_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_source" ADD CONSTRAINT "project_source_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "project_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_reference" ADD CONSTRAINT "project_reference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_citation" ADD CONSTRAINT "project_citation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_citation" ADD CONSTRAINT "project_citation_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "project_reference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_citation" ADD CONSTRAINT "project_citation_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "project_section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_step" ADD CONSTRAINT "generation_step_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "generation_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_version" ADD CONSTRAINT "project_version_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export" ADD CONSTRAINT "export_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export" ADD CONSTRAINT "export_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_record" ADD CONSTRAINT "usage_record_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty" ADD CONSTRAINT "faculty_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "faculty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Index the foreign-key columns that were not already covered by a leading index.
-- Postgres does not index FK columns automatically, so every ON DELETE CASCADE /
-- SET NULL on these relations would otherwise require a sequential scan.
--
-- project_section.parentId was covered only as the SECOND column of
-- (projectId, parentId, order), which cannot serve the self-referencing FK.

CREATE INDEX "project_section_parentId_idx" ON "project_section"("parentId");
CREATE INDEX "project_citation_sectionId_idx" ON "project_citation"("sectionId");
CREATE INDEX "ai_conversation_userId_idx" ON "ai_conversation"("userId");

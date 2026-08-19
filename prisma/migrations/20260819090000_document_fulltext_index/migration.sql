-- Full-text search over extracted document chunks.
--
-- An expression index rather than a stored tsvector column: it needs no schema
-- change, and Postgres uses it for the same to_tsvector(...) @@ ... predicate
-- the source search runs. Semantic search via pgvector can be added later
-- alongside this without restructuring the table.
CREATE INDEX "document_chunk_text_fts_idx"
  ON "document_chunk"
  USING GIN (to_tsvector('english', "text"));

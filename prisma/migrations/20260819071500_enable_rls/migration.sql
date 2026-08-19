-- Deny PostgREST access to every table in the public schema.
--
-- Supabase exposes the public schema over PostgREST to the `anon` and
-- `authenticated` roles, and the anon key is publishable by design. This
-- application does not use supabase-js at all — Prisma connects as `postgres` —
-- so without RLS every row was reachable by anyone holding that key.
--
-- Enabling RLS with NO policies denies those roles outright. The `postgres`
-- role owns these tables and bypasses RLS (no FORCE ROW LEVEL SECURITY), so
-- Prisma is unaffected. Authorisation for the app itself continues to live in
-- the Data Access Layer, not here; this is defence in depth.
--
-- If supabase-js is ever adopted, add explicit policies before using it.

ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."verification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_institution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_research_details" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_methodology" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_variable" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_instruction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_formatting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_section" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."section_placeholder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."document_extraction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."document_chunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_source" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_reference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_citation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."generation_job" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."generation_step" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_version" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ai_conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ai_message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."export" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."usage_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."rate_limit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."institution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."faculty" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_type_def" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."citation_style" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."formatting_preset" ENABLE ROW LEVEL SECURITY;

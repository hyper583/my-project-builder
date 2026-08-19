-- Make Project.kind immutable at the database level.
--
-- A DEMO project is allowed to contain illustrative fabricated data; a REAL one
-- is not. If `kind` could be flipped after creation, a demo full of invented
-- results could quietly become a "real" project — which is exactly the failure
-- the demo safeguards exist to prevent.
--
-- Enforcing this in a trigger rather than only in application code means it
-- holds for every writer: server actions, a future admin tool, a migration
-- script, or someone at a psql prompt.

CREATE OR REPLACE FUNCTION project_kind_is_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM OLD.kind THEN
    RAISE EXCEPTION
      'project.kind is immutable (attempted % -> %). Convert a demo with the '
      'convert-to-real flow, which strips fabricated content, instead of '
      'changing kind directly.', OLD.kind, NEW.kind
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER project_kind_immutable
  BEFORE UPDATE ON "project"
  FOR EACH ROW
  EXECUTE FUNCTION project_kind_is_immutable();

-- Entfernt Alt-Schema-Leichen: Foreign-Key-Constraints auf den User-Tabellen,
-- die auf public.courses/sections/lessons zeigen. Sie stammen aus einem frühen
-- `drizzle-kit push` (vor Phase 2). Seit Phase 2 lebt der Content in Payload
-- (Schema `payload`), und die slug-Spalten sind NOMINELLE Referenzen ohne
-- DB-FK (siehe lib/db/schema.ts). Die toten FKs blockierten Inserts in
-- enrollments/lesson_progress/quiz_attempts (course_slug existiert nur in
-- payload.courses, nicht public.courses) → 23503 FK-Violation.
--
-- Idempotent: dropt alle FK-Constraints dieser drei Tabellen. Auf sauberen
-- (migrate-erzeugten) DBs existieren keine → no-op. PRIMARY KEYs und
-- RLS-Policies sind nicht betroffen (nur contype = 'f').
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname, t.relname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND t.relname IN ('enrollments', 'lesson_progress', 'quiz_attempts')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.relname, r.conname);
  END LOOP;
END $$;

-- ============================================================================
-- WISP-FLOW · Per-worker production batch ownership
-- ============================================================================
-- Run this once in the Supabase SQL editor.
--
-- production_batches previously had no column attributing a batch to the
-- worker who created it, so every worker's "Stages" screen showed every
-- other worker's batches and stage logs. These two columns let the app
-- scope `production_batches` reads to the logged-in worker going forward.
--
-- Pre-existing rows will have worker_name/worker_id = NULL (that attribution
-- was never captured). The app filters strictly on worker_name match, so
-- these legacy rows become invisible on every worker's phone going forward
-- -- they still exist in this table and remain fully visible on the manager
-- web dashboard for cleanup/reassignment if needed.
-- ----------------------------------------------------------------------------

ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS worker_id text;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS worker_name text;

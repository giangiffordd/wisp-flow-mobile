-- ============================================================================
-- WISP-FLOW · Worker-targeted alerts
-- ============================================================================
-- Run this once in the Supabase SQL editor.
--
-- The `alerts` table was previously pure broadcast -- every unread alert was
-- visible to every worker, with no way to tell "this alert is about MY batch"
-- from "this alert is about someone else's batch." This adds an optional
-- targeting column: NULL means broadcast (visible to everyone, as before),
-- a worker's name means that alert is meant specifically for them.
-- ----------------------------------------------------------------------------

ALTER TABLE alerts ADD COLUMN IF NOT EXISTS worker_name text;

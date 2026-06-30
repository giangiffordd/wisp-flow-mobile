-- ============================================================================
-- WISP-FLOW · Alerts table RLS fix
-- ============================================================================
-- Run this once in the Supabase SQL editor.
--
-- The `alerts` table has been silently empty in production despite the web
-- dashboard's approve/reject handlers always trying to insert into it -- the
-- insert call had no error checking, masking a likely RLS gap. Mobile workers
-- also need to READ this table via the plain anon key (workers authenticate
-- through a custom login_worker RPC, never a real Supabase Auth session), so
-- both the web's authenticated INSERT and mobile's anon SELECT/UPDATE need to
-- be explicitly granted. These policies are purely additive (Postgres RLS
-- policies of the default PERMISSIVE type are OR'd together), so this is safe
-- to run regardless of whatever policies already exist -- it can only grant
-- MORE access, never take any away.
-- ----------------------------------------------------------------------------

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wisp_alerts_select_all ON alerts;
CREATE POLICY wisp_alerts_select_all ON alerts
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS wisp_alerts_insert_authenticated ON alerts;
CREATE POLICY wisp_alerts_insert_authenticated ON alerts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS wisp_alerts_update_all ON alerts;
CREATE POLICY wisp_alerts_update_all ON alerts
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

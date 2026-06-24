-- Single-session-per-account enforcement.
-- Additive only: adds one nullable column and two new RPC functions.
-- Does NOT touch the existing login_worker function or any existing data.
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE throughout).

-- 1. Track which session is currently "the" active one for each worker.
ALTER TABLE workers ADD COLUMN IF NOT EXISTS active_session_token uuid;

-- 2. Call right after a successful login to claim this device's session as
--    the active one. Returns the new token, which the client stores
--    alongside the rest of its session info. SECURITY DEFINER so the app's
--    anon key can call this without needing a broad UPDATE policy on
--    workers (mirrors how login_worker already bypasses RLS for the PIN
--    check).
CREATE OR REPLACE FUNCTION claim_worker_session(p_worker_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_token uuid := gen_random_uuid();
BEGIN
  UPDATE workers SET active_session_token = new_token WHERE id = p_worker_id;
  RETURN new_token;
END;
$$;

-- 3. Polled periodically by the app to check whether its stored token is
--    still the active one. Returns false once a newer login elsewhere has
--    overwritten it, telling the older device to log itself out.
CREATE OR REPLACE FUNCTION is_session_active(p_worker_id uuid, p_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_token uuid;
BEGIN
  SELECT active_session_token INTO current_token FROM workers WHERE id = p_worker_id;
  RETURN current_token IS NOT NULL AND current_token = p_token;
END;
$$;

-- 4. Make sure the app's anon key can actually call these.
GRANT EXECUTE ON FUNCTION claim_worker_session(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_session_active(uuid, uuid) TO anon, authenticated;

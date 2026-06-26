-- ============================================================================
-- WISP-FLOW · Finished Goods UID scan intake → Human-in-the-Loop approval
-- ============================================================================
-- Run this once in the Supabase SQL editor.
--
-- UID generation is EXTERNAL (web/admin tooling) -- the mobile app never
-- mints UIDs or renders QR codes, it only scans existing ones. `next_uid` is
-- included here as the CONTRACT the external generator must call so the
-- sequence (uid_sequences) and the registry (specimen_uids) it writes to
-- stay consistent with what this migration expects.
--
-- Per the project's Human-in-the-Loop scope, a worker scanning a finished
-- goods UID only files a PENDING `finished_goods_requests` row. The mobile
-- app never writes to `inventory` directly. Only when a manager flips that
-- request's status to 'approved' (on the web dashboard) does the trigger
-- below mark the UID 'received' and apply +1 to the matching inventory row
-- -- mirroring `apply_scan_batch_to_inventory` in qc_approval_migration.sql.
-- ----------------------------------------------------------------------------

-- 1. Sequence counter + RPC used by the EXTERNAL generator to mint UIDs of
--    the form YY-PREFIX-NNNN (e.g. 26-PUL-0001). Atomic upsert-and-return.
CREATE TABLE IF NOT EXISTS uid_sequences (
  year     smallint NOT NULL,
  prefix   text     NOT NULL,
  last_seq int      NOT NULL DEFAULT 0,
  PRIMARY KEY (year, prefix)
);

CREATE OR REPLACE FUNCTION next_uid(p_year smallint, p_prefix text)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq int;
BEGIN
  INSERT INTO uid_sequences (year, prefix, last_seq)
  VALUES (p_year, p_prefix, 1)
  ON CONFLICT (year, prefix)
    DO UPDATE SET last_seq = uid_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN v_seq;
END;
$$;

-- 2. Registry of every minted UID. Populated by the external generator when
--    it mints a UID (status starts at 'generated'); the app's intake RPC
--    moves it to 'requested', and manager approval moves it to 'received'.
CREATE TABLE IF NOT EXISTS specimen_uids (
  uid                  text PRIMARY KEY,
  year                 smallint NOT NULL,
  prefix               text     NOT NULL,
  seq                  int      NOT NULL,
  genus                text     NOT NULL,
  species              text     NOT NULL,
  species_display      text     NOT NULL,
  production_batch_id  uuid,
  status               text NOT NULL DEFAULT 'generated'
                         CHECK (status IN ('generated', 'requested', 'received')),
  generated_by         text,
  generated_at         timestamptz DEFAULT now(),
  requested_by         text,
  requested_at         timestamptz,
  received_by          text,
  received_at          timestamptz
);

-- 3. One pending/approved/rejected request per scan. The partial unique
--    index guarantees a UID can't have two simultaneously-active (i.e.
--    non-rejected) requests in flight -- a rejected request frees the UID
--    up for a fresh scan/resubmission.
CREATE TABLE IF NOT EXISTS finished_goods_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid              text REFERENCES specimen_uids(uid),
  species          text,
  species_display  text,
  worker_id        text,
  worker_name      text,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at       timestamptz DEFAULT now(),
  reviewed_by      text,
  reviewed_at      timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_fg_request_active
  ON finished_goods_requests (uid)
  WHERE status <> 'rejected';

-- 4. RPC called by the APP when a worker scans a UID. Files the pending
--    request and flips the registry row to 'requested'. Never touches
--    `inventory` -- that only happens on manager approval (see the trigger
--    below).
CREATE OR REPLACE FUNCTION submit_finished_goods_intake(
  p_uid          text,
  p_worker_id    text,
  p_worker_name  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_specimen specimen_uids;
  v_existing finished_goods_requests;
BEGIN
  SELECT * INTO v_specimen FROM specimen_uids WHERE uid = p_uid;

  IF v_specimen.uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unknown', 'message', 'Not in registry');
  END IF;

  IF v_specimen.status = 'received' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'received', 'message', 'Already counted');
  END IF;

  SELECT * INTO v_existing
    FROM finished_goods_requests
   WHERE uid = p_uid AND status <> 'rejected'
   LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'duplicate', 'message', 'Already submitted — pending approval');
  END IF;

  INSERT INTO finished_goods_requests (uid, species, species_display, worker_id, worker_name, status)
  VALUES (p_uid, v_specimen.species, v_specimen.species_display, p_worker_id, p_worker_name, 'pending');

  UPDATE specimen_uids
     SET status       = 'requested',
         requested_by = p_worker_name,
         requested_at = now()
   WHERE uid = p_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'submitted',
    'species_display', v_specimen.species_display,
    'message', 'Submitted — pending manager approval'
  );
END;
$$;

-- 5. On approval, mark the UID 'received' and apply +1 to the matching
--    inventory row. Matches on genus + species epithet, case-insensitive --
--    mirrors apply_scan_batch_to_inventory in qc_approval_migration.sql.
--    Guarded so it only ever fires once per UID (only when the registry row
--    wasn't already 'received').
CREATE OR REPLACE FUNCTION apply_finished_goods_request_to_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_genus    text;
  v_species  text;
  v_status   text;
BEGIN
  IF NEW.status = 'approved' AND COALESCE(OLD.status, '') <> 'approved' THEN
    NEW.reviewed_at := now();

    -- Pull the structured genus/species straight from the registry rather than
    -- re-splitting a name string: finished_goods_requests.species holds only
    -- the epithet (e.g. "ulysses"), so split_part on it would mis-derive the
    -- genus and the inventory match would never hit.
    SELECT genus, species, status INTO v_genus, v_species, v_status
      FROM specimen_uids WHERE uid = NEW.uid;

    IF COALESCE(v_status, '') <> 'received' THEN
      UPDATE inventory
         SET quantity     = COALESCE(quantity, 0) + 1,
             last_updated = now()
       WHERE lower(genus) = lower(v_genus)
         AND (v_species IS NULL OR v_species = '' OR lower(species) = lower(v_species));

      UPDATE specimen_uids
         SET status      = 'received',
             received_at = now()
       WHERE uid = NEW.uid;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_finished_goods_request ON finished_goods_requests;
CREATE TRIGGER trg_apply_finished_goods_request
  BEFORE UPDATE ON finished_goods_requests
  FOR EACH ROW
  EXECUTE FUNCTION apply_finished_goods_request_to_inventory();

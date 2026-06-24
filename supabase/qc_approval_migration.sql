-- ============================================================================
-- WISP-FLOW · Human-in-the-Loop QC approval → inventory
-- ============================================================================
-- Run this once in the Supabase SQL editor.
--
-- Per the project scope, all mobile QC scans are held in a "pending" state and
-- only affect real stock once a MANAGER approves them on the web dashboard.
-- The mobile app no longer writes to `inventory` directly. Instead it inserts
-- a `scan_batches` row with status = 'pending_approval'. When the manager flips
-- that row's status to 'approved', the trigger below applies the batch's PASS
-- count to the matching inventory row. This guarantees AI miscounts can be
-- corrected before they ever touch inventory (Specific Objective 4 + the
-- Human-in-the-Loop delimitation).
-- ----------------------------------------------------------------------------

-- 1. Link a QC scan batch to its 12-stage production batch, and track whether
--    its count has already been applied to inventory (idempotency guard).
ALTER TABLE scan_batches ADD COLUMN IF NOT EXISTS production_batch_id uuid;
ALTER TABLE scan_batches ADD COLUMN IF NOT EXISTS inventory_applied boolean DEFAULT false;

-- 2. On approval, add the batch's PASS count to the matching inventory row.
--    Matches on genus + species epithet (e.g. "Papilio ulysses" -> genus
--    "Papilio", species "ulysses"), case-insensitive. If no row matches, the
--    update is a no-op (no wrong-row writes).
CREATE OR REPLACE FUNCTION apply_scan_batch_to_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_genus   text;
  v_species text;
BEGIN
  IF NEW.status = 'approved'
     AND COALESCE(OLD.status, '') <> 'approved'
     AND COALESCE(NEW.inventory_applied, false) = false
     AND COALESCE(NEW.pass_count, 0) > 0
  THEN
    v_genus := split_part(trim(NEW.species), ' ', 1);
    -- everything after the first space is the species epithet (may be empty)
    v_species := trim(substring(trim(NEW.species) from position(' ' in trim(NEW.species))));

    UPDATE inventory
       SET quantity     = COALESCE(quantity, 0) + NEW.pass_count,
           last_updated = now()
     WHERE lower(genus) = lower(v_genus)
       AND (v_species = '' OR lower(species) = lower(v_species));

    NEW.inventory_applied := true;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Fire the function whenever a scan batch row is updated.
DROP TRIGGER IF EXISTS trg_apply_scan_batch ON scan_batches;
CREATE TRIGGER trg_apply_scan_batch
  BEFORE UPDATE ON scan_batches
  FOR EACH ROW
  EXECUTE FUNCTION apply_scan_batch_to_inventory();

# WISP-FLOW — Web Dashboard Integration Handoff

> **Read me first:** This document is self-contained. It was generated from the mobile app repo (which you do not have access to) so every schema, SQL signature, and status value you need is inlined below — you should not need to ask "what does the mobile app send?" for anything covered here. Paste this whole file into your Claude Code session.

---

## 1. What WISP-FLOW is

WISP-FLOW is an insect-specimen production tracking and storefront system for a butterfly/insect farm business (client: "Bits and Bugs"). There is **ONE shared Supabase Postgres project** used by **both halves**:

- **Mobile app (React Native / Expo, this handoff's source repo)** — worker-facing. Handles: worker PIN login, the 12-stage production batch lifecycle, AI-assisted QC scanning of specimens (YOLO-based detection + confidence scoring), logging notes per production stage, and scanning Finished Goods UID stickers at packaging/intake. **The mobile app is essentially feature-complete.** It never writes to `inventory` directly — every inventory change is gated behind a manager approval that happens on the web dashboard.
- **Web dashboard (your repo)** — manager-facing. Handles: approving/rejecting QC scan batches, approving/rejecting finished-goods intake requests, generating & printing Finished Goods UID stickers, inventory, procurement, and the storefront.

This handoff tells you exactly what the web side must build or verify so the two halves connect correctly through the shared database. The mobile app's contracts (table names, column names, RPC signatures, status strings) are **fixed** — treat them as the API surface you're integrating against.

**Your web stack** (as given): React 18 + Vite + TypeScript + shadcn/ui (Radix) + Tailwind + TanStack React Query + React Router 6 + React Hook Form/Zod + Lucide icons + Sonner toasts, talking to Supabase via the JS client with RLS enabled. Analytical/heavier endpoints live in your Express procurement backend. `xlsx` is available for exports; you'll need a QR rendering library (e.g. `qrcode.react`) for Feature 1 since `xlsx` doesn't render QR images. Use these conventions for anything new, but defer to whatever your repo already does if it differs.

---

## 2. How to read this doc — legend

| Marker | Meaning |
|---|---|
| 🟥 **BUILD** | New feature/table-consumer that (to our knowledge) doesn't exist yet on the web side. Build from scratch. |
| 🟧 **VERIFY/WIRE** | May already partially exist in your dashboard. Confirm it's wired correctly against the contracts below; fix gaps. |
| 🟦 **CONTRACT** | Existing behavior the mobile app depends on. Do not rename, retype, or change the signature/semantics of anything marked this way. |

---

## 3. ⚠️ Cross-cutting must-dos — read this section before building anything

### 3.1 RLS policies are MISSING on the two new tables 🟥

`specimen_uids` and `finished_goods_requests` (full schemas in §5/§6 below) currently have **no RLS policies**. This is safe for the mobile app because it only ever touches them through `SECURITY DEFINER` RPCs (`submit_finished_goods_intake`, the approval trigger) which bypass RLS entirely.

**It is not safe for your dashboard**, because your dashboard reads/writes these tables **directly** as an authenticated manager via the Supabase JS client.

Action: inspect the RLS policies on one of your existing manager-facing tables (e.g. whatever secures `scan_batches` or `inventory` today) and mirror that pattern for the two new tables. At minimum, provision:

- **`specimen_uids`**: authenticated manager role needs `INSERT` (for UID generation) and `SELECT` (for lookups/printing/queue joins). No `UPDATE`/`DELETE` needed from the web — status transitions on this table are driven by the RPC/trigger only.
- **`finished_goods_requests`**: authenticated manager role needs `SELECT` (queue) and `UPDATE` (approve/reject — must be allowed to set `status`, `reviewed_by`, `reviewed_at`). No `INSERT`/`DELETE` needed from the web — rows are created only by `submit_finished_goods_intake`.

Do **not** grant broad write access beyond what's needed above; match the restrictiveness of your existing policies.

### 3.2 Migration coordination — run this EXACTLY ONCE 🟧

`finished_goods_uid_migration.sql` (full contents inlined in §5) creates: `uid_sequences`, `specimen_uids`, `finished_goods_requests`, the `next_uid` RPC, the `submit_finished_goods_intake` RPC, and the `apply_finished_goods_request_to_inventory` trigger.

**The mobile-app owner is the one applying this migration to the shared Supabase project.** Your job:

1. **Confirm** it has actually been applied (check Supabase dashboard → Table Editor for `specimen_uids` / `finished_goods_requests`, or query `information_schema.tables`).
2. **Fold it into your own migration history** as the next sequential file in your `supabase_migrations/` directory (you're currently at roughly `v32` — make this `v33` or whatever's next) so your local migration ledger stays consistent with what's actually live. Copy the SQL in verbatim (don't rewrite it).
3. **Add the RLS policies from §3.1** as part of that same migration file (or a follow-up one).

**Do NOT re-run the table/RPC/trigger creation statements if they're already applied** — they use `IF NOT EXISTS` / `CREATE OR REPLACE` so re-running is technically idempotent, but coordinate with the mobile owner before touching this so you don't race a live migration.

### 3.3 Inventory seeding & species matching is exact-string, case-insensitive only 🟥

Both approval triggers (QC batch approval in §7, finished-goods approval in §6) bump inventory by matching on **`genus` + `species`, case-insensitive**, against the `inventory` table. If no row matches, **the +1 silently no-ops** — no error, no exception, the count just doesn't land.

This means: **`inventory` must contain exactly one row per species, for all 22 species in the prefix map (§4.1), with `genus` and `species` columns matching exactly** (case-insensitive) what's in that map.

**Specifically flag this one**: `Polyura delphis concha` — genus is `"Polyura"`, but the species column must be the **two-word epithet `"delphis concha"`** (not just `"delphis"`). If your inventory row only has `"delphis"`, the QC trigger's `split_part(... , ' ', 1)` derivation of genus still works, but the species-epithet substring comparison (everything after the first space) will be `"delphis concha"` — so your inventory row's species column needs the full two-word string or the match (and thus the +1) fails for that species.

Action: audit `inventory` now. For each of the 22 prefixes in §4.1, confirm a row exists with `lower(genus)` and `lower(species)` matching. Backfill any missing rows with `quantity = 0` so future approvals land correctly instead of silently vanishing.

### 3.4 `scan_batches` has no guaranteed `created_at` column 🟧

`scan_batches` was created directly in the Supabase dashboard, outside of any repo migration — it has **no guaranteed `created_at` column**. This already forced the mobile History screen to fetch all columns and detect whichever timestamp field is actually present, ordering client-side, instead of relying on `.order('created_at')`.

**Recommendation**: add `created_at timestamptz DEFAULT now()` to `scan_batches` via a proper migration. This lets both apps order reliably with a normal query instead of guessing at field names. Not strictly blocking, but do it — it removes a footgun for both sides.

---

## 4. 🟥 FEATURE 1 — Finished Goods UID Generator (BUILD)

### 4.1 Purpose

Mint printable UID stickers (QR codes) at the packaging stage, before any physical specimen exists in finished-goods inventory. A manager picks a production batch, generates N UIDs for it, and prints a label sheet. Workers later scan these stickers on mobile to file an intake request (see Feature 2).

### 4.2 UID format

```
YY-PREFIX-NNNN
```

- `YY` — last 2 digits of the current year (e.g. `26` for 2026)
- `PREFIX` — uppercase 3-letter code, one per species (table below)
- `NNNN` — zero-padded sequence number, **minimum 4 digits**, grows past `9999` un-padded further (e.g. `10000`)

Example: `26-PUL-0001`

The mobile scanner extracts the UID via this regex, tolerant of any surrounding text/URL:

```js
const UID_PATTERN = /(\d{2})-([A-Za-z]{3})-(\d{4,})/;
```

So the QR payload can be **any string containing that pattern** — a bare UID or a full URL. **Recommended**: encode a real verification URL so scanning the sticker with any phone camera (not just the app) shows something useful, e.g.:

```
https://<your-domain>/u/26-PUL-0001
```

The mobile app's `parseUid()` will find the embedded UID regardless of the domain/path around it.

### 4.3 Full 22-species prefix map (inline this exactly — it is the contract)

| Prefix | Genus | Species (epithet) | Display name |
|---|---|---|---|
| PUL | Papilio | ulysses | Papilio ulysses |
| PTH | Papilio | thoas | Papilio thoas |
| TAG | Thysania | agripina | Thysania agripina |
| PPU | Phyllium | pulchrifolium | Phyllium pulchrifolium |
| XGI | Xylotrupes | gideon | Xylotrupes gideon |
| PBL | Papilio | blumei | Papilio blumei |
| PKA | Papilio | karna | Papilio karna |
| PPA | Papilio | palinurus | Papilio palinurus |
| PRU | Papilio | rumanzovia | Papilio rumanzovia |
| PDE | Polyura | delphis concha | Polyura delphis concha |
| PIM | Pomponia | imperatoria | Pomponia imperatoria |
| ILY | Idea | lynceus | Idea lynceus |
| ALO | Acrocinus | longimanus | Acrocinus longimanus |
| CAT | Chalcosoma | atlas | Chalcosoma atlas |
| DAL | Dorcus | alcides | Dorcus alcides |
| HBU | Heliocopris | bucephalus | Heliocopris bucephalus |
| HDI | Heteropteryx | dilatata | Heteropteryx dilatata |
| HMA | Hexarthrius | mandibularis | Hexarthrius mandibularis |
| OSI | Odonyolabis | siva | Odonyolabis siva |
| PGR | Phryna | grosseitaitai | Phryna grosseitaitai |
| LAD | Lamprima | adolphine | Lamprima adolphine |
| PSA | Prosopocoilus | savagei | Prosopocoilus savagei |

**Note**: `PDE` is the only multi-word species epithet (`delphis concha`) — see §3.3, this affects inventory matching, not UID minting itself.

### 4.4 Schemas you're writing to

```sql
-- Sequence counter (one row per year+prefix combination)
CREATE TABLE uid_sequences (
  year     smallint NOT NULL,
  prefix   text     NOT NULL,
  last_seq int      NOT NULL DEFAULT 0,
  PRIMARY KEY (year, prefix)
);

-- Registry of every minted UID
CREATE TABLE specimen_uids (
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
```

### 4.5 The `next_uid` RPC — call this to get the next sequence number

```sql
next_uid(p_year smallint, p_prefix text) RETURNS int
```

Atomic upsert-and-increment on `uid_sequences`; returns the new `last_seq` value (already incremented). This is the **only** safe way to get a sequence number — do not read-then-write `uid_sequences` yourself, you'll race other concurrent generations.

### 4.6 Flow to build

1. Manager opens "Generate UIDs" and picks a **production batch** from `production_batches` (verify exact columns in your DB, but the mobile app writes/reads at least: `id`, `batch_name`, `species` (single text field, e.g. `"Papilio ulysses"`), `quantity_planned`, `current_stage`, `status`, `order_id`, `created_at`, `updated_at`).
2. Split `production_batches.species` into `genus` + epithet (split on first space — same logic the QC trigger uses, see §7). Map the genus+epithet to a prefix using the table in §4.3 (case-insensitive match; build a reverse lookup from species_display → prefix, or match on genus+species directly — do **not** require the manager to type the prefix manually).
   - If the batch's species string doesn't match any of the 22 known species, fall back to letting the manager pick the species manually from the same list (minor fallback only — batch-pick is the primary flow).
3. Manager enters a quantity N (how many stickers to print for this batch).
4. For each of the N specimens: call `next_uid(p_year, p_prefix)` to get `seq`, compose `uid = ${yy}-${prefix}-${pad(seq,4)}`, then `INSERT` into `specimen_uids`:
   ```js
   {
     uid, year: yy, prefix, seq,
     genus, species, species_display,
     production_batch_id: selectedBatch.id,
     status: 'generated',
     generated_by: currentManagerName,
     generated_at: new Date().toISOString(),
   }
   ```
5. Render a printable label sheet: one QR code + the human-readable UID + species display name per sticker, in a print-friendly CSS grid (or use a QR component like `qrcode.react`, since `xlsx` can produce data exports but not QR images).

### 4.7 Acceptance criteria

- Minting N stickers for a batch creates exactly N rows in `specimen_uids`, with unique sequential `seq` values per (year, prefix), correct `prefix`/`genus`/`species`/`species_display`, `status = 'generated'`, and `production_batch_id` set to the chosen batch.
- Each QR encodes a string containing the UID pattern (`YY-PREFIX-NNNN`), recognized by the mobile scanner regex.
- The label sheet is printable (correct page breaks, readable QR size — test an actual print/PDF render, not just on-screen).

---

## 5. 🟥 FEATURE 2 — Finished Goods Intake Approval Queue (BUILD)

### 5.1 Purpose

When a worker scans a finished-goods UID sticker on mobile (`screens/PackagingBarcodeScanner.js` in the mobile repo), the app calls `submit_finished_goods_intake`, which inserts a **pending** `finished_goods_requests` row and flips the matching `specimen_uids` row to `'requested'`. The mobile app **never writes inventory directly** — a manager must approve on the web for inventory to actually move. You need to build that approval queue.

### 5.2 Schema: `finished_goods_requests`

```sql
CREATE TABLE finished_goods_requests (
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

-- A UID can only have ONE active (non-rejected) request at a time.
-- Rejecting a request frees the UID up for a fresh scan/resubmission.
CREATE UNIQUE INDEX uniq_fg_request_active
  ON finished_goods_requests (uid)
  WHERE status <> 'rejected';
```

### 5.3 The RPC that creates these rows (mobile-side, 🟦 contract — do not change)

```sql
submit_finished_goods_intake(p_uid text, p_worker_id text, p_worker_name text) RETURNS jsonb
```

`SECURITY DEFINER`. Looks up `specimen_uids` by `p_uid`; rejects if unknown (`code: 'unknown'`), already `'received'` (`code: 'received'`), or already has a non-rejected request (`code: 'duplicate'`). On success: inserts the `finished_goods_requests` row with `status = 'pending'`, and updates `specimen_uids` to `status = 'requested'`, `requested_by = p_worker_name`, `requested_at = now()`. Returns `{ ok: true, code: 'submitted', species_display, message }`.

### 5.4 The trigger that fires on YOUR approval (already created by the migration — you just need to flip `status`)

```sql
-- Fires BEFORE UPDATE on finished_goods_requests.
-- When you set status='approved' (and it wasn't already 'approved'):
--   1. Looks up genus/species from specimen_uids (NOT from the request's own
--      species text, which only holds the bare epithet).
--   2. If the specimen_uids row isn't already 'received' (idempotency guard):
--      - UPDATE inventory SET quantity = quantity + 1 WHERE lower(genus)=lower(v_genus)
--        AND (v_species is blank OR lower(species)=lower(v_species))
--      - UPDATE specimen_uids SET status='received', received_at=now()
--   3. Sets NEW.reviewed_at = now() automatically — you don't need to set this yourself.
CREATE TRIGGER trg_apply_finished_goods_request
  BEFORE UPDATE ON finished_goods_requests
  FOR EACH ROW
  EXECUTE FUNCTION apply_finished_goods_request_to_inventory();
```

**You do not write to `inventory` or `specimen_uids` yourself for this flow** — only update `finished_goods_requests.status` (and `reviewed_by`), and the trigger does the rest.

### 5.5 Flow to build

1. **Queue view**: `SELECT * FROM finished_goods_requests WHERE status = 'pending' ORDER BY created_at`. Show `uid`, `species_display`, `worker_name`, `created_at`. Optionally join `specimen_uids` on `uid` for extra context (e.g. `production_batch_id`, `generated_at`).
2. **Approve**: `UPDATE finished_goods_requests SET status = 'approved', reviewed_by = <manager name/id> WHERE id = <row id> AND status = 'pending'`. The `AND status = 'pending'` guard prevents a double-click from re-firing logic on an already-approved row (the trigger itself also guards via `COALESCE(OLD.status,'') <> 'approved'`, but guard at the query level too for a clean UX/no-op).
3. **Reject**: `UPDATE finished_goods_requests SET status = 'rejected', reviewed_by = <manager> WHERE id = <row id> AND status = 'pending'`. This frees the UID (the partial unique index only blocks duplicates while status `<> 'rejected'`), so the worker can re-scan and resubmit.

### 5.6 Acceptance criteria

- Approving a pending request moves the matching `specimen_uids.status` to `'received'`, bumps the matching `inventory.quantity` by exactly 1, sets `received_at`, and the request disappears from the pending queue.
- Rejecting sets `status='rejected'` and the same `uid` can be scanned and submitted again from mobile without hitting the `'duplicate'` error.
- Re-approving an already-approved row (e.g. stale UI state, double click) does not double-count inventory — verify this against the live trigger, don't just trust the guard exists.

---

## 6. 🟧 FEATURE 3 — QC Scan Batch Approval (VERIFY/WIRE)

### 6.1 Purpose

This is the **older, possibly-partially-built** approval flow for routine QC scans (separate from finished-goods intake in Feature 2). Mobile workers scan specimens during 12-stage production (mainly stage 9, "Quality Control"); the AI/YOLO pipeline tags each as pass/flagged; the whole batch goes to `scan_batches` as `pending_approval`. A manager must approve before inventory moves.

### 6.2 Exact payload mobile sends (🟦 contract — `src/services/supabaseService.js`, `submitScanBatch`)

```js
supabase.from('scan_batches').insert({
  species:              batchData.species,
  species_display:      batchData.species_display || batchData.species,
  stage_number:          batchData.stage_number || 9,
  stage_name:            batchData.stage_name || 'Quality Control',
  production_batch_id:   batchData.production_batch_id || null,  // links to the 12-stage batch
  status:                'pending_approval',
  specimens:             batchData.specimens || [],   // JSON array of per-specimen scan results
  total_scanned:         batchData.total_scanned || 0,
  pass_count:            batchData.pass_count || 0,
  flagged_count:         batchData.flagged_count || 0,
  notes:                 batchData.notes || null,
  worker_name:           batchData.worker_name || 'Worker',
})
```

### 6.3 The approval trigger — EXACT counting behavior (read carefully, this answers "does it add per-batch or per-specimen")

```sql
-- ALTER TABLE scan_batches ADD COLUMN IF NOT EXISTS production_batch_id uuid;
-- ALTER TABLE scan_batches ADD COLUMN IF NOT EXISTS inventory_applied boolean DEFAULT false;

CREATE OR REPLACE FUNCTION apply_scan_batch_to_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_genus text; v_species text;
BEGIN
  IF NEW.status = 'approved'
     AND COALESCE(OLD.status, '') <> 'approved'
     AND COALESCE(NEW.inventory_applied, false) = false
     AND COALESCE(NEW.pass_count, 0) > 0
  THEN
    v_genus := split_part(trim(NEW.species), ' ', 1);
    v_species := trim(substring(trim(NEW.species) from position(' ' in trim(NEW.species))));

    UPDATE inventory
       SET quantity = COALESCE(quantity, 0) + NEW.pass_count,   -- adds the WHOLE batch's pass_count in ONE update
           last_updated = now()
     WHERE lower(genus) = lower(v_genus)
       AND (v_species = '' OR lower(species) = lower(v_species));

    NEW.inventory_applied := true;   -- idempotency guard: set on the row being approved
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_scan_batch ON scan_batches;
CREATE TRIGGER trg_apply_scan_batch
  BEFORE UPDATE ON scan_batches
  FOR EACH ROW EXECUTE FUNCTION apply_scan_batch_to_inventory();
```

**Precise answer**: it adds **`NEW.pass_count` (the batch's aggregate pass count) in one single UPDATE** — it is NOT per-individual-specimen-row in the `specimens` JSON; it's the batch-level `pass_count` integer column applied once. The `inventory_applied` boolean on the **same row being approved** is the idempotency guard — flip to `true` in the same `BEFORE UPDATE`, so re-approving the same row a second time is a no-op (the `WHERE inventory_applied=false` condition in the `IF` blocks it). Species matching is the same genus+epithet, case-insensitive logic as Feature 2 — see §3.3 for the seeding requirement.

### 6.4 Web checklist (verify, don't assume)

- [ ] Confirm a pending-QC queue view exists: `SELECT * FROM scan_batches WHERE status = 'pending_approval'`.
- [ ] Confirm "Approve" sets `status = 'approved'` (this is what fires the trigger above) — and nothing else manually touches `inventory` in your approve handler (the trigger does it).
- [ ] Confirm "Reject" sets `status = 'rejected'` and does NOT touch inventory.
- [ ] Confirm the `specimens` JSON column renders sensibly in the UI (per-specimen pass/flag detail, confidence scores if present — inspect a live row's JSON shape since the exact per-specimen keys aren't pinned down in this handoff).
- [ ] Confirm inventory **actually** increments on approve in a real test — don't just trust the trigger exists; run it against a test batch and check `inventory.quantity` before/after.
- [ ] Apply the §3.4 recommendation: add `created_at timestamptz DEFAULT now()` to `scan_batches` if your queue view needs reliable ordering and isn't already handling the "column may not exist" case the mobile app had to work around.

---

## 7. 🟧 FEATURE 4 — Shared tables & contracts (VERIFY)

Brief contract + verify line for each. These tables were largely created directly in the Supabase dashboard (not all are in repo migration files), so column lists below are only what's confirmed by mobile code actually reading/writing them — **verify the full column list in your DB directly**.

### 7.1 `production_batches` — 12-stage lifecycle

Confirmed columns (from mobile inserts/selects): `id`, `batch_name`, `species` (single text field, e.g. `"Papilio ulysses"` — not split into genus/species columns), `current_stage` (1–12 integer), `status` (`'in_progress'` / `'completed'`), `quantity_planned`, `order_id` (nullable FK → `orders.id`), `created_at`, `updated_at`.

This is what the UID Generator (Feature 1) reads from to derive species. **Verify**: confirm these columns exist as named: a typo here breaks the generator's batch picker.

### 7.2 `stage_logs` — worker notes per production stage

Confirmed columns: `id`, `batch_id` (FK → `production_batches.id` — **note: keyed as `batch_id`, not `production_batch_id`**), `stage_number`, `stage_name`, `log_text`, `worker_name`, `logged_at` (used for ordering). Mobile reads/writes via plain CRUD (no RPC). A manager dashboard may want to display per-batch stage history by querying `stage_logs WHERE batch_id = <id> ORDER BY logged_at`.

**Verify**: confirm `logged_at` exists (mobile orders by it) — if your dashboard adds a UI for this, use the same column.

### 7.3 `orders` — drives production (🟦 contract, from `supabase/migrations/001_orders.sql`)

```sql
CREATE TABLE orders (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number   text NOT NULL UNIQUE,
  client_name    text NOT NULL DEFAULT 'Bits and Bugs',
  species        text NOT NULL,
  quantity       integer NOT NULL DEFAULT 1,
  notes          text,
  status         text NOT NULL DEFAULT 'pending',  -- pending | in_progress | completed | cancelled
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()          -- auto-updated via trigger on UPDATE
);

-- production_batches links back to orders:
ALTER TABLE production_batches
  ADD COLUMN order_id          uuid REFERENCES orders(id),
  ADD COLUMN quantity_planned  integer DEFAULT 0;
```

Mobile reads via `fetchOrders()` / `fetchOrderById()`, which both join `production_batches(id, batch_name, current_stage, status, quantity_planned, created_at)`. If your dashboard creates/edits orders, keep the `status` enum exactly as the 4 values above — mobile UI branches on these strings.

### 7.4 `workers` + auth RPCs (🟦 contract — do not change signatures)

```sql
login_worker(p_employee_id text, p_pin text) RETURNS TABLE(...)
  -- returns rows shaped like { id, name, employee_id, role } (mobile takes data[0])
  -- PIN validated server-side; PIN never exposed to the client.

claim_worker_session(p_worker_id uuid) RETURNS uuid   -- SECURITY DEFINER
  -- generates a new active_session_token (uuid), stores it on workers.active_session_token,
  -- returns it. Called right after login to claim this device as "the" active session.

is_session_active(p_worker_id uuid, p_token uuid) RETURNS boolean   -- SECURITY DEFINER
  -- true iff p_token still matches workers.active_session_token.
  -- Mobile polls this every ~30s; a newer login elsewhere invalidates older devices.
```

`workers` table has at least: `id`, `name`, `employee_id`, `role`, `push_token` (nullable, set via `savePushToken`), `active_session_token` (uuid, nullable, added by `single_session_migration.sql`).

**Verify**: if your dashboard has any worker management UI (create/deactivate workers, reset PINs), confirm it doesn't bypass or conflict with `active_session_token` semantics — don't null it out or rotate it outside of `claim_worker_session`, or you'll spuriously log out an active mobile session.

### 7.5 Alerts (verify schema — not fully known)

Mobile reads/writes an `alerts` table: confirmed columns from mobile queries are `id`, `title`, `message`, `type`, `severity`, `created_at`, `is_read`. Used for manager→worker notifications (mobile only marks `is_read = true`; it doesn't create alerts). **Verify the full schema and write-path in your DB** — this handoff cannot confirm columns beyond what mobile's `fetchStaffAlerts`/`dismissStaffAlert` touch.

**Idea for later** (not required now): `workers.push_token` exists and is already being saved by the mobile app. A natural extension is having the web dashboard send a push notification to the worker when their finished-goods intake or QC batch is approved/rejected — flag this as a nice-to-have, not part of this handoff's required scope.

---

## 8. 🟦 DO-NOT-BREAK contracts — quick reference

**Status enums** (exact strings, case-sensitive):

| Table | Column | Allowed values |
|---|---|---|
| `scan_batches` | `status` | `pending_approval`, `approved`, `rejected` |
| `finished_goods_requests` | `status` | `pending`, `approved`, `rejected` |
| `specimen_uids` | `status` | `generated`, `requested`, `received` |
| `orders` | `status` | `pending`, `in_progress`, `completed`, `cancelled` |
| `production_batches` | `status` | `in_progress`, `completed` |

**SECURITY DEFINER RPCs the mobile app calls directly — do not change their name, parameter names/order/types, or return shape:**

- `submit_finished_goods_intake(p_uid text, p_worker_id text, p_worker_name text) → jsonb`
- `next_uid(p_year smallint, p_prefix text) → int` (you, the web, are the primary caller of this one — but it's defined as a shared contract per the migration's own comment)
- `login_worker(p_employee_id text, p_pin text) → table(...)`
- `claim_worker_session(p_worker_id uuid) → uuid`
- `is_session_active(p_worker_id uuid, p_token uuid) → boolean`

**Triggers — do not disable or bypass; let them be the only inventory writer for their respective flow:**

- `trg_apply_scan_batch` on `scan_batches` (BEFORE UPDATE)
- `trg_apply_finished_goods_request` on `finished_goods_requests` (BEFORE UPDATE)

**Column name gotchas:**

- `stage_logs.batch_id` — not `production_batch_id` (that name is used on `scan_batches` and `specimen_uids` instead).
- `scan_batches` has no guaranteed `created_at` (see §3.4).

---

## 9. End-to-end acceptance test

Run this full loop manually once both halves are wired, to confirm the integration actually works (not just each half in isolation):

1. **Create an order** (web or mobile) — e.g. species `"Papilio ulysses"`, quantity 10.
2. **Create a production batch** linked to that order (mobile, or web if you have batch creation) — confirm `production_batches.order_id` is set and `current_stage = 1`.
3. **Advance the batch through QC (stage 9)**: on mobile, run a QC scan that produces a `scan_batches` row with `status='pending_approval'`, some `pass_count > 0`.
4. **Web: approve the QC batch.** Confirm: `scan_batches.status='approved'`, `inventory_applied=true`, and the matching `inventory.quantity` row for `Papilio`/`ulysses` increased by exactly `pass_count`.
5. **Web: mint Finished Goods UID stickers** for that same production batch (Feature 1) — generate, say, 5 stickers. Confirm 5 new `specimen_uids` rows, status `'generated'`, sequential `seq`, `production_batch_id` set, prefix `PUL`.
6. **Print the label sheet** — confirm QR renders and the UID text is legible.
7. **Mobile: scan one of the printed UID stickers** in the packaging screen and submit intake. Confirm: a new `finished_goods_requests` row with `status='pending'`, and the matching `specimen_uids` row flips to `'requested'`.
8. **Web: approve that intake request** (Feature 2). Confirm: `finished_goods_requests.status='approved'`, `specimen_uids.status='received'`, and `inventory.quantity` for `Papilio`/`ulysses` increased by exactly 1 more (on top of step 4's increase).
9. **Sanity check**: attempt to scan the SAME UID sticker again on mobile — confirm it now returns `code: 'received'` ("already counted") rather than allowing a second submission.
10. **Sanity check rejection path**: mint one more UID, scan it, then **reject** the request on web instead of approving. Confirm `specimen_uids` stays at `'requested'` (not bumped to `'received'`, no inventory change), and that scanning the same UID again on mobile now succeeds in creating a fresh `'pending'` request (the rejection freed it via the partial unique index).

If all 10 steps behave as described, the mobile ↔ web integration is sound end to end.

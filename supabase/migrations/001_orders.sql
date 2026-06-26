-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Orders table (one per B&B purchase order)
CREATE TABLE IF NOT EXISTS orders (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number   text NOT NULL UNIQUE,
  client_name    text NOT NULL DEFAULT 'Bits and Bugs',
  species        text NOT NULL,
  quantity       integer NOT NULL DEFAULT 1,
  notes          text,
  status         text NOT NULL DEFAULT 'pending',
    -- pending | in_progress | completed | cancelled
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- 2. Link production batches → orders
ALTER TABLE production_batches
  ADD COLUMN IF NOT EXISTS order_id          uuid REFERENCES orders(id),
  ADD COLUMN IF NOT EXISTS quantity_planned  integer DEFAULT 0;

-- 3. Index for fast batch lookups by order
CREATE INDEX IF NOT EXISTS idx_production_batches_order_id
  ON production_batches(order_id);

-- 4. Auto-update updated_at on orders
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_orders_updated_at();

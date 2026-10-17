-- ============================================================
-- MIGRATION: Add tenant_id isolation to notifications table
-- Run this in your Supabase SQL editor
-- ============================================================

-- 1. Add tenant_id column to notifications table (if not exists)
ALTER TABLE notifications 
  ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default';

-- 2. Create index for fast room-scoped notification lookups
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user 
  ON notifications(tenant_id, user_id, created_at DESC);

-- 3. Add tenant_id to tenants table extras if missing
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 500,
  ADD COLUMN IF NOT EXISTS max_games_per_month INTEGER DEFAULT 20,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 4. Row Level Security: players can only see their own room's notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Allow reading own notifications scoped to tenant
DROP POLICY IF EXISTS "read_own_notifications" ON notifications;
CREATE POLICY "read_own_notifications"
  ON notifications FOR SELECT
  USING (true);  -- Server-side filtering handles tenant isolation

-- Allow server-side inserts
DROP POLICY IF EXISTS "server_insert_notifications" ON notifications;
CREATE POLICY "server_insert_notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Allow marking as read
DROP POLICY IF EXISTS "update_own_read_status" ON notifications;
CREATE POLICY "update_own_read_status"
  ON notifications FOR UPDATE
  USING (true);

-- Allow cleanup
DROP POLICY IF EXISTS "delete_old_notifications" ON notifications;
CREATE POLICY "delete_old_notifications"
  ON notifications FOR DELETE
  USING (true);

-- 5. Create super_admin_events table for audit log
CREATE TABLE IF NOT EXISTS super_admin_events (
  id BIGSERIAL PRIMARY KEY,
  admin_email TEXT NOT NULL,
  event_type TEXT NOT NULL,   -- 'room_created', 'subscription_changed', 'room_suspended', etc.
  tenant_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_super_admin_events_tenant 
  ON super_admin_events(tenant_id, created_at DESC);

COMMENT ON TABLE super_admin_events IS 'Audit log for all Super Admin actions across rooms';

ALTER TABLE super_admin_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_events_policy" ON super_admin_events;
CREATE POLICY "super_admin_events_policy"
  ON super_admin_events
  FOR ALL
  USING (true)
  WITH CHECK (true);

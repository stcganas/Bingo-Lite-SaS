-- ==============================================================================
-- CORRECCIÓN CRÍTICA: BILLETERAS, COMPROBANTES Y RLS STORAGE
-- Bingo Lite SaaS Multi-Tenant
-- Fecha: 2026-10-20
--
-- Problemas que corrige:
-- 1. "new row violates row-level security policy" al subir comprobantes
-- 2. Recargas manuales visualmente desaparecen (tenant_id incorrecto en wallets)
-- 3. Billeteras no sincronizadas entre el admin y el jugador
-- 4. Falta de columna tenant_id en wallets y wallet_transactions si no existe
--
-- INSTRUCCIONES: Ejecutar COMPLETO en Supabase SQL Editor (Project Settings > SQL Editor)
-- Este script es IDEMPOTENTE: seguro de ejecutar múltiples veces.
-- ==============================================================================

-- ============================================================
-- PARTE 1: ASEGURAR BUCKETS DE STORAGE CON CONFIGURACIÓN PÚBLICA
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('banners', 'banners', true, 5242880)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880;

-- ============================================================
-- PARTE 2: POLÍTICAS DE STORAGE PARA EL BUCKET 'receipts'
-- ============================================================

DROP POLICY IF EXISTS "Service role full access receipts" ON storage.objects;
DROP POLICY IF EXISTS "Backend upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Backend delete receipts" ON storage.objects;
DROP POLICY IF EXISTS "Public read receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Receipts service role policy" ON storage.objects;

CREATE POLICY "Service role full access receipts"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'receipts')
WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "Public read receipts"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'receipts');

CREATE POLICY "Authenticated upload receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'receipts');

-- ============================================================
-- PARTE 3: POLÍTICAS DE STORAGE PARA EL BUCKET 'banners'
-- ============================================================

DROP POLICY IF EXISTS "Service role full access banners" ON storage.objects;
DROP POLICY IF EXISTS "Public read banners" ON storage.objects;

CREATE POLICY "Service role full access banners"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'banners')
WITH CHECK (bucket_id = 'banners');

CREATE POLICY "Public read banners"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'banners');

-- ============================================================
-- PARTE 4: ASEGURAR COLUMNA tenant_id EN TABLA wallets
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'wallets'
      AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE public.wallets ADD COLUMN tenant_id TEXT DEFAULT 'default';
    RAISE NOTICE 'Columna tenant_id agregada a wallets';
  ELSE
    RAISE NOTICE 'Columna tenant_id ya existe en wallets';
  END IF;
END $$;

-- ============================================================
-- PARTE 5: ASEGURAR COLUMNA tenant_id EN TABLA wallet_transactions
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'wallet_transactions'
      AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE public.wallet_transactions ADD COLUMN tenant_id TEXT DEFAULT 'default';
    RAISE NOTICE 'Columna tenant_id agregada a wallet_transactions';
  ELSE
    RAISE NOTICE 'Columna tenant_id ya existe en wallet_transactions';
  END IF;
END $$;

-- ============================================================
-- PARTE 6: ÍNDICES PARA RENDIMIENTO EN CONSULTAS MULTI-TENANT
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_wallets_phone_tenant ON public.wallets (phone, tenant_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_phone_tenant ON public.wallet_transactions (player_phone, tenant_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_tenant ON public.wallet_transactions (tenant_id);

-- ============================================================
-- PARTE 7: POLÍTICAS RLS PARA TODAS LAS TABLAS CRÍTICAS
-- ============================================================

DROP POLICY IF EXISTS "Backend full access players" ON public.players;
CREATE POLICY "Backend full access players"
ON public.players FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access wallets" ON public.wallets;
CREATE POLICY "Backend full access wallets"
ON public.wallets FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access wallet_transactions" ON public.wallet_transactions;
CREATE POLICY "Backend full access wallet_transactions"
ON public.wallet_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access settings" ON public.settings;
CREATE POLICY "Backend full access settings"
ON public.settings FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access notifications" ON public.notifications;
CREATE POLICY "Backend full access notifications"
ON public.notifications FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access game" ON public.game;
CREATE POLICY "Backend full access game"
ON public.game FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access cards" ON public.cards;
CREATE POLICY "Backend full access cards"
ON public.cards FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access wallet_activations" ON public.wallet_activations;
CREATE POLICY "Backend full access wallet_activations"
ON public.wallet_activations FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access sellers" ON public.sellers;
CREATE POLICY "Backend full access sellers"
ON public.sellers FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access tenants" ON public.tenants;
CREATE POLICY "Backend full access tenants"
ON public.tenants FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access bingo_claims" ON public.bingo_claims;
CREATE POLICY "Backend full access bingo_claims"
ON public.bingo_claims FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access patterns" ON public.patterns;
CREATE POLICY "Backend full access patterns"
ON public.patterns FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access game_patterns" ON public.game_patterns;
CREATE POLICY "Backend full access game_patterns"
ON public.game_patterns FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Tablas opcionales (solo si existen)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='receipts') THEN
    DROP POLICY IF EXISTS "Backend full access receipts table" ON public.receipts;
    CREATE POLICY "Backend full access receipts table" ON public.receipts FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='gift_invitations') THEN
    DROP POLICY IF EXISTS "Backend full access gift_invitations" ON public.gift_invitations;
    CREATE POLICY "Backend full access gift_invitations" ON public.gift_invitations FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='admin_sessions') THEN
    DROP POLICY IF EXISTS "Backend full access admin_sessions" ON public.admin_sessions;
    CREATE POLICY "Backend full access admin_sessions" ON public.admin_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='super_admin_events') THEN
    DROP POLICY IF EXISTS "Backend full access super_admin_events" ON public.super_admin_events;
    CREATE POLICY "Backend full access super_admin_events" ON public.super_admin_events FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='free_game_prizes') THEN
    DROP POLICY IF EXISTS "Backend full access free_game_prizes" ON public.free_game_prizes;
    CREATE POLICY "Backend full access free_game_prizes" ON public.free_game_prizes FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='player_paid_game_participations') THEN
    DROP POLICY IF EXISTS "Backend full access player_paid_game_participations" ON public.player_paid_game_participations;
    CREATE POLICY "Backend full access player_paid_game_participations" ON public.player_paid_game_participations FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ai_presets') THEN
    DROP POLICY IF EXISTS "Backend full access ai_presets" ON public.ai_presets;
    CREATE POLICY "Backend full access ai_presets" ON public.ai_presets FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='lottery_numbers_in_play') THEN
    DROP POLICY IF EXISTS "Backend full access lottery_numbers_in_play" ON public.lottery_numbers_in_play;
    CREATE POLICY "Backend full access lottery_numbers_in_play" ON public.lottery_numbers_in_play FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- PARTE 8: FORZAR REFRESH DEL SCHEMA EN POSTGREST
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFICACIÓN FINAL - Ver resultados de buckets y columnas
-- ============================================================
SELECT
  'BUCKET' as tipo,
  name as nombre,
  public::text as detalle
FROM storage.buckets
WHERE id IN ('receipts', 'banners')
UNION ALL
SELECT
  'WALLETS_TENANT_COL' as tipo,
  column_name as nombre,
  data_type as detalle
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('wallets', 'wallet_transactions')
  AND column_name = 'tenant_id';

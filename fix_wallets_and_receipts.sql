-- ==============================================================================
-- CORRECCIÓN CRÍTICA DEFINITIVA: BILLETERAS, COMPROBANTES Y RLS STORAGE (V2)
-- Bingo Lite SaaS Multi-Tenant
-- Fecha de actualización: 2026-10-20
--
-- Problemas que corrige:
-- 1. "new row violates row-level security policy" / error 415 MIME-type en storage
-- 2. Eliminación de restricciones rígidas de formato en bucket receipts (permite HEIC, WEBP, PNG, JPG, PDF)
-- 3. Aumento del límite de comprobantes a 15MB
-- 4. Asegura columnas tenant_id y updated_at en tabla wallets
-- 5. Asegura columna tenant_id en tabla wallet_transactions
-- 6. Índices multi-tenant para balance y consultas en vivo
-- 7. Políticas de escritura Backend (service_role) para todas las tablas del sistema
--
-- INSTRUCCIONES: Ejecutar COMPLETO en Supabase SQL Editor (SQL Editor > New Query > Run)
-- Este script es IDEMPOTENTE: seguro de ejecutar múltiples veces sin afectar datos existentes.
-- ==============================================================================

-- ============================================================
-- PARTE 1: CONFIGURACIÓN ROBUSTA DE BUCKETS DE STORAGE
-- ============================================================

-- Bucket 'receipts': público, 15MB, sin bloqueo de MIME types móviles
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  true,
  15728640,
  NULL -- NULL permite cualquier tipo de imagen/documento (evita rechazos por image/heic, pjpeg, etc.)
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 15728640,
  allowed_mime_types = NULL;

-- Bucket 'banners': público, 10MB
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'banners',
  'banners',
  true,
  10485760,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = NULL;

-- ============================================================
-- PARTE 2: POLÍTICAS DE STORAGE PARA 'receipts' Y 'banners'
-- ============================================================

DROP POLICY IF EXISTS "Service role full access receipts" ON storage.objects;
DROP POLICY IF EXISTS "Backend upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Backend delete receipts" ON storage.objects;
DROP POLICY IF EXISTS "Public read receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Receipts service role policy" ON storage.objects;
DROP POLICY IF EXISTS "Anon upload receipts" ON storage.objects;

-- Acceso total e irrestricto para service_role (Backend Node.js)
CREATE POLICY "Service role full access receipts"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'receipts')
WITH CHECK (bucket_id = 'receipts');

-- Lectura pública para que organizadores y jugadores puedan ver los comprobantes
CREATE POLICY "Public read receipts"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'receipts');

-- Políticas para banners
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
-- PARTE 3: COLUMNAS tenant_id Y updated_at EN TABLA wallets
-- ============================================================

DO $$
BEGIN
  -- Columna tenant_id
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

  -- Columna updated_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'wallets'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.wallets ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    RAISE NOTICE 'Columna updated_at agregada a wallets';
  ELSE
    RAISE NOTICE 'Columna updated_at ya existe en wallets';
  END IF;

  -- Clave primaria compuesta (phone, tenant_id) para soporte multi-tenant total
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'wallets' 
      AND tc.constraint_type = 'PRIMARY KEY'
      AND kcu.column_name = 'phone'
      AND (
        SELECT count(*) FROM information_schema.key_column_usage k2 
        WHERE k2.constraint_name = tc.constraint_name
      ) = 1
  ) THEN
    ALTER TABLE public.wallets DROP CONSTRAINT IF EXISTS wallets_pkey;
    ALTER TABLE public.wallets ADD CONSTRAINT wallets_pkey PRIMARY KEY (phone, tenant_id);
    RAISE NOTICE 'Clave primaria de wallets migrada a compuesta (phone, tenant_id)';
  END IF;
END $$;

-- ============================================================
-- PARTE 4: COLUMNA tenant_id EN TABLA wallet_transactions
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
-- PARTE 5: ÍNDICES DE RENDIMIENTO MULTI-TENANT
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_wallets_phone_tenant ON public.wallets (phone, tenant_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_phone_tenant ON public.wallet_transactions (player_phone, tenant_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_tenant ON public.wallet_transactions (tenant_id);

-- ============================================================
-- PARTE 6: POLÍTICAS RLS PARA ACCESO BACKEND (service_role)
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

-- Tablas complementarias (si existen)
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
-- PARTE 7: RECARGAR SCHEMA EN POSTGREST
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFICACIÓN FINAL
-- ============================================================
SELECT
  'BUCKET' as tipo,
  name as nombre,
  concat('Público: ', public, ' | Límite: ', round(file_size_limit / 1048576), 'MB | Tipos: ', coalesce(array_to_string(allowed_mime_types, ','), 'TODOS (Sin restricción)')) as detalle
FROM storage.buckets
WHERE id IN ('receipts', 'banners')
UNION ALL
SELECT
  'COLUMNA' as tipo,
  concat(table_name, '.', column_name) as nombre,
  data_type as detalle
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'wallets' AND column_name IN ('tenant_id', 'updated_at'))
    OR (table_name = 'wallet_transactions' AND column_name = 'tenant_id')
  );

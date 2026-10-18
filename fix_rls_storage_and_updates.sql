-- ==============================================================================
-- CORRECCION CRITICA RLS: STORAGE, PLAYERS UPDATE Y SETTINGS
-- Bingo Lite SaaS Multi-Tenant
-- Fecha: 2026-10-18
--
-- Problemas que corrige:
-- 1. Error "new row violates row-level security policy" al subir comprobantes
-- 2. Edicion de usuarios (UPDATE en players) falla desde el backend Node.js
-- 3. La tabla settings no tiene politica de escritura para service_role
--
-- Este script es IDEMPOTENTE: seguro de ejecutar multiples veces.
-- ==============================================================================

-- PARTE 1: STORAGE - Politicas del bucket 'receipts'
DROP POLICY IF EXISTS "Service role full access receipts" ON storage.objects;
DROP POLICY IF EXISTS "Backend upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Backend delete receipts" ON storage.objects;
DROP POLICY IF EXISTS "Public read receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload receipts" ON storage.objects;

CREATE POLICY "Service role full access receipts"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'receipts') WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "Public read receipts"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'receipts');

CREATE POLICY "Authenticated upload receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'receipts');

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('receipts', 'receipts', true, 10485760)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 10485760;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('banners', 'banners', true, 5242880)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880;

-- PARTE 2: PLAYERS - Escritura para service_role
DROP POLICY IF EXISTS "Backend full access players" ON public.players;
DROP POLICY IF EXISTS "Service role write players" ON public.players;
DROP POLICY IF EXISTS "Backend update players" ON public.players;
DROP POLICY IF EXISTS "Backend insert players" ON public.players;
DROP POLICY IF EXISTS "Backend delete players" ON public.players;

CREATE POLICY "Backend full access players"
ON public.players FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PARTE 3: WALLETS
DROP POLICY IF EXISTS "Backend full access wallets" ON public.wallets;
CREATE POLICY "Backend full access wallets"
ON public.wallets FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PARTE 4: WALLET_TRANSACTIONS
DROP POLICY IF EXISTS "Backend full access wallet_transactions" ON public.wallet_transactions;
CREATE POLICY "Backend full access wallet_transactions"
ON public.wallet_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PARTE 5: SETTINGS
DROP POLICY IF EXISTS "Backend full access settings" ON public.settings;
CREATE POLICY "Backend full access settings"
ON public.settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PARTE 6: RECEIPTS TABLE
DROP POLICY IF EXISTS "Backend full access receipts table" ON public.receipts;
CREATE POLICY "Backend full access receipts table"
ON public.receipts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PARTE 7: NOTIFICATIONS
DROP POLICY IF EXISTS "Backend full access notifications" ON public.notifications;
CREATE POLICY "Backend full access notifications"
ON public.notifications FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PARTE 8: GAME
DROP POLICY IF EXISTS "Backend full access game" ON public.game;
CREATE POLICY "Backend full access game"
ON public.game FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PARTE 9: CARDS
DROP POLICY IF EXISTS "Backend full access cards" ON public.cards;
CREATE POLICY "Backend full access cards"
ON public.cards FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PARTE 10: WALLET_ACTIVATIONS
DROP POLICY IF EXISTS "Backend full access wallet_activations" ON public.wallet_activations;
CREATE POLICY "Backend full access wallet_activations"
ON public.wallet_activations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PARTE 11: SELLERS
DROP POLICY IF EXISTS "Backend full access sellers" ON public.sellers;
CREATE POLICY "Backend full access sellers"
ON public.sellers FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PARTE 12: TENANTS
DROP POLICY IF EXISTS "Backend full access tenants" ON public.tenants;
CREATE POLICY "Backend full access tenants"
ON public.tenants FOR ALL TO service_role USING (true) WITH CHECK (true);

-- PARTE 13: OTRAS TABLAS CRITICAS
DROP POLICY IF EXISTS "Backend full access bingo_claims" ON public.bingo_claims;
CREATE POLICY "Backend full access bingo_claims"
ON public.bingo_claims FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access gift_invitations" ON public.gift_invitations;
CREATE POLICY "Backend full access gift_invitations"
ON public.gift_invitations FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access patterns" ON public.patterns;
CREATE POLICY "Backend full access patterns"
ON public.patterns FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access game_patterns" ON public.game_patterns;
CREATE POLICY "Backend full access game_patterns"
ON public.game_patterns FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access admin_sessions" ON public.admin_sessions;
CREATE POLICY "Backend full access admin_sessions"
ON public.admin_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access super_admin_events" ON public.super_admin_events;
CREATE POLICY "Backend full access super_admin_events"
ON public.super_admin_events FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access free_game_prizes" ON public.free_game_prizes;
CREATE POLICY "Backend full access free_game_prizes"
ON public.free_game_prizes FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access player_paid_game_participations" ON public.player_paid_game_participations;
CREATE POLICY "Backend full access player_paid_game_participations"
ON public.player_paid_game_participations FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access ai_presets" ON public.ai_presets;
CREATE POLICY "Backend full access ai_presets"
ON public.ai_presets FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access lottery_numbers_in_play" ON public.lottery_numbers_in_play;
CREATE POLICY "Backend full access lottery_numbers_in_play"
ON public.lottery_numbers_in_play FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- MIGRACIÓN DE SEGURIDAD RLS Y BLINDAJE ZERO-TRUST: BINGO LITE SAAS
-- Corrige vulnerabilidades de políticas RLS abiertas (USING true para escritura)
-- y protege datos sensibles y credenciales contra consultas anónimas en Supabase.
--
-- Instrucciones:
-- Ejecuta este script en el Editor SQL de tu panel de Supabase (https://supabase.com).
-- ==============================================================================

-- 1. ASEGURAR QUE RLS ESTÉ HABILITADO EN TODAS LAS 21 TABLAS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bingo_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lottery_numbers_in_play ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admin_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_game_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_paid_game_participations ENABLE ROW LEVEL SECURITY;

-- 2. ELIMINAR POLÍTICAS INSEGURAS O PREVIAS
DROP POLICY IF EXISTS "Allow all access to game" ON public.game;
DROP POLICY IF EXISTS "Allow backend all on game" ON public.game;
DROP POLICY IF EXISTS "Public read game" ON public.game;

DROP POLICY IF EXISTS "Allow all access to patterns" ON public.patterns;
DROP POLICY IF EXISTS "Allow backend all on patterns" ON public.patterns;
DROP POLICY IF EXISTS "Public read patterns" ON public.patterns;

DROP POLICY IF EXISTS "Allow all access to game_patterns" ON public.game_patterns;
DROP POLICY IF EXISTS "Allow backend all on game_patterns" ON public.game_patterns;
DROP POLICY IF EXISTS "Public read game_patterns" ON public.game_patterns;

DROP POLICY IF EXISTS "Allow all access to players" ON public.players;
DROP POLICY IF EXISTS "Allow backend all on players" ON public.players;
DROP POLICY IF EXISTS "Public read players safe" ON public.players;
DROP POLICY IF EXISTS "Public read players" ON public.players;

DROP POLICY IF EXISTS "Allow all access to cards" ON public.cards;
DROP POLICY IF EXISTS "Allow backend all on cards" ON public.cards;
DROP POLICY IF EXISTS "Public read cards" ON public.cards;

DROP POLICY IF EXISTS "Allow all access to settings" ON public.settings;
DROP POLICY IF EXISTS "Allow backend all on settings" ON public.settings;
DROP POLICY IF EXISTS "Public read settings" ON public.settings;

DROP POLICY IF EXISTS "Allow all access to wallets" ON public.wallets;
DROP POLICY IF EXISTS "Allow backend all on wallets" ON public.wallets;

DROP POLICY IF EXISTS "Allow all access to wallet_transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Allow backend all on wallet_transactions" ON public.wallet_transactions;

DROP POLICY IF EXISTS "Allow all access to wallet_activations" ON public.wallet_activations;

DROP POLICY IF EXISTS "Allow all access to sellers" ON public.sellers;
DROP POLICY IF EXISTS "Allow backend all on sellers" ON public.sellers;
DROP POLICY IF EXISTS "Public read sellers" ON public.sellers;

DROP POLICY IF EXISTS "Allow all access to notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow backend all on notifications" ON public.notifications;
DROP POLICY IF EXISTS "Public read notifications" ON public.notifications;

DROP POLICY IF EXISTS "Allow all access to gift_invitations" ON public.gift_invitations;
DROP POLICY IF EXISTS "Public read gift_invitations" ON public.gift_invitations;

DROP POLICY IF EXISTS "Allow backend all on tenants" ON public.tenants;
DROP POLICY IF EXISTS "Public read tenants safe" ON public.tenants;
DROP POLICY IF EXISTS "Public read tenants" ON public.tenants;

DROP POLICY IF EXISTS "Allow backend all on receipts" ON public.receipts;
DROP POLICY IF EXISTS "Allow backend all on bingo_claims" ON public.bingo_claims;
DROP POLICY IF EXISTS "Allow backend all on ai_presets" ON public.ai_presets;
DROP POLICY IF EXISTS "Allow backend all on admin_sessions" ON public.admin_sessions;
DROP POLICY IF EXISTS "Allow backend all on super_admin_events" ON public.super_admin_events;
DROP POLICY IF EXISTS "Allow backend all on free_game_prizes" ON public.free_game_prizes;
DROP POLICY IF EXISTS "Public read free_game_prizes" ON public.free_game_prizes;
DROP POLICY IF EXISTS "Allow backend all on player_paid_game_participations" ON public.player_paid_game_participations;

-- 3. SALAS (tenants): Lectura pública de temas y metadatos
DROP POLICY IF EXISTS "Public read tenants safe" ON public.tenants;
CREATE POLICY "Public read tenants safe" ON public.tenants 
    FOR SELECT TO anon, authenticated 
    USING (true);

-- 4. JUEGO (game): Lectura pública para espectadores y jugadores en vivo
DROP POLICY IF EXISTS "Public read game" ON public.game;
CREATE POLICY "Public read game" ON public.game
    FOR SELECT TO anon, authenticated
    USING (true);

-- 5. PATRONES (patterns & game_patterns): Lectura de figuras activas
DROP POLICY IF EXISTS "Public read patterns" ON public.patterns;
CREATE POLICY "Public read patterns" ON public.patterns
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Public read game_patterns" ON public.game_patterns;
CREATE POLICY "Public read game_patterns" ON public.game_patterns
    FOR SELECT TO anon, authenticated
    USING (true);

-- 6. CARTONES (cards): Lectura pública de cartones asignados
DROP POLICY IF EXISTS "Public read cards" ON public.cards;
CREATE POLICY "Public read cards" ON public.cards
    FOR SELECT TO anon, authenticated
    USING (true);

-- 7. AJUSTES (settings): Lectura pública de personalizaciones visuales
DROP POLICY IF EXISTS "Public read settings" ON public.settings;
CREATE POLICY "Public read settings" ON public.settings
    FOR SELECT TO anon, authenticated
    USING (true);

-- 8. JUGADORES (players): Lectura pública de existencia
DROP POLICY IF EXISTS "Public read players safe" ON public.players;
CREATE POLICY "Public read players safe" ON public.players
    FOR SELECT TO anon, authenticated
    USING (true);

-- 9. VENDEDORES (sellers): Lectura para validación en registro
DROP POLICY IF EXISTS "Public read sellers" ON public.sellers;
CREATE POLICY "Public read sellers" ON public.sellers
    FOR SELECT TO anon, authenticated
    USING (true);

-- 10. PREMIOS Y REGALOS: Lectura pública
DROP POLICY IF EXISTS "Public read gift_invitations" ON public.gift_invitations;
CREATE POLICY "Public read gift_invitations" ON public.gift_invitations
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Public read free_game_prizes" ON public.free_game_prizes;
CREATE POLICY "Public read free_game_prizes" ON public.free_game_prizes
    FOR SELECT TO anon, authenticated
    USING (true);

-- 11. TABLAS FINANCIERAS Y DE SESIONES (wallets, wallet_transactions, receipts, claims, sessions):
-- ZERO ACCESS directo para clientes anónimos y authenticated.
-- Todas las operaciones monetarias se realizan exclusivamente a través de los endpoints
-- protegidos de Node.js (server.ts) que utilizan la SUPABASE_SERVICE_ROLE_KEY.

-- 12. Notificar recarga de caché de schema en Supabase PostgREST
NOTIFY pgrst, 'reload schema';

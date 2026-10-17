-- ==============================================================================
-- MIGRACIÓN DE SEGURIDAD RLS: BINGO LITE
-- Este script corrige las políticas RLS abiertas (USING true para escritura)
-- y protege la base de datos de accesos no autorizados mediante la anon_key.
--
-- Ejecuta este script en el Editor SQL de tu panel de Supabase.
-- ==============================================================================

-- 1. ASEGURAR QUE RLS ESTÉ HABILITADO EN TODAS LAS TABLAS
ALTER TABLE public.game ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_invitations ENABLE ROW LEVEL SECURITY;

-- 2. ELIMINAR POLÍTICAS INSEGURAS ANTERIORES
DROP POLICY IF EXISTS "Allow all access to game" ON public.game;
DROP POLICY IF EXISTS "Allow all access to patterns" ON public.patterns;
DROP POLICY IF EXISTS "Allow all access to game_patterns" ON public.game_patterns;
DROP POLICY IF EXISTS "Allow all access to players" ON public.players;
DROP POLICY IF EXISTS "Allow all access to cards" ON public.cards;
DROP POLICY IF EXISTS "Allow all access to settings" ON public.settings;
DROP POLICY IF EXISTS "Allow all access to wallets" ON public.wallets;
DROP POLICY IF EXISTS "Allow all access to wallet_transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Allow all access to wallet_activations" ON public.wallet_activations;
DROP POLICY IF EXISTS "Allow all access to sellers" ON public.sellers;
DROP POLICY IF EXISTS "Allow all access to notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow all access to gift_invitations" ON public.gift_invitations;

-- 3. POLÍTICAS BLINDADAS PARA EL JUEGO (GAME)
-- Lectura pública para jugadores y espectadores
CREATE POLICY "Public read game" ON public.game
    FOR SELECT USING (true);

-- 4. POLÍTICAS PARA PATRONES (PATTERNS & GAME_PATTERNS)
-- Lectura pública para saber qué figuras están en juego
CREATE POLICY "Public read patterns" ON public.patterns
    FOR SELECT USING (true);

CREATE POLICY "Public read game_patterns" ON public.game_patterns
    FOR SELECT USING (true);

-- 5. POLÍTICAS PARA CARTONES (CARDS)
-- Lectura pública para que los jugadores carguen sus cartones en vivo
CREATE POLICY "Public read cards" ON public.cards
    FOR SELECT USING (true);
-- Escritura/Modificación/Borrado BLOQUEADA a usuarios anónimos (solo backend con service_role)

-- 6. POLÍTICAS PARA AJUSTES (SETTINGS)
-- Lectura pública de ajustes globales (mantenimiento, precios, etc.)
CREATE POLICY "Public read settings" ON public.settings
    FOR SELECT USING (true);
-- Modificaciones de configuración bloqueadas a anon

-- 7. POLÍTICAS PARA BILLETERA (WALLETS & TRANSACTIONS) - MÁXIMA SEGURIDAD
-- BLOQUEO TOTAL de INSERT, UPDATE y DELETE desde el cliente web.
-- Solo el backend con SUPABASE_SERVICE_ROLE_KEY puede acreditar/debitar saldo.
-- Lectura: los clientes deben consultar saldo exclusivamente mediante las APIs del backend.

-- 8. POLÍTICAS PARA VENDEDORES (SELLERS)
-- Lectura de vendedores para validar códigos en el registro
CREATE POLICY "Public read sellers" ON public.sellers
    FOR SELECT USING (true);

-- 9. POLÍTICAS PARA INVITACIONES / REGALOS (GIFT_INVITATIONS)
CREATE POLICY "Public read gift_invitations" ON public.gift_invitations
    FOR SELECT USING (true);

-- 10. POLÍTICAS PARA NOTIFICACIONES (NOTIFICATIONS)
CREATE POLICY "Public read notifications" ON public.notifications
    FOR SELECT USING (true);

-- ==============================================================================
-- MIGRACIÓN: ASIGNACIÓN DE DATOS HUÉRFANOS AL TENANT "bingo-lite"
-- Sala: https://bingolite.click/sala/bingo-lite
-- ==============================================================================
-- ¿Qué hace este script?
--   1. Verifica y garantiza que el tenant "bingo-lite" exista.
--   2. Asigna todos los datos sin tenant (NULL) o con tenant 'default'
--      al tenant 'bingo-lite' en TODAS las tablas del sistema.
--   3. Copia los patrones del tenant 'default' al tenant 'bingo-lite'
--      si aún no tiene sus propios patrones.
--   4. Preserva 100% los datos: jugadores con saldo en billetera,
--      jugadores con contraseña, cartones, transacciones, etc.
--
-- SEGURIDAD: Este script es 100% IDEMPOTENTE. Puede ejecutarse
--            múltiples veces sin duplicar ni borrar datos.
-- ==============================================================================

BEGIN;

-- -----------------------------------------------------------------------
-- PASO 0: Garantizar que el tenant "bingo-lite" exista con datos correctos
-- -----------------------------------------------------------------------
INSERT INTO public.tenants (
    id, name, slug, subdomain, custom_domain,
    access_code, max_cards_per_game, plan, is_active,
    admin_name, created_at
)
VALUES (
    'bingo-lite', 'Bingo Lite Oficial', 'bingo-lite', 'bingolite', 'bingolite.click',
    'LITE777', 20000, 'pro', true,
    'Administrador', NOW()
)
ON CONFLICT (id) DO UPDATE SET
    name          = EXCLUDED.name,
    slug          = EXCLUDED.slug,
    custom_domain = EXCLUDED.custom_domain,
    is_active     = true,
    updated_at    = NOW();

-- -----------------------------------------------------------------------
-- PASO 1: JUGADORES (players)
-- -----------------------------------------------------------------------
DO $$
DECLARE orphan_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO orphan_count FROM public.players WHERE tenant_id IS NULL OR tenant_id = 'default';
    RAISE NOTICE '[players] Huérfanos encontrados: %', orphan_count;

    UPDATE public.players
    SET tenant_id = 'bingo-lite'
    WHERE (tenant_id IS NULL OR tenant_id = 'default')
      AND NOT EXISTS (
          SELECT 1 FROM public.players p2
          WHERE p2.tenant_id = 'bingo-lite' AND p2.phone = public.players.phone
      );

    GET DIAGNOSTICS orphan_count = ROW_COUNT;
    RAISE NOTICE '[players] Reasignados a bingo-lite: %', orphan_count;
END $$;

-- -----------------------------------------------------------------------
-- PASO 2: BILLETERAS (wallets) — preserva saldos
-- -----------------------------------------------------------------------
DO $$
DECLARE orphan_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO orphan_count FROM public.wallets WHERE tenant_id IS NULL OR tenant_id = 'default';
    RAISE NOTICE '[wallets] Huérfanas encontradas: %', orphan_count;

    UPDATE public.wallets
    SET tenant_id = 'bingo-lite'
    WHERE (tenant_id IS NULL OR tenant_id = 'default')
      AND NOT EXISTS (
          SELECT 1 FROM public.wallets w2
          WHERE w2.tenant_id = 'bingo-lite' AND w2.phone = public.wallets.phone
      );

    GET DIAGNOSTICS orphan_count = ROW_COUNT;
    RAISE NOTICE '[wallets] Reasignadas: %', orphan_count;
END $$;

-- -----------------------------------------------------------------------
-- PASO 3: TRANSACCIONES DE BILLETERA (wallet_transactions)
-- -----------------------------------------------------------------------
DO $$
DECLARE orphan_count INTEGER;
BEGIN
    UPDATE public.wallet_transactions SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS orphan_count = ROW_COUNT;
    RAISE NOTICE '[wallet_transactions] Reasignadas: %', orphan_count;
END $$;

-- -----------------------------------------------------------------------
-- PASO 4: JUEGOS (game)
-- -----------------------------------------------------------------------
DO $$
DECLARE orphan_count INTEGER;
BEGIN
    UPDATE public.game SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS orphan_count = ROW_COUNT;
    RAISE NOTICE '[game] Reasignados: %', orphan_count;
END $$;

-- -----------------------------------------------------------------------
-- PASO 5: PATRONES (patterns)
-- -----------------------------------------------------------------------
DO $$
DECLARE orphan_count INTEGER;
BEGIN
    UPDATE public.patterns SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS orphan_count = ROW_COUNT;
    RAISE NOTICE '[patterns] Reasignados: %', orphan_count;
END $$;

-- -----------------------------------------------------------------------
-- PASO 6: FIGURAS DE JUEGO (game_patterns)
-- -----------------------------------------------------------------------
DO $$
DECLARE orphan_count INTEGER;
BEGIN
    UPDATE public.game_patterns SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS orphan_count = ROW_COUNT;
    RAISE NOTICE '[game_patterns] Reasignados: %', orphan_count;
END $$;

-- -----------------------------------------------------------------------
-- PASO 7: CARTONES (cards)
-- -----------------------------------------------------------------------
DO $$
DECLARE orphan_count INTEGER;
BEGIN
    UPDATE public.cards SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS orphan_count = ROW_COUNT;
    RAISE NOTICE '[cards] Reasignados: %', orphan_count;
END $$;

-- -----------------------------------------------------------------------
-- PASO 8: VENDEDORES (sellers)
-- -----------------------------------------------------------------------
DO $$
DECLARE orphan_count INTEGER;
BEGIN
    UPDATE public.sellers SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS orphan_count = ROW_COUNT;
    RAISE NOTICE '[sellers] Reasignados: %', orphan_count;
END $$;

-- -----------------------------------------------------------------------
-- PASO 9: CONFIGURACIONES (settings)
-- -----------------------------------------------------------------------
DO $$
DECLARE orphan_count INTEGER;
BEGIN
    UPDATE public.settings SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS orphan_count = ROW_COUNT;
    RAISE NOTICE '[settings] Reasignadas: %', orphan_count;
END $$;

-- -----------------------------------------------------------------------
-- PASO 10: NOTIFICACIONES (notifications)
-- -----------------------------------------------------------------------
DO $$
DECLARE orphan_count INTEGER;
BEGIN
    UPDATE public.notifications SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS orphan_count = ROW_COUNT;
    RAISE NOTICE '[notifications] Reasignadas: %', orphan_count;
END $$;

-- -----------------------------------------------------------------------
-- PASO 11: ACTIVACIONES DE BILLETERA (wallet_activations)
-- -----------------------------------------------------------------------
DO $$
DECLARE orphan_count INTEGER;
BEGIN
    UPDATE public.wallet_activations SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS orphan_count = ROW_COUNT;
    RAISE NOTICE '[wallet_activations] Reasignadas: %', orphan_count;
END $$;

-- -----------------------------------------------------------------------
-- PASO 12: INVITACIONES DE REGALO (gift_invitations)
-- -----------------------------------------------------------------------
DO $$
DECLARE orphan_count INTEGER;
BEGIN
    UPDATE public.gift_invitations SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS orphan_count = ROW_COUNT;
    RAISE NOTICE '[gift_invitations] Reasignadas: %', orphan_count;
END $$;

-- -----------------------------------------------------------------------
-- PASO 13: RECLAMOS DE BINGO (bingo_claims)
-- -----------------------------------------------------------------------
DO $$
DECLARE orphan_count INTEGER;
BEGIN
    UPDATE public.bingo_claims SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS orphan_count = ROW_COUNT;
    RAISE NOTICE '[bingo_claims] Reasignados: %', orphan_count;
END $$;

-- -----------------------------------------------------------------------
-- PASO 14: PREMIOS JUEGOS GRATUITOS (free_game_prizes)
-- -----------------------------------------------------------------------
DO $$
DECLARE orphan_count INTEGER;
BEGIN
    UPDATE public.free_game_prizes SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS orphan_count = ROW_COUNT;
    RAISE NOTICE '[free_game_prizes] Reasignados: %', orphan_count;
END $$;

-- -----------------------------------------------------------------------
-- PASO 15: PARTICIPACIONES EN JUEGOS PAGOS (player_paid_game_participations)
-- -----------------------------------------------------------------------
DO $$
DECLARE orphan_count INTEGER;
BEGIN
    UPDATE public.player_paid_game_participations SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS orphan_count = ROW_COUNT;
    RAISE NOTICE '[player_paid_game_participations] Reasignadas: %', orphan_count;
END $$;

-- -----------------------------------------------------------------------
-- PASO 16: PRESETS DE IA (ai_presets)
-- -----------------------------------------------------------------------
DO $$
DECLARE orphan_count INTEGER;
BEGIN
    UPDATE public.ai_presets SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS orphan_count = ROW_COUNT;
    RAISE NOTICE '[ai_presets] Reasignados: %', orphan_count;
END $$;

-- -----------------------------------------------------------------------
-- PASO 17: NÚMEROS DE LOTERÍA (lottery_numbers_in_play)
-- -----------------------------------------------------------------------
DO $$
DECLARE orphan_count INTEGER;
BEGIN
    UPDATE public.lottery_numbers_in_play SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS orphan_count = ROW_COUNT;
    RAISE NOTICE '[lottery_numbers_in_play] Reasignados: %', orphan_count;
END $$;

-- -----------------------------------------------------------------------
-- PASO 18: COMPROBANTES (receipts)
-- -----------------------------------------------------------------------
DO $$
DECLARE orphan_count INTEGER;
BEGIN
    UPDATE public.receipts SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS orphan_count = ROW_COUNT;
    RAISE NOTICE '[receipts] Reasignados: %', orphan_count;
END $$;


-- -----------------------------------------------------------------------
-- PASO 19: PATRONES CLÁSICOS PARA BINGO-LITE (garantizar que existan)
-- -----------------------------------------------------------------------
INSERT INTO public.patterns (name, grid, is_active, tenant_id)
SELECT 'Línea Horizontal Central',
    '[[false,false,false,false,false],[false,false,false,false,false],[true,true,true,true,true],[false,false,false,false,false],[false,false,false,false,false]]'::jsonb,
    true, 'bingo-lite'
WHERE NOT EXISTS (SELECT 1 FROM public.patterns WHERE tenant_id = 'bingo-lite' AND name = 'Línea Horizontal Central');

INSERT INTO public.patterns (name, grid, is_active, tenant_id)
SELECT 'Línea Vertical Central',
    '[[false,false,true,false,false],[false,false,true,false,false],[false,false,true,false,false],[false,false,true,false,false],[false,false,true,false,false]]'::jsonb,
    true, 'bingo-lite'
WHERE NOT EXISTS (SELECT 1 FROM public.patterns WHERE tenant_id = 'bingo-lite' AND name = 'Línea Vertical Central');

INSERT INTO public.patterns (name, grid, is_active, tenant_id)
SELECT 'Cuatro Esquinas',
    '[[true,false,false,false,true],[false,false,false,false,false],[false,false,false,false,false],[false,false,false,false,false],[true,false,false,false,true]]'::jsonb,
    true, 'bingo-lite'
WHERE NOT EXISTS (SELECT 1 FROM public.patterns WHERE tenant_id = 'bingo-lite' AND name = 'Cuatro Esquinas');

INSERT INTO public.patterns (name, grid, is_active, tenant_id)
SELECT 'Letra X',
    '[[true,false,false,false,true],[false,true,false,true,false],[false,false,true,false,false],[false,true,false,true,false],[true,false,false,false,true]]'::jsonb,
    true, 'bingo-lite'
WHERE NOT EXISTS (SELECT 1 FROM public.patterns WHERE tenant_id = 'bingo-lite' AND name = 'Letra X');

INSERT INTO public.patterns (name, grid, is_active, tenant_id)
SELECT 'Marco Exterior',
    '[[true,true,true,true,true],[true,false,false,false,true],[true,false,false,false,true],[true,false,false,false,true],[true,true,true,true,true]]'::jsonb,
    true, 'bingo-lite'
WHERE NOT EXISTS (SELECT 1 FROM public.patterns WHERE tenant_id = 'bingo-lite' AND name = 'Marco Exterior');

INSERT INTO public.patterns (name, grid, is_active, tenant_id)
SELECT 'Cartón Lleno (Bingo)',
    '[[true,true,true,true,true],[true,true,true,true,true],[true,true,true,true,true],[true,true,true,true,true],[true,true,true,true,true]]'::jsonb,
    true, 'bingo-lite'
WHERE NOT EXISTS (SELECT 1 FROM public.patterns WHERE tenant_id = 'bingo-lite' AND name = 'Cartón Lleno (Bingo)');

INSERT INTO public.patterns (name, grid, is_active, tenant_id)
SELECT 'Diagonal Principal',
    '[[true,false,false,false,false],[false,true,false,false,false],[false,false,true,false,false],[false,false,false,true,false],[false,false,false,false,true]]'::jsonb,
    true, 'bingo-lite'
WHERE NOT EXISTS (SELECT 1 FROM public.patterns WHERE tenant_id = 'bingo-lite' AND name = 'Diagonal Principal');


-- -----------------------------------------------------------------------
-- PASO 20: RESUMEN FINAL
-- -----------------------------------------------------------------------
DO $$
DECLARE
    cnt_players         INTEGER;
    cnt_players_pwd     INTEGER;
    cnt_wallets         INTEGER;
    cnt_wallets_balance INTEGER;
    cnt_games           INTEGER;
    cnt_patterns        INTEGER;
    cnt_cards           INTEGER;
    cnt_sellers         INTEGER;
    cnt_transactions    INTEGER;
BEGIN
    SELECT COUNT(*) INTO cnt_players      FROM public.players WHERE tenant_id = 'bingo-lite';
    SELECT COUNT(*) INTO cnt_players_pwd  FROM public.players WHERE tenant_id = 'bingo-lite' AND password IS NOT NULL AND password != '';
    SELECT COUNT(*) INTO cnt_wallets      FROM public.wallets WHERE tenant_id = 'bingo-lite';
    SELECT COUNT(*) INTO cnt_wallets_balance FROM public.wallets WHERE tenant_id = 'bingo-lite' AND balance > 0;
    SELECT COUNT(*) INTO cnt_games        FROM public.game WHERE tenant_id = 'bingo-lite';
    SELECT COUNT(*) INTO cnt_patterns     FROM public.patterns WHERE tenant_id = 'bingo-lite';
    SELECT COUNT(*) INTO cnt_cards        FROM public.cards WHERE tenant_id = 'bingo-lite';
    SELECT COUNT(*) INTO cnt_sellers      FROM public.sellers WHERE tenant_id = 'bingo-lite';
    SELECT COUNT(*) INTO cnt_transactions FROM public.wallet_transactions WHERE tenant_id = 'bingo-lite';

    RAISE NOTICE '============================================================';
    RAISE NOTICE '   RESUMEN FINAL - TENANT: bingo-lite';
    RAISE NOTICE '   URL: https://bingolite.click/sala/bingo-lite';
    RAISE NOTICE '============================================================';
    RAISE NOTICE '   Jugadores total          : %', cnt_players;
    RAISE NOTICE '   Jugadores con contraseña : %', cnt_players_pwd;
    RAISE NOTICE '   Billeteras total          : %', cnt_wallets;
    RAISE NOTICE '   Billeteras con saldo      : %', cnt_wallets_balance;
    RAISE NOTICE '   Juegos                    : %', cnt_games;
    RAISE NOTICE '   Patrones                  : %', cnt_patterns;
    RAISE NOTICE '   Cartones                  : %', cnt_cards;
    RAISE NOTICE '   Vendedores                : %', cnt_sellers;
    RAISE NOTICE '   Transacciones             : %', cnt_transactions;
    RAISE NOTICE '============================================================';
    RAISE NOTICE '   Migracion completada exitosamente.';
    RAISE NOTICE '============================================================';
END $$;

-- Recargar caché del schema PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;

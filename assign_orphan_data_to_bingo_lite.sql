-- ==============================================================================
-- MIGRACIÓN COMPLETA: AÑADIR tenant_id Y ASIGNAR DATOS HUÉRFANOS A "bingo-lite"
-- Sala: https://bingolite.click/sala/bingo-lite
-- ==============================================================================
-- Este script primero AGREGA las columnas tenant_id que faltan en cada tabla,
-- luego asigna todos los datos existentes al tenant 'bingo-lite'.
-- Es 100% IDEMPOTENTE: seguro de ejecutar múltiples veces.
-- ==============================================================================

BEGIN;

-- -----------------------------------------------------------------------
-- PASO 0: Tabla tenants (si no existe, la creamos)
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
    id VARCHAR(64) PRIMARY KEY,
    name TEXT NOT NULL,
    slug VARCHAR(64) UNIQUE NOT NULL,
    subdomain TEXT,
    custom_domain TEXT,
    logo_url TEXT,
    banner_url TEXT,
    primary_color TEXT DEFAULT '#2563eb',
    plan TEXT DEFAULT 'pro',
    is_active BOOLEAN DEFAULT true,
    access_code VARCHAR(32) DEFAULT 'BINGO2026',
    max_cards_per_game INTEGER DEFAULT 20000,
    admin_email TEXT,
    admin_password TEXT,
    admin_name TEXT,
    contact_phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS access_code VARCHAR(32) DEFAULT 'BINGO2026';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS admin_email TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS admin_password TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS admin_name TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- Garantizar que el tenant bingo-lite exista
INSERT INTO public.tenants (id, name, slug, subdomain, custom_domain, access_code, max_cards_per_game, plan, is_active, admin_name)
VALUES ('bingo-lite', 'Bingo Lite Oficial', 'bingo-lite', 'bingolite', 'bingolite.click', 'LITE777', 20000, 'pro', true, 'Administrador')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    custom_domain = EXCLUDED.custom_domain,
    is_active = true,
    updated_at = NOW();

-- También garantizar tenant 'default' como fallback
INSERT INTO public.tenants (id, name, slug, subdomain, access_code, max_cards_per_game, plan, is_active)
VALUES ('default', 'Bingo Lite Principal', 'default', 'bingolite-default', 'LITE777', 20000, 'pro', true)
ON CONFLICT (id) DO NOTHING;

RAISE NOTICE '[PASO 0] Tenant bingo-lite verificado/creado OK';

-- -----------------------------------------------------------------------
-- PASO 1: Añadir tenant_id a TODAS las tablas (ADD COLUMN IF NOT EXISTS)
-- -----------------------------------------------------------------------

-- game
ALTER TABLE public.game ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- patterns
ALTER TABLE public.patterns ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';
ALTER TABLE public.patterns ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- game_patterns
ALTER TABLE public.game_patterns ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- players
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS referred_by_player_code TEXT;

-- cards
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- wallets
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- wallet_transactions
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- wallet_activations
ALTER TABLE public.wallet_activations ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- sellers
ALTER TABLE public.sellers ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- settings
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- gift_invitations
ALTER TABLE public.gift_invitations ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- ai_presets
ALTER TABLE public.ai_presets ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- lottery_numbers_in_play
ALTER TABLE public.lottery_numbers_in_play ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- bingo_claims (puede no existir, la creamos si es necesario)
CREATE TABLE IF NOT EXISTS public.bingo_claims (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'bingo-lite',
    player_phone TEXT,
    card_number TEXT,
    game_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.bingo_claims ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- receipts (puede no existir)
CREATE TABLE IF NOT EXISTS public.receipts (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'bingo-lite',
    player_phone TEXT,
    url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- free_game_prizes (puede no existir)
CREATE TABLE IF NOT EXISTS public.free_game_prizes (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'bingo-lite',
    player_id BIGINT,
    player_phone VARCHAR(30),
    game_id BIGINT,
    game_name VARCHAR(255) NOT NULL DEFAULT 'Juego Gratuito',
    pattern_id BIGINT,
    pattern_name VARCHAR(255) NOT NULL DEFAULT 'Figura Ganadora',
    prize_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    prize_formatted VARCHAR(50),
    won_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    source VARCHAR(20) NOT NULL DEFAULT 'automatic',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.free_game_prizes ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- player_paid_game_participations (puede no existir)
CREATE TABLE IF NOT EXISTS public.player_paid_game_participations (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'bingo-lite',
    player_id BIGINT,
    game_id BIGINT,
    cards_count INTEGER NOT NULL DEFAULT 1,
    participated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.player_paid_game_participations ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

RAISE NOTICE '[PASO 1] Columnas tenant_id añadidas a todas las tablas OK';

-- -----------------------------------------------------------------------
-- PASO 2: ASIGNAR DATOS HUÉRFANOS AL TENANT bingo-lite
-- -----------------------------------------------------------------------

-- players
DO $$
DECLARE cnt INTEGER;
BEGIN
    UPDATE public.players
    SET tenant_id = 'bingo-lite'
    WHERE (tenant_id IS NULL OR tenant_id = 'default')
      AND NOT EXISTS (
          SELECT 1 FROM public.players p2
          WHERE p2.tenant_id = 'bingo-lite' AND p2.phone = public.players.phone
      );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[players] Reasignados a bingo-lite: %', cnt;
END $$;

-- wallets (preserva saldos)
DO $$
DECLARE cnt INTEGER;
BEGIN
    UPDATE public.wallets
    SET tenant_id = 'bingo-lite'
    WHERE (tenant_id IS NULL OR tenant_id = 'default')
      AND NOT EXISTS (
          SELECT 1 FROM public.wallets w2
          WHERE w2.tenant_id = 'bingo-lite' AND w2.phone = public.wallets.phone
      );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[wallets] Reasignadas a bingo-lite: %', cnt;
END $$;

-- wallet_transactions
UPDATE public.wallet_transactions SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
RAISE NOTICE '[wallet_transactions] Reasignadas';

-- game
UPDATE public.game SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
RAISE NOTICE '[game] Reasignados';

-- patterns
UPDATE public.patterns SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
RAISE NOTICE '[patterns] Reasignados';

-- game_patterns
UPDATE public.game_patterns SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
RAISE NOTICE '[game_patterns] Reasignados';

-- cards
UPDATE public.cards SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
RAISE NOTICE '[cards] Reasignados';

-- sellers
UPDATE public.sellers SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
RAISE NOTICE '[sellers] Reasignados';

-- settings
UPDATE public.settings SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
RAISE NOTICE '[settings] Reasignadas';

-- notifications
UPDATE public.notifications SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
RAISE NOTICE '[notifications] Reasignadas';

-- wallet_activations
UPDATE public.wallet_activations SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
RAISE NOTICE '[wallet_activations] Reasignadas';

-- gift_invitations
UPDATE public.gift_invitations SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
RAISE NOTICE '[gift_invitations] Reasignadas';

-- bingo_claims
UPDATE public.bingo_claims SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
RAISE NOTICE '[bingo_claims] Reasignados';

-- free_game_prizes
UPDATE public.free_game_prizes SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
RAISE NOTICE '[free_game_prizes] Reasignados';

-- player_paid_game_participations
UPDATE public.player_paid_game_participations SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
RAISE NOTICE '[player_paid_game_participations] Reasignadas';

-- ai_presets
UPDATE public.ai_presets SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
RAISE NOTICE '[ai_presets] Reasignados';

-- lottery_numbers_in_play
UPDATE public.lottery_numbers_in_play SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
RAISE NOTICE '[lottery_numbers_in_play] Reasignados';

-- receipts
UPDATE public.receipts SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
RAISE NOTICE '[receipts] Reasignados';

RAISE NOTICE '[PASO 2] Asignacion de datos huerfanos completada';

-- -----------------------------------------------------------------------
-- PASO 3: ÍNDICES para rendimiento multi-tenant
-- -----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_game_tenant_status    ON public.game(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_players_tenant_phone  ON public.players(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_wallets_tenant_phone  ON public.wallets(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_cards_tenant_game     ON public.cards(tenant_id, game_id);
CREATE INDEX IF NOT EXISTS idx_patterns_tenant       ON public.patterns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_settings_tenant_key   ON public.settings(tenant_id, key);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_tenant      ON public.wallet_transactions(tenant_id, player_phone);
RAISE NOTICE '[PASO 3] Indices creados OK';

-- -----------------------------------------------------------------------
-- PASO 4: PATRONES CLÁSICOS para bingo-lite (si no tiene ninguno)
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

RAISE NOTICE '[PASO 4] Patrones clasicos garantizados para bingo-lite';

-- -----------------------------------------------------------------------
-- PASO 5: RESTRICCIONES ÚNICAS por (tenant_id, phone)
--   Primero eliminamos restricciones globales viejas si existen
-- -----------------------------------------------------------------------
DO $$
BEGIN
    -- players: quitar unique global por phone
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'players_phone_key' AND conrelid = 'public.players'::regclass) THEN
        ALTER TABLE public.players DROP CONSTRAINT players_phone_key;
        RAISE NOTICE '[players] Constraint players_phone_key eliminada';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'players_tenant_phone_unique' AND conrelid = 'public.players'::regclass) THEN
        ALTER TABLE public.players ADD CONSTRAINT players_tenant_phone_unique UNIQUE (tenant_id, phone);
        RAISE NOTICE '[players] Constraint tenant+phone unica creada';
    END IF;

    -- wallets: quitar unique global por phone
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_phone_key' AND conrelid = 'public.wallets'::regclass) THEN
        ALTER TABLE public.wallets DROP CONSTRAINT wallets_phone_key;
        RAISE NOTICE '[wallets] Constraint wallets_phone_key eliminada';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_tenant_phone_unique' AND conrelid = 'public.wallets'::regclass) THEN
        ALTER TABLE public.wallets ADD CONSTRAINT wallets_tenant_phone_unique UNIQUE (tenant_id, phone);
        RAISE NOTICE '[wallets] Constraint tenant+phone unica creada';
    END IF;
END $$;

RAISE NOTICE '[PASO 5] Restricciones unicas configuradas';

-- -----------------------------------------------------------------------
-- PASO 6: RLS - Políticas de seguridad básicas
-- -----------------------------------------------------------------------
ALTER TABLE public.tenants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patterns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_patterns   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_presets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bingo_claims    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_game_prizes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all bingo-lite migration" ON public.game;
DROP POLICY IF EXISTS "Allow all bingo-lite migration" ON public.patterns;
DROP POLICY IF EXISTS "Allow all bingo-lite migration" ON public.players;

CREATE POLICY IF NOT EXISTS "Allow backend all on game"       ON public.game        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Allow backend all on patterns"   ON public.patterns    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Allow backend all on players"    ON public.players     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Allow backend all on cards"      ON public.cards       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Allow backend all on wallets"    ON public.wallets     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Public read game"                ON public.game        FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Public read patterns"            ON public.patterns    FOR SELECT USING (true);

RAISE NOTICE '[PASO 6] Politicas RLS configuradas';

-- -----------------------------------------------------------------------
-- PASO 7: RESUMEN FINAL
-- -----------------------------------------------------------------------
DO $$
DECLARE
    cnt_players         INTEGER := 0;
    cnt_players_pwd     INTEGER := 0;
    cnt_wallets         INTEGER := 0;
    cnt_wallets_balance INTEGER := 0;
    cnt_games           INTEGER := 0;
    cnt_patterns        INTEGER := 0;
    cnt_cards           INTEGER := 0;
    cnt_sellers         INTEGER := 0;
    cnt_transactions    INTEGER := 0;
BEGIN
    BEGIN SELECT COUNT(*) INTO cnt_players     FROM public.players              WHERE tenant_id = 'bingo-lite'; EXCEPTION WHEN OTHERS THEN cnt_players := -1; END;
    BEGIN SELECT COUNT(*) INTO cnt_players_pwd FROM public.players              WHERE tenant_id = 'bingo-lite' AND password IS NOT NULL AND password != ''; EXCEPTION WHEN OTHERS THEN cnt_players_pwd := -1; END;
    BEGIN SELECT COUNT(*) INTO cnt_wallets     FROM public.wallets              WHERE tenant_id = 'bingo-lite'; EXCEPTION WHEN OTHERS THEN cnt_wallets := -1; END;
    BEGIN SELECT COUNT(*) INTO cnt_wallets_balance FROM public.wallets          WHERE tenant_id = 'bingo-lite' AND balance > 0; EXCEPTION WHEN OTHERS THEN cnt_wallets_balance := -1; END;
    BEGIN SELECT COUNT(*) INTO cnt_games       FROM public.game                 WHERE tenant_id = 'bingo-lite'; EXCEPTION WHEN OTHERS THEN cnt_games := -1; END;
    BEGIN SELECT COUNT(*) INTO cnt_patterns    FROM public.patterns             WHERE tenant_id = 'bingo-lite'; EXCEPTION WHEN OTHERS THEN cnt_patterns := -1; END;
    BEGIN SELECT COUNT(*) INTO cnt_cards       FROM public.cards                WHERE tenant_id = 'bingo-lite'; EXCEPTION WHEN OTHERS THEN cnt_cards := -1; END;
    BEGIN SELECT COUNT(*) INTO cnt_sellers     FROM public.sellers              WHERE tenant_id = 'bingo-lite'; EXCEPTION WHEN OTHERS THEN cnt_sellers := -1; END;
    BEGIN SELECT COUNT(*) INTO cnt_transactions FROM public.wallet_transactions WHERE tenant_id = 'bingo-lite'; EXCEPTION WHEN OTHERS THEN cnt_transactions := -1; END;

    RAISE NOTICE '============================================================';
    RAISE NOTICE '   RESUMEN FINAL - TENANT: bingo-lite';
    RAISE NOTICE '   URL: https://bingolite.click/sala/bingo-lite';
    RAISE NOTICE '============================================================';
    RAISE NOTICE '   Jugadores total          : %', cnt_players;
    RAISE NOTICE '   Jugadores con contrasena : %', cnt_players_pwd;
    RAISE NOTICE '   Billeteras total          : %', cnt_wallets;
    RAISE NOTICE '   Billeteras con saldo      : %', cnt_wallets_balance;
    RAISE NOTICE '   Juegos                    : %', cnt_games;
    RAISE NOTICE '   Patrones de figura        : %', cnt_patterns;
    RAISE NOTICE '   Cartones                  : %', cnt_cards;
    RAISE NOTICE '   Vendedores                : %', cnt_sellers;
    RAISE NOTICE '   Transacciones billetera   : %', cnt_transactions;
    RAISE NOTICE '============================================================';
    RAISE NOTICE '   MIGRACION COMPLETADA EXITOSAMENTE';
    RAISE NOTICE '============================================================';
END $$;

-- Recargar schema PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;

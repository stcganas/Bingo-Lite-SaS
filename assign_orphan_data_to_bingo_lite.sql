-- ==============================================================================
-- MIGRACIÓN COMPLETA: AÑADIR tenant_id Y ASIGNAR DATOS HUÉRFANOS A "bingo-lite"
-- Sala: https://bingolite.click/sala/bingo-lite
-- ==============================================================================
-- Correcciones v3:
--   - RAISE NOTICE solo dentro de bloques DO $$
--   - No se usa CREATE POLICY IF NOT EXISTS (no existe en PostgreSQL)
--   - 100% idempotente y compatible con Supabase / PostgreSQL 14+
-- ==============================================================================

BEGIN;

-- -----------------------------------------------------------------------
-- PASO 0: Tabla tenants (crear si no existe) + garantizar tenant bingo-lite
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

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS access_code   VARCHAR(32) DEFAULT 'BINGO2026';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS admin_email   TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS admin_password TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS admin_name    TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- Tenant por defecto (fallback)
INSERT INTO public.tenants (id, name, slug, subdomain, access_code, max_cards_per_game, plan, is_active)
VALUES ('default', 'Bingo Lite Principal', 'default', 'bingolite-default', 'LITE777', 20000, 'pro', true)
ON CONFLICT (id) DO NOTHING;

-- Tenant bingo-lite (sala principal)
INSERT INTO public.tenants (id, name, slug, subdomain, custom_domain, access_code, max_cards_per_game, plan, is_active, admin_name)
VALUES ('bingo-lite', 'Bingo Lite Oficial', 'bingo-lite', 'bingolite', 'bingolite.click', 'LITE777', 20000, 'pro', true, 'Administrador')
ON CONFLICT (id) DO UPDATE SET
    name          = EXCLUDED.name,
    slug          = EXCLUDED.slug,
    custom_domain = EXCLUDED.custom_domain,
    is_active     = true,
    updated_at    = NOW();

-- -----------------------------------------------------------------------
-- PASO 1: Añadir columna tenant_id a TODAS las tablas
-- -----------------------------------------------------------------------

-- game
ALTER TABLE public.game ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- patterns
ALTER TABLE public.patterns ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';
ALTER TABLE public.patterns ADD COLUMN IF NOT EXISTS is_active  BOOLEAN DEFAULT true;

-- game_patterns
ALTER TABLE public.game_patterns ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- players
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS tenant_id                  VARCHAR(64) DEFAULT 'bingo-lite';
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS password                   TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS is_approved                BOOLEAN DEFAULT false;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS referral_code              TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS referred_by_player_code   TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS paid_games_count           INTEGER DEFAULT 0;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS free_games_total_won       NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS is_grand_prize_eligible    BOOLEAN DEFAULT false;

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

-- bingo_claims
CREATE TABLE IF NOT EXISTS public.bingo_claims (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'bingo-lite',
    player_phone TEXT,
    card_number TEXT,
    game_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.bingo_claims ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- receipts
CREATE TABLE IF NOT EXISTS public.receipts (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'bingo-lite',
    player_phone TEXT,
    url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- free_game_prizes
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

-- player_paid_game_participations
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

-- admin_sessions
CREATE TABLE IF NOT EXISTS public.admin_sessions (
    id BIGSERIAL PRIMARY KEY,
    uid TEXT NOT NULL,
    tenant_id VARCHAR(64) DEFAULT 'bingo-lite',
    admin_email TEXT,
    role TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.admin_sessions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';

-- -----------------------------------------------------------------------
-- PASO 2: ASIGNAR DATOS HUÉRFANOS AL TENANT bingo-lite
-- -----------------------------------------------------------------------

-- players (evitar duplicados por teléfono)
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

-- wallets (evitar duplicados por teléfono, preserva saldos)
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
DO $$
DECLARE cnt INTEGER;
BEGIN
    UPDATE public.wallet_transactions SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[wallet_transactions] Reasignadas: %', cnt;
END $$;

-- game
DO $$
DECLARE cnt INTEGER;
BEGIN
    UPDATE public.game SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[game] Reasignados: %', cnt;
END $$;

-- patterns
DO $$
DECLARE cnt INTEGER;
BEGIN
    UPDATE public.patterns SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[patterns] Reasignados: %', cnt;
END $$;

-- game_patterns
DO $$
DECLARE cnt INTEGER;
BEGIN
    UPDATE public.game_patterns SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[game_patterns] Reasignados: %', cnt;
END $$;

-- cards
DO $$
DECLARE cnt INTEGER;
BEGIN
    UPDATE public.cards SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[cards] Reasignados: %', cnt;
END $$;

-- sellers
DO $$
DECLARE cnt INTEGER;
BEGIN
    UPDATE public.sellers SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[sellers] Reasignados: %', cnt;
END $$;

-- settings
DO $$
DECLARE cnt INTEGER;
BEGIN
    UPDATE public.settings SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[settings] Reasignadas: %', cnt;
END $$;

-- notifications
DO $$
DECLARE cnt INTEGER;
BEGIN
    UPDATE public.notifications SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[notifications] Reasignadas: %', cnt;
END $$;

-- wallet_activations
DO $$
DECLARE cnt INTEGER;
BEGIN
    UPDATE public.wallet_activations SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[wallet_activations] Reasignadas: %', cnt;
END $$;

-- gift_invitations
DO $$
DECLARE cnt INTEGER;
BEGIN
    UPDATE public.gift_invitations SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[gift_invitations] Reasignadas: %', cnt;
END $$;

-- bingo_claims
DO $$
DECLARE cnt INTEGER;
BEGIN
    UPDATE public.bingo_claims SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[bingo_claims] Reasignados: %', cnt;
END $$;

-- free_game_prizes
DO $$
DECLARE cnt INTEGER;
BEGIN
    UPDATE public.free_game_prizes SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[free_game_prizes] Reasignados: %', cnt;
END $$;

-- player_paid_game_participations
DO $$
DECLARE cnt INTEGER;
BEGIN
    UPDATE public.player_paid_game_participations SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[player_paid_game_participations] Reasignadas: %', cnt;
END $$;

-- ai_presets
DO $$
DECLARE cnt INTEGER;
BEGIN
    UPDATE public.ai_presets SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[ai_presets] Reasignados: %', cnt;
END $$;

-- lottery_numbers_in_play
DO $$
DECLARE cnt INTEGER;
BEGIN
    UPDATE public.lottery_numbers_in_play SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[lottery_numbers_in_play] Reasignados: %', cnt;
END $$;

-- receipts
DO $$
DECLARE cnt INTEGER;
BEGIN
    UPDATE public.receipts SET tenant_id = 'bingo-lite' WHERE tenant_id IS NULL OR tenant_id = 'default';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '[receipts] Reasignados: %', cnt;
END $$;

-- -----------------------------------------------------------------------
-- PASO 3: ÍNDICES de rendimiento multi-tenant
-- -----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_game_tenant_status   ON public.game(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_players_tenant_phone ON public.players(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_wallets_tenant_phone ON public.wallets(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_cards_tenant_game    ON public.cards(tenant_id, game_id);
CREATE INDEX IF NOT EXISTS idx_patterns_tenant      ON public.patterns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_settings_tenant_key  ON public.settings(tenant_id, key);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_tenant     ON public.wallet_transactions(tenant_id, player_phone);

-- -----------------------------------------------------------------------
-- PASO 4: PATRONES CLÁSICOS para bingo-lite (si no tiene ninguno aún)
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
-- PASO 5: RESTRICCIONES ÚNICAS por (tenant_id, phone)
-- -----------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'players_phone_key' AND conrelid = 'public.players'::regclass) THEN
        ALTER TABLE public.players DROP CONSTRAINT players_phone_key;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'players_tenant_phone_unique' AND conrelid = 'public.players'::regclass) THEN
        ALTER TABLE public.players ADD CONSTRAINT players_tenant_phone_unique UNIQUE (tenant_id, phone);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_phone_key' AND conrelid = 'public.wallets'::regclass) THEN
        ALTER TABLE public.wallets DROP CONSTRAINT wallets_phone_key;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_tenant_phone_unique' AND conrelid = 'public.wallets'::regclass) THEN
        ALTER TABLE public.wallets ADD CONSTRAINT wallets_tenant_phone_unique UNIQUE (tenant_id, phone);
    END IF;

    RAISE NOTICE '[PASO 5] Restricciones unicas configuradas';
END $$;

-- -----------------------------------------------------------------------
-- PASO 6: RLS — habilitar y configurar políticas
-- -----------------------------------------------------------------------
ALTER TABLE public.tenants           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patterns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_patterns     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_presets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bingo_claims      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_game_prizes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_paid_game_participations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow backend all on tenants"   ON public.tenants;
DROP POLICY IF EXISTS "Allow backend all on game"      ON public.game;
DROP POLICY IF EXISTS "Allow backend all on patterns"  ON public.patterns;
DROP POLICY IF EXISTS "Allow backend all on players"   ON public.players;
DROP POLICY IF EXISTS "Allow backend all on cards"     ON public.cards;
DROP POLICY IF EXISTS "Allow backend all on wallets"   ON public.wallets;
DROP POLICY IF EXISTS "Allow backend all on wallet_transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Allow backend all on settings"  ON public.settings;
DROP POLICY IF EXISTS "Allow backend all on notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow backend all on ai_presets" ON public.ai_presets;
DROP POLICY IF EXISTS "Public read game"               ON public.game;
DROP POLICY IF EXISTS "Public read patterns"           ON public.patterns;
DROP POLICY IF EXISTS "Public read settings"           ON public.settings;
DROP POLICY IF EXISTS "Public read tenants safe"       ON public.tenants;

CREATE POLICY "Public read tenants safe"  ON public.tenants          FOR SELECT USING (true);
CREATE POLICY "Allow backend all on tenants" ON public.tenants       FOR ALL    USING (true) WITH CHECK (true);
CREATE POLICY "Public read game"          ON public.game             FOR SELECT USING (true);
CREATE POLICY "Allow backend all on game" ON public.game             FOR ALL    USING (true) WITH CHECK (true);
CREATE POLICY "Public read patterns"      ON public.patterns         FOR SELECT USING (true);
CREATE POLICY "Allow backend all on patterns" ON public.patterns     FOR ALL    USING (true) WITH CHECK (true);
CREATE POLICY "Public read settings"      ON public.settings         FOR SELECT USING (true);
CREATE POLICY "Allow backend all on settings" ON public.settings     FOR ALL    USING (true) WITH CHECK (true);
CREATE POLICY "Allow backend all on players" ON public.players       FOR ALL    USING (true) WITH CHECK (true);
CREATE POLICY "Allow backend all on cards" ON public.cards           FOR ALL    USING (true) WITH CHECK (true);
CREATE POLICY "Allow backend all on wallets" ON public.wallets       FOR ALL    USING (true) WITH CHECK (true);
CREATE POLICY "Allow backend all on wallet_transactions" ON public.wallet_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow backend all on notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow backend all on ai_presets" ON public.ai_presets FOR ALL   USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------
-- PASO 7: RESUMEN FINAL (dentro de DO $$ para usar RAISE NOTICE)
-- -----------------------------------------------------------------------
DO $$
DECLARE
    cnt_players          INTEGER := 0;
    cnt_players_pwd      INTEGER := 0;
    cnt_wallets          INTEGER := 0;
    cnt_wallets_balance  INTEGER := 0;
    cnt_games            INTEGER := 0;
    cnt_patterns         INTEGER := 0;
    cnt_cards            INTEGER := 0;
    cnt_sellers          INTEGER := 0;
    cnt_transactions     INTEGER := 0;
BEGIN
    BEGIN SELECT COUNT(*) INTO cnt_players         FROM public.players              WHERE tenant_id = 'bingo-lite'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN SELECT COUNT(*) INTO cnt_players_pwd     FROM public.players              WHERE tenant_id = 'bingo-lite' AND password IS NOT NULL AND password != ''; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN SELECT COUNT(*) INTO cnt_wallets         FROM public.wallets              WHERE tenant_id = 'bingo-lite'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN SELECT COUNT(*) INTO cnt_wallets_balance FROM public.wallets              WHERE tenant_id = 'bingo-lite' AND balance > 0; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN SELECT COUNT(*) INTO cnt_games           FROM public.game                 WHERE tenant_id = 'bingo-lite'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN SELECT COUNT(*) INTO cnt_patterns        FROM public.patterns             WHERE tenant_id = 'bingo-lite'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN SELECT COUNT(*) INTO cnt_cards           FROM public.cards                WHERE tenant_id = 'bingo-lite'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN SELECT COUNT(*) INTO cnt_sellers         FROM public.sellers              WHERE tenant_id = 'bingo-lite'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN SELECT COUNT(*) INTO cnt_transactions    FROM public.wallet_transactions  WHERE tenant_id = 'bingo-lite'; EXCEPTION WHEN OTHERS THEN NULL; END;

    RAISE NOTICE '============================================================';
    RAISE NOTICE '  RESUMEN FINAL - TENANT: bingo-lite';
    RAISE NOTICE '  URL: https://bingolite.click/sala/bingo-lite';
    RAISE NOTICE '============================================================';
    RAISE NOTICE '  Jugadores total          : %', cnt_players;
    RAISE NOTICE '  Jugadores con contrasena : %', cnt_players_pwd;
    RAISE NOTICE '  Billeteras total         : %', cnt_wallets;
    RAISE NOTICE '  Billeteras con saldo     : %', cnt_wallets_balance;
    RAISE NOTICE '  Juegos                   : %', cnt_games;
    RAISE NOTICE '  Patrones de figura       : %', cnt_patterns;
    RAISE NOTICE '  Cartones                 : %', cnt_cards;
    RAISE NOTICE '  Vendedores               : %', cnt_sellers;
    RAISE NOTICE '  Transacciones billetera  : %', cnt_transactions;
    RAISE NOTICE '============================================================';
    RAISE NOTICE '  MIGRACION COMPLETADA EXITOSAMENTE';
    RAISE NOTICE '============================================================';
END $$;

-- Recargar schema PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;

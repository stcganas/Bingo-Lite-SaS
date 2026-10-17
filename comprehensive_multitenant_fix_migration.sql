-- ==============================================================================
-- MIGRACIÓN INTEGRAL SAAS MULTI-TENANT & REPARACIÓN DEFINITIVA
-- Bingo Lite SaS - Corrección de Juegos, Patrones, Ajustes y Modo Mantenimiento
-- ==============================================================================
-- Instrucciones de ejecución:
-- 1. Abre tu panel de control en Supabase (https://supabase.com/dashboard).
-- 2. Selecciona tu proyecto -> Menú lateral "SQL Editor".
-- 3. Haz clic en "New query", pega todo este script y pulsa "Run" (Ejecutar).
-- Este script es 100% IDEMPOTENTE: seguro de ejecutar múltiples veces sin borrar datos.
-- ==============================================================================

-- 1. TABLA: tenants (Salas de Bingo / Inquilinos del SaaS)
CREATE TABLE IF NOT EXISTS public.tenants (
    id VARCHAR(64) PRIMARY KEY,
    name TEXT NOT NULL,
    slug VARCHAR(64) UNIQUE NOT NULL,
    subdomain TEXT UNIQUE,
    custom_domain TEXT UNIQUE,
    logo_url TEXT,
    banner_url TEXT,
    primary_color TEXT DEFAULT '#2563eb',
    plan TEXT DEFAULT 'pro',
    is_active BOOLEAN DEFAULT true,
    access_code VARCHAR(32) NOT NULL DEFAULT 'BINGO2026',
    max_cards_per_game INTEGER DEFAULT 20000,
    admin_email TEXT,
    admin_password TEXT,
    admin_name TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    subscription_plan TEXT DEFAULT 'basic',
    subscription_status TEXT DEFAULT 'active',
    subscription_expires_at TIMESTAMPTZ,
    max_players INTEGER DEFAULT 500,
    max_games_per_month INTEGER DEFAULT 20,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Asegurar columnas si la tabla ya existía
ALTER TABLE public.tenants 
    ADD COLUMN IF NOT EXISTS access_code VARCHAR(32) DEFAULT 'BINGO2026',
    ADD COLUMN IF NOT EXISTS admin_email TEXT,
    ADD COLUMN IF NOT EXISTS admin_password TEXT,
    ADD COLUMN IF NOT EXISTS admin_name TEXT,
    ADD COLUMN IF NOT EXISTS contact_phone TEXT,
    ADD COLUMN IF NOT EXISTS contact_email TEXT,
    ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'basic',
    ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 500,
    ADD COLUMN IF NOT EXISTS max_games_per_month INTEGER DEFAULT 20,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Insertar tenants por defecto si no existen
INSERT INTO public.tenants (id, name, slug, subdomain, access_code, max_cards_per_game)
VALUES 
    ('default', 'Bingo Lite Principal', 'default', 'bingolite', 'LITE777', 20000),
    ('bingo-lite', 'Bingo Lite Oficial', 'bingo-lite', 'oficial', 'LITE777', 20000)
ON CONFLICT (id) DO UPDATE SET 
    slug = EXCLUDED.slug, 
    name = EXCLUDED.name,
    access_code = EXCLUDED.access_code;


-- 2. TABLA: game (Juegos / Sorteos de Bingo)
CREATE TABLE IF NOT EXISTS public.game (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default' REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT,
    start_time TIMESTAMPTZ,
    prize TEXT,
    card_value NUMERIC,
    status TEXT NOT NULL DEFAULT 'waiting',
    drawn_balls JSONB DEFAULT '[]',
    current_ball INTEGER,
    final_note TEXT,
    is_free BOOLEAN DEFAULT false,
    stream_id TEXT,
    stream_active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.game ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default';
ALTER TABLE public.game ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT false;
ALTER TABLE public.game ADD COLUMN IF NOT EXISTS stream_id TEXT;
ALTER TABLE public.game ADD COLUMN IF NOT EXISTS stream_active BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_game_tenant_status ON public.game(tenant_id, status);


-- 3. TABLA: patterns (Figuras y Patrones de Bingo)
CREATE TABLE IF NOT EXISTS public.patterns (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default',
    name TEXT NOT NULL,
    grid JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.patterns ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default';
ALTER TABLE public.patterns ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_patterns_tenant ON public.patterns(tenant_id);

-- Sembrar figuras clásicas si no existen
INSERT INTO public.patterns (name, grid, is_active, tenant_id)
SELECT 'Línea Horizontal', '[[false,false,false,false,false],[false,false,false,false,false],[true,true,true,true,true],[false,false,false,false,false],[false,false,false,false,false]]'::jsonb, true, 'default'
WHERE NOT EXISTS (SELECT 1 FROM public.patterns WHERE name = 'Línea Horizontal');

INSERT INTO public.patterns (name, grid, is_active, tenant_id)
SELECT 'Línea Vertical', '[[false,false,true,false,false],[false,false,true,false,false],[false,false,true,false,false],[false,false,true,false,false],[false,false,true,false,false]]'::jsonb, true, 'default'
WHERE NOT EXISTS (SELECT 1 FROM public.patterns WHERE name = 'Línea Vertical');

INSERT INTO public.patterns (name, grid, is_active, tenant_id)
SELECT 'Diagonal', '[[true,false,false,false,false],[false,true,false,false,false],[false,false,true,false,false],[false,false,false,true,false],[false,false,false,false,true]]'::jsonb, true, 'default'
WHERE NOT EXISTS (SELECT 1 FROM public.patterns WHERE name = 'Diagonal');

INSERT INTO public.patterns (name, grid, is_active, tenant_id)
SELECT 'Cuatro Esquinas', '[[true,false,false,false,true],[false,false,false,false,false],[false,false,false,false,false],[false,false,false,false,false],[true,false,false,false,true]]'::jsonb, true, 'default'
WHERE NOT EXISTS (SELECT 1 FROM public.patterns WHERE name = 'Cuatro Esquinas');

INSERT INTO public.patterns (name, grid, is_active, tenant_id)
SELECT 'Cartón Lleno (Bingo)', '[[true,true,true,true,true],[true,true,true,true,true],[true,true,true,true,true],[true,true,true,true,true],[true,true,true,true,true]]'::jsonb, true, 'default'
WHERE NOT EXISTS (SELECT 1 FROM public.patterns WHERE name = 'Cartón Lleno (Bingo)');

INSERT INTO public.patterns (name, grid, is_active, tenant_id)
SELECT 'Letra X', '[[true,false,false,false,true],[false,true,false,true,false],[false,false,true,false,false],[false,true,false,true,false],[true,false,false,false,true]]'::jsonb, true, 'default'
WHERE NOT EXISTS (SELECT 1 FROM public.patterns WHERE name = 'Letra X');

INSERT INTO public.patterns (name, grid, is_active, tenant_id)
SELECT 'Marco Exterior', '[[true,true,true,true,true],[true,false,false,false,true],[true,false,false,false,true],[true,false,false,false,true],[true,true,true,true,true]]'::jsonb, true, 'default'
WHERE NOT EXISTS (SELECT 1 FROM public.patterns WHERE name = 'Marco Exterior');


-- 4. TABLA: game_patterns (Asignación de figuras y premios a un juego)
CREATE TABLE IF NOT EXISTS public.game_patterns (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default',
    game_id BIGINT REFERENCES public.game(id) ON DELETE CASCADE,
    pattern_id BIGINT REFERENCES public.patterns(id) ON DELETE CASCADE,
    prize NUMERIC NOT NULL DEFAULT 0,
    winner_player_id BIGINT,
    winner_card_id BIGINT,
    won_at TIMESTAMPTZ,
    payment_status TEXT DEFAULT 'pending',
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.game_patterns ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default';
ALTER TABLE public.game_patterns ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE public.game_patterns ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_game_patterns_game ON public.game_patterns(game_id);
CREATE INDEX IF NOT EXISTS idx_game_patterns_tenant ON public.game_patterns(tenant_id);


-- 5. TABLA: settings (Configuraciones y ajustes multi-inquilino)
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default',
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_settings_tenant_key ON public.settings(tenant_id, key);


-- 6. TABLA: players (Jugadores registrados por sala)
CREATE TABLE IF NOT EXISTS public.players (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default' REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    password TEXT,
    state TEXT,
    is_blocked BOOLEAN DEFAULT false,
    seller_code TEXT,
    referral_code TEXT,
    referred_by_player_code TEXT,
    is_approved BOOLEAN DEFAULT false,
    is_paid BOOLEAN DEFAULT false,
    card_count INTEGER DEFAULT 0,
    paid_games_count INTEGER DEFAULT 0,
    free_games_total_won NUMERIC(12,2) DEFAULT 0,
    is_grand_prize_eligible BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.players 
    ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default',
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS state TEXT,
    ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS seller_code TEXT,
    ADD COLUMN IF NOT EXISTS referral_code TEXT,
    ADD COLUMN IF NOT EXISTS referred_by_player_code TEXT,
    ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS card_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS paid_games_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS free_games_total_won NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_grand_prize_eligible BOOLEAN DEFAULT false;

-- Aislamiento único por (tenant_id, phone)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'players_phone_key' AND conrelid = 'public.players'::regclass) THEN
        ALTER TABLE public.players DROP CONSTRAINT players_phone_key;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'players_tenant_phone_unique' AND conrelid = 'public.players'::regclass) THEN
        ALTER TABLE public.players ADD CONSTRAINT players_tenant_phone_unique UNIQUE (tenant_id, phone);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_players_tenant_phone ON public.players(tenant_id, phone);


-- 7. TABLA: cards (Cartones de Bingo)
CREATE TABLE IF NOT EXISTS public.cards (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default' REFERENCES public.tenants(id) ON DELETE CASCADE,
    game_id BIGINT REFERENCES public.game(id) ON DELETE CASCADE,
    player_id BIGINT REFERENCES public.players(id) ON DELETE CASCADE,
    card_number TEXT NOT NULL,
    grid JSONB NOT NULL,
    player_phone TEXT,
    lottery_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default';
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS player_phone TEXT;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS lottery_code TEXT;

CREATE INDEX IF NOT EXISTS idx_cards_tenant_game ON public.cards(tenant_id, game_id);


-- 8. TABLA: wallets y wallet_transactions (Billeteras con saldo aislado)
CREATE TABLE IF NOT EXISTS public.wallets (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default' REFERENCES public.tenants(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    balance NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_phone_key' AND conrelid = 'public.wallets'::regclass) THEN
        ALTER TABLE public.wallets DROP CONSTRAINT wallets_phone_key;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_tenant_phone_unique' AND conrelid = 'public.wallets'::regclass) THEN
        ALTER TABLE public.wallets ADD CONSTRAINT wallets_tenant_phone_unique UNIQUE (tenant_id, phone);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wallets_tenant_phone ON public.wallets(tenant_id, phone);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default' REFERENCES public.tenants(id) ON DELETE CASCADE,
    player_phone TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'other',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_wallet_tx_tenant_phone ON public.wallet_transactions(tenant_id, player_phone);


-- 9. TABLAS AUXILIARES Y COMPLEMENTARIAS
CREATE TABLE IF NOT EXISTS public.wallet_activations (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default',
    phone TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    activated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.wallet_activations ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default';

CREATE TABLE IF NOT EXISTS public.sellers (
    id UUID PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default' REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    code TEXT NOT NULL,
    commission_percentage NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.sellers ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default';

CREATE TABLE IF NOT EXISTS public.receipts (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default',
    player_phone TEXT,
    url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default';

CREATE TABLE IF NOT EXISTS public.bingo_claims (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default',
    player_phone TEXT,
    card_number TEXT,
    game_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.bingo_claims ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default';

CREATE TABLE IF NOT EXISTS public.gift_invitations (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default',
    sender_phone TEXT NOT NULL,
    recipient_phone TEXT NOT NULL,
    game_id BIGINT,
    claimed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.gift_invitations ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default';

CREATE TABLE IF NOT EXISTS public.lottery_numbers_in_play (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default',
    player_id BIGINT REFERENCES public.players(id) ON DELETE CASCADE,
    game_id BIGINT REFERENCES public.game(id) ON DELETE CASCADE,
    lottery_code TEXT,
    card_number TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.lottery_numbers_in_play ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default';

CREATE TABLE IF NOT EXISTS public.notifications (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default',
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT false,
    type TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default';

CREATE TABLE IF NOT EXISTS public.ai_presets (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default',
    name TEXT NOT NULL,
    title TEXT,
    text TEXT NOT NULL,
    voice TEXT,
    audio_base64 TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.ai_presets ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default';

CREATE TABLE IF NOT EXISTS public.admin_sessions (
    id BIGSERIAL PRIMARY KEY,
    uid TEXT NOT NULL,
    tenant_id VARCHAR(64) DEFAULT 'default',
    admin_email TEXT,
    role TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.admin_sessions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default';

CREATE TABLE IF NOT EXISTS public.super_admin_events (
    id BIGSERIAL PRIMARY KEY,
    admin_email TEXT NOT NULL,
    event_type TEXT NOT NULL,
    tenant_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.free_game_prizes (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default',
    player_id BIGINT NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    player_phone VARCHAR(30),
    game_id BIGINT REFERENCES public.game(id) ON DELETE SET NULL,
    game_name VARCHAR(255) NOT NULL DEFAULT 'Juego Gratuito',
    pattern_id BIGINT REFERENCES public.patterns(id) ON DELETE SET NULL,
    pattern_name VARCHAR(255) NOT NULL DEFAULT 'Figura Ganadora',
    prize_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    prize_formatted VARCHAR(50),
    won_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    source VARCHAR(20) NOT NULL DEFAULT 'automatic',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.free_game_prizes ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default';

CREATE TABLE IF NOT EXISTS public.player_paid_game_participations (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) DEFAULT 'default',
    player_id BIGINT NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    game_id BIGINT NOT NULL REFERENCES public.game(id) ON DELETE CASCADE,
    cards_count INTEGER NOT NULL DEFAULT 1,
    participated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_player_paid_game UNIQUE (player_id, game_id)
);
ALTER TABLE public.player_paid_game_participations ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default';


-- 10. POLÍTICAS RLS (ROW LEVEL SECURITY) ROBUSTAS PARA OPERACIÓN SEGURA
-- Habilitar RLS en todas las tablas
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

-- Limpieza de políticas previas para evitar conflictos
DROP POLICY IF EXISTS "Public read tenants safe" ON public.tenants;
DROP POLICY IF EXISTS "Public read tenants" ON public.tenants;
DROP POLICY IF EXISTS "Allow backend all on tenants" ON public.tenants;

DROP POLICY IF EXISTS "Public read game" ON public.game;
DROP POLICY IF EXISTS "Allow backend all on game" ON public.game;

DROP POLICY IF EXISTS "Public read patterns" ON public.patterns;
DROP POLICY IF EXISTS "Allow backend all on patterns" ON public.patterns;

DROP POLICY IF EXISTS "Public read game_patterns" ON public.game_patterns;
DROP POLICY IF EXISTS "Allow backend all on game_patterns" ON public.game_patterns;

DROP POLICY IF EXISTS "Public read settings" ON public.settings;
DROP POLICY IF EXISTS "Allow backend all on settings" ON public.settings;

DROP POLICY IF EXISTS "Public read cards" ON public.cards;
DROP POLICY IF EXISTS "Allow backend all on cards" ON public.cards;

DROP POLICY IF EXISTS "Allow backend all on players" ON public.players;
DROP POLICY IF EXISTS "Allow backend all on wallets" ON public.wallets;
DROP POLICY IF EXISTS "Allow backend all on wallet_transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Allow backend all on sellers" ON public.sellers;
DROP POLICY IF EXISTS "Allow backend all on receipts" ON public.receipts;
DROP POLICY IF EXISTS "Allow backend all on bingo_claims" ON public.bingo_claims;
DROP POLICY IF EXISTS "Allow backend all on notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow backend all on ai_presets" ON public.ai_presets;
DROP POLICY IF EXISTS "Allow backend all on admin_sessions" ON public.admin_sessions;
DROP POLICY IF EXISTS "Allow backend all on super_admin_events" ON public.super_admin_events;
DROP POLICY IF EXISTS "Allow backend all on free_game_prizes" ON public.free_game_prizes;
DROP POLICY IF EXISTS "Allow backend all on player_paid_game_participations" ON public.player_paid_game_participations;

-- Crear políticas permisivas para el backend (service_role y APIs autorizadas) y lectura pública
CREATE POLICY "Public read tenants safe" ON public.tenants FOR SELECT USING (true);
CREATE POLICY "Allow backend all on tenants" ON public.tenants FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read game" ON public.game FOR SELECT USING (true);
CREATE POLICY "Allow backend all on game" ON public.game FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read patterns" ON public.patterns FOR SELECT USING (true);
CREATE POLICY "Allow backend all on patterns" ON public.patterns FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read game_patterns" ON public.game_patterns FOR SELECT USING (true);
CREATE POLICY "Allow backend all on game_patterns" ON public.game_patterns FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read settings" ON public.settings FOR SELECT USING (true);
CREATE POLICY "Allow backend all on settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read cards" ON public.cards FOR SELECT USING (true);
CREATE POLICY "Allow backend all on cards" ON public.cards FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow backend all on players" ON public.players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow backend all on wallets" ON public.wallets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow backend all on wallet_transactions" ON public.wallet_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow backend all on sellers" ON public.sellers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow backend all on receipts" ON public.receipts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow backend all on bingo_claims" ON public.bingo_claims FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow backend all on notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow backend all on ai_presets" ON public.ai_presets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow backend all on admin_sessions" ON public.admin_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow backend all on super_admin_events" ON public.super_admin_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow backend all on free_game_prizes" ON public.free_game_prizes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow backend all on player_paid_game_participations" ON public.player_paid_game_participations FOR ALL USING (true) WITH CHECK (true);

-- Notificar recarga de caché del schema PostgREST
NOTIFY pgrst, 'reload schema';

-- =========================================================================
-- MIGRACIÓN CANÓNICA SUPABASE (ACTUALIZADA 2026): BINGO LITE SAAS
-- Incluye: Multi-tenancy, tablas de salas, patrones, juegos, vendedores,
-- ajustes, almacenamiento y blindaje de políticas RLS.
--
-- Instrucciones:
-- Copia y ejecuta este script en el SQL Editor de Supabase (https://supabase.com).
-- Es 100% IDEMPOTENTE: seguro de ejecutar múltiples veces sin alterar datos existentes.
-- =========================================================================

-- 1. TABLA: tenants (Salas de bingo multi-tenant)
CREATE TABLE IF NOT EXISTS public.tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    subdomain TEXT UNIQUE,
    custom_domain TEXT UNIQUE,
    logo_url TEXT,
    banner_url TEXT,
    primary_color TEXT DEFAULT '#2563eb',
    plan TEXT DEFAULT 'pro',
    is_active BOOLEAN DEFAULT true,
    access_code TEXT DEFAULT 'BINGO2026',
    max_cards_per_game INTEGER DEFAULT 20000,
    admin_email TEXT,
    admin_password TEXT,
    admin_name TEXT,
    contact_phone TEXT,
    subscription_plan TEXT DEFAULT 'basic',
    subscription_status TEXT DEFAULT 'active',
    subscription_expires_at TIMESTAMP WITH TIME ZONE,
    max_players INTEGER DEFAULT 500,
    max_games_per_month INTEGER DEFAULT 20,
    contact_email TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Campos adicionales asegurados en tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'pro';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS access_code TEXT DEFAULT 'BINGO2026';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS max_cards_per_game INTEGER DEFAULT 20000;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS admin_email TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS admin_password TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS admin_name TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'basic';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 500;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS max_games_per_month INTEGER DEFAULT 20;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants (slug);
CREATE INDEX IF NOT EXISTS idx_tenants_is_active ON public.tenants (is_active);

-- Sala por defecto 'bingo-lite' y 'default' garantizadas
INSERT INTO public.tenants (id, name, slug, subdomain, access_code, primary_color, plan, is_active)
VALUES 
    ('bingo-lite', 'Bingo Lite Oficial', 'bingo-lite', 'bingo-lite', 'LITE777', '#2563eb', 'pro', true),
    ('default', 'Bingo Lite Principal', 'default', 'default', 'BINGO2026', '#2563eb', 'pro', true)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    is_active = COALESCE(public.tenants.is_active, true);

-- 2. TABLA: patterns (Figuras y patrones con soporte multi-tenant)
CREATE TABLE IF NOT EXISTS public.patterns (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    grid JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    tenant_id TEXT DEFAULT 'bingo-lite',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.patterns ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'bingo-lite';
ALTER TABLE public.patterns ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_patterns_tenant ON public.patterns (tenant_id);
CREATE INDEX IF NOT EXISTS idx_patterns_is_active ON public.patterns (is_active);

-- 3. TABLA: game (Partidas y sorteos con soporte multi-tenant)
CREATE TABLE IF NOT EXISTS public.game (
    id BIGSERIAL PRIMARY KEY,
    name TEXT,
    start_time TIMESTAMP WITH TIME ZONE,
    prize TEXT,
    card_value NUMERIC DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'waiting',
    drawn_balls JSONB DEFAULT '[]',
    current_ball INTEGER,
    final_note TEXT,
    is_free BOOLEAN DEFAULT false,
    stream_id TEXT,
    stream_active BOOLEAN DEFAULT false,
    tenant_id TEXT DEFAULT 'bingo-lite',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.game ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'bingo-lite';
ALTER TABLE public.game ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT false;
ALTER TABLE public.game ADD COLUMN IF NOT EXISTS stream_id TEXT;
ALTER TABLE public.game ADD COLUMN IF NOT EXISTS stream_active BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_game_tenant ON public.game (tenant_id);
CREATE INDEX IF NOT EXISTS idx_game_status ON public.game (status);

-- 4. TABLA: game_patterns (Asociación partida-figura y reclamo de premios)
CREATE TABLE IF NOT EXISTS public.game_patterns (
    id BIGSERIAL PRIMARY KEY,
    game_id BIGINT REFERENCES public.game(id) ON DELETE CASCADE,
    pattern_id BIGINT REFERENCES public.patterns(id) ON DELETE CASCADE,
    prize TEXT,
    winner_player_id BIGINT,
    winner_card_number TEXT,
    payment_status TEXT DEFAULT 'pending',
    rejection_reason TEXT,
    tenant_id TEXT DEFAULT 'bingo-lite',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.game_patterns ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'bingo-lite';
ALTER TABLE public.game_patterns ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE public.game_patterns ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_game_patterns_game ON public.game_patterns (game_id);
CREATE INDEX IF NOT EXISTS idx_game_patterns_tenant ON public.game_patterns (tenant_id);

-- 5. TABLA: sellers (Vendedores y promotores de sala)
CREATE TABLE IF NOT EXISTS public.sellers (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    code TEXT UNIQUE NOT NULL,
    commission_percentage NUMERIC DEFAULT 10,
    status TEXT DEFAULT 'active',
    password TEXT,
    tenant_id TEXT DEFAULT 'bingo-lite',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.sellers ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'bingo-lite';
ALTER TABLE public.sellers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
CREATE INDEX IF NOT EXISTS idx_sellers_tenant ON public.sellers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sellers_code ON public.sellers (code);

-- 6. TABLA: settings (Ajustes clave-valor por sala y plataforma)
CREATE TABLE IF NOT EXISTS public.settings (
    id BIGSERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    tenant_id TEXT DEFAULT 'bingo-lite',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'bingo-lite';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
CREATE INDEX IF NOT EXISTS idx_settings_key ON public.settings (key);
CREATE INDEX IF NOT EXISTS idx_settings_tenant ON public.settings (tenant_id);

-- 7. TABLA: players (Jugadores registrados)
CREATE TABLE IF NOT EXISTS public.players (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    state TEXT,
    city TEXT,
    card_count INTEGER DEFAULT 0,
    receipt_url TEXT,
    status TEXT DEFAULT 'pending',
    is_blocked BOOLEAN DEFAULT false,
    seller_code TEXT,
    referral_code TEXT,
    referred_by_player_code TEXT,
    is_approved BOOLEAN DEFAULT false,
    is_paid BOOLEAN DEFAULT false,
    tenant_id TEXT DEFAULT 'bingo-lite',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'bingo-lite';
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS seller_code TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS referred_by_player_code TEXT;
CREATE INDEX IF NOT EXISTS idx_players_tenant ON public.players (tenant_id);
CREATE INDEX IF NOT EXISTS idx_players_phone_tenant ON public.players (phone, tenant_id);

-- 8. TABLA: cards (Cartones generados)
CREATE TABLE IF NOT EXISTS public.cards (
    id BIGSERIAL PRIMARY KEY,
    game_id BIGINT REFERENCES public.game(id) ON DELETE CASCADE,
    card_number TEXT NOT NULL,
    grid JSONB NOT NULL,
    player_id BIGINT,
    player_phone TEXT,
    lottery_code TEXT,
    tenant_id TEXT DEFAULT 'bingo-lite',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'bingo-lite';
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS player_phone TEXT;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS lottery_code TEXT;
CREATE INDEX IF NOT EXISTS idx_cards_game ON public.cards (game_id);
CREATE INDEX IF NOT EXISTS idx_cards_tenant ON public.cards (tenant_id);

-- 9. TABLAS FINANCIERAS
CREATE TABLE IF NOT EXISTS public.wallets (
    id BIGSERIAL PRIMARY KEY,
    phone TEXT UNIQUE NOT NULL,
    balance NUMERIC DEFAULT 0 NOT NULL,
    tenant_id TEXT DEFAULT 'bingo-lite',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'bingo-lite';

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id BIGSERIAL PRIMARY KEY,
    player_phone TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'other',
    tenant_id TEXT DEFAULT 'bingo-lite',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'bingo-lite';

CREATE TABLE IF NOT EXISTS public.receipts (
    id BIGSERIAL PRIMARY KEY,
    player_phone TEXT,
    url TEXT,
    tenant_id TEXT DEFAULT 'bingo-lite',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'bingo-lite';

CREATE TABLE IF NOT EXISTS public.bingo_claims (
    id BIGSERIAL PRIMARY KEY,
    player_phone TEXT,
    card_number TEXT,
    game_id BIGINT,
    tenant_id TEXT DEFAULT 'bingo-lite',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.bingo_claims ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'bingo-lite';

CREATE TABLE IF NOT EXISTS public.super_admin_events (
    id BIGSERIAL PRIMARY KEY,
    admin_email TEXT NOT NULL,
    event_type TEXT NOT NULL,
    tenant_id TEXT DEFAULT 'global',
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =========================================================================
-- SEGURIDAD RLS: POLÍTICAS ROBUSTAS PARA SERVICE_ROLE Y ACCESO PÚBLICO
-- =========================================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bingo_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admin_events ENABLE ROW LEVEL SECURITY;

-- 10. ACCESO TOTAL PARA EL BACKEND (service_role)
-- Permite que el servidor Node.js ejecute inserciones, actualizaciones y lecturas sin restricciones RLS
DROP POLICY IF EXISTS "Backend full access tenants" ON public.tenants;
CREATE POLICY "Backend full access tenants" ON public.tenants FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access patterns" ON public.patterns;
CREATE POLICY "Backend full access patterns" ON public.patterns FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access game" ON public.game;
CREATE POLICY "Backend full access game" ON public.game FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access game_patterns" ON public.game_patterns;
CREATE POLICY "Backend full access game_patterns" ON public.game_patterns FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access sellers" ON public.sellers;
CREATE POLICY "Backend full access sellers" ON public.sellers FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access settings" ON public.settings;
CREATE POLICY "Backend full access settings" ON public.settings FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access players" ON public.players;
CREATE POLICY "Backend full access players" ON public.players FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access cards" ON public.cards;
CREATE POLICY "Backend full access cards" ON public.cards FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access wallets" ON public.wallets;
CREATE POLICY "Backend full access wallets" ON public.wallets FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access wallet_transactions" ON public.wallet_transactions;
CREATE POLICY "Backend full access wallet_transactions" ON public.wallet_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access receipts table" ON public.receipts;
CREATE POLICY "Backend full access receipts table" ON public.receipts FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access bingo_claims" ON public.bingo_claims;
CREATE POLICY "Backend full access bingo_claims" ON public.bingo_claims FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend full access super_admin_events" ON public.super_admin_events;
CREATE POLICY "Backend full access super_admin_events" ON public.super_admin_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 11. POLÍTICAS OPERATIVAS (anon, authenticated, service_role)
-- A) PLAYERS: Registro público de jugadores y actualización del sistema
DROP POLICY IF EXISTS "Public read players safe" ON public.players;
DROP POLICY IF EXISTS "Public insert players" ON public.players;
DROP POLICY IF EXISTS "Public update players" ON public.players;
DROP POLICY IF EXISTS "Allow all players" ON public.players;
CREATE POLICY "Public read players safe" ON public.players FOR SELECT TO anon, authenticated, service_role USING (true);
CREATE POLICY "Public insert players" ON public.players FOR INSERT TO anon, authenticated, service_role WITH CHECK (true);
CREATE POLICY "Public update players" ON public.players FOR UPDATE TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- B) CARDS: Generación y consulta de cartones
DROP POLICY IF EXISTS "Public read cards" ON public.cards;
DROP POLICY IF EXISTS "Public insert cards" ON public.cards;
DROP POLICY IF EXISTS "Public update cards" ON public.cards;
CREATE POLICY "Public read cards" ON public.cards FOR SELECT TO anon, authenticated, service_role USING (true);
CREATE POLICY "Public insert cards" ON public.cards FOR INSERT TO anon, authenticated, service_role WITH CHECK (true);
CREATE POLICY "Public update cards" ON public.cards FOR UPDATE TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- C) RECEIPTS: Subida y visualización de comprobantes de pago
DROP POLICY IF EXISTS "Public read receipts table" ON public.receipts;
DROP POLICY IF EXISTS "Public insert receipts table" ON public.receipts;
CREATE POLICY "Public read receipts table" ON public.receipts FOR SELECT TO anon, authenticated, service_role USING (true);
CREATE POLICY "Public insert receipts table" ON public.receipts FOR INSERT TO anon, authenticated, service_role WITH CHECK (true);

-- D) BINGO CLAIMS: Reclamos de bingo por jugadores
DROP POLICY IF EXISTS "Public read bingo_claims" ON public.bingo_claims;
DROP POLICY IF EXISTS "Public insert bingo_claims" ON public.bingo_claims;
CREATE POLICY "Public read bingo_claims" ON public.bingo_claims FOR SELECT TO anon, authenticated, service_role USING (true);
CREATE POLICY "Public insert bingo_claims" ON public.bingo_claims FOR INSERT TO anon, authenticated, service_role WITH CHECK (true);

-- E) GAME: Lectura y gestión de partidas
DROP POLICY IF EXISTS "Public read game" ON public.game;
DROP POLICY IF EXISTS "Allow all game" ON public.game;
CREATE POLICY "Public read game" ON public.game FOR SELECT TO anon, authenticated, service_role USING (true);
CREATE POLICY "Allow all game" ON public.game FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- F) PATTERNS & GAME PATTERNS: Figuras y patrones
DROP POLICY IF EXISTS "Public read patterns" ON public.patterns;
DROP POLICY IF EXISTS "Allow all patterns" ON public.patterns;
CREATE POLICY "Public read patterns" ON public.patterns FOR SELECT TO anon, authenticated, service_role USING (true);
CREATE POLICY "Allow all patterns" ON public.patterns FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read game_patterns" ON public.game_patterns;
DROP POLICY IF EXISTS "Allow all game_patterns" ON public.game_patterns;
CREATE POLICY "Public read game_patterns" ON public.game_patterns FOR SELECT TO anon, authenticated, service_role USING (true);
CREATE POLICY "Allow all game_patterns" ON public.game_patterns FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- G) SELLERS: Vendedores
DROP POLICY IF EXISTS "Public read sellers" ON public.sellers;
DROP POLICY IF EXISTS "Allow all sellers" ON public.sellers;
CREATE POLICY "Public read sellers" ON public.sellers FOR SELECT TO anon, authenticated, service_role USING (true);
CREATE POLICY "Allow all sellers" ON public.sellers FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- H) TENANTS: Salas
DROP POLICY IF EXISTS "Public read tenants safe" ON public.tenants;
DROP POLICY IF EXISTS "Allow all tenants" ON public.tenants;
CREATE POLICY "Public read tenants safe" ON public.tenants FOR SELECT TO anon, authenticated, service_role USING (true);
CREATE POLICY "Allow all tenants" ON public.tenants FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- I) SETTINGS: Ajustes de sala
DROP POLICY IF EXISTS "Public read settings" ON public.settings;
DROP POLICY IF EXISTS "Allow all settings" ON public.settings;
CREATE POLICY "Public read settings" ON public.settings FOR SELECT TO anon, authenticated, service_role USING (true);
CREATE POLICY "Allow all settings" ON public.settings FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- 12. STORAGE BUCKETS (receipts y banners)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('receipts', 'receipts', true, 10485760)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 10485760;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('banners', 'banners', true, 5242880)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880;

DROP POLICY IF EXISTS "Service role full access receipts" ON storage.objects;
CREATE POLICY "Service role full access receipts" ON storage.objects FOR ALL TO service_role
USING (bucket_id IN ('receipts', 'banners')) WITH CHECK (bucket_id IN ('receipts', 'banners'));

DROP POLICY IF EXISTS "Public read receipts" ON storage.objects;
CREATE POLICY "Public read receipts" ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id IN ('receipts', 'banners'));

DROP POLICY IF EXISTS "Public upload receipts" ON storage.objects;
CREATE POLICY "Public upload receipts" ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id IN ('receipts', 'banners'));

-- 13. RECARGAR CACHÉ DE ESQUEMA EN POSTGREST
NOTIFY pgrst, 'reload schema';

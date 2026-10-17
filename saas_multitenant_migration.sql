-- ==============================================================================
-- MIGRACIÓN SAAS & MULTI-TENANCY: BINGO LITE
-- Habilita soporte para múltiples organizaciones, empresas y salas de bingo
-- independientes (White-label / Multi-inquilino) dentro de la misma infraestructura.
-- ==============================================================================

-- 1. CREACIÓN DE LA TABLA DE TENANTS / ORGANIZACIONES
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Asegurar columnas de seguridad si la tabla ya existía
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS access_code VARCHAR(32) DEFAULT 'BINGO2026';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS admin_email TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS admin_password TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS admin_name TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- 2. REGISTRAR EL TENANT POR DEFECTO Y LA SALA BINGO LITE
INSERT INTO public.tenants (id, name, slug, subdomain, access_code, max_cards_per_game)
VALUES 
    ('default', 'Bingo Lite Principal', 'default', 'bingolite', 'LITE777', 20000),
    ('bingo-lite', 'Bingo Lite Oficial', 'bingo-lite', 'oficial', 'LITE777', 20000)
ON CONFLICT (id) DO UPDATE SET 
    slug = EXCLUDED.slug, 
    name = EXCLUDED.name,
    access_code = EXCLUDED.access_code;

-- 3. AÑADIR TENANT_ID A LAS TABLAS PRINCIPALES (RETROCOMPATIBLE CON DATOS ACTUALES)
DO $$
BEGIN
    -- Tabla: game
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'game' AND column_name = 'tenant_id') THEN
        ALTER TABLE public.game ADD COLUMN tenant_id VARCHAR(64) DEFAULT 'default' REFERENCES public.tenants(id) ON DELETE CASCADE;
    END IF;

    -- Tabla: players
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'players' AND column_name = 'tenant_id') THEN
        ALTER TABLE public.players ADD COLUMN tenant_id VARCHAR(64) DEFAULT 'default' REFERENCES public.tenants(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'players' AND column_name = 'email') THEN
        ALTER TABLE public.players ADD COLUMN email TEXT;
    END IF;

    -- Tabla: cards
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cards' AND column_name = 'tenant_id') THEN
        ALTER TABLE public.cards ADD COLUMN tenant_id VARCHAR(64) DEFAULT 'default' REFERENCES public.tenants(id) ON DELETE CASCADE;
    END IF;

    -- Tabla: wallets
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'tenant_id') THEN
        ALTER TABLE public.wallets ADD COLUMN tenant_id VARCHAR(64) DEFAULT 'default' REFERENCES public.tenants(id) ON DELETE CASCADE;
    END IF;

    -- Tabla: wallet_transactions
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallet_transactions' AND column_name = 'tenant_id') THEN
        ALTER TABLE public.wallet_transactions ADD COLUMN tenant_id VARCHAR(64) DEFAULT 'default' REFERENCES public.tenants(id) ON DELETE CASCADE;
    END IF;

    -- Tabla: sellers
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sellers' AND column_name = 'tenant_id') THEN
        ALTER TABLE public.sellers ADD COLUMN tenant_id VARCHAR(64) DEFAULT 'default' REFERENCES public.tenants(id) ON DELETE CASCADE;
    END IF;

    -- Tabla: settings
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'tenant_id') THEN
        ALTER TABLE public.settings ADD COLUMN tenant_id VARCHAR(64) DEFAULT 'default' REFERENCES public.tenants(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. ÍNDICES COMPUESTOS DE ALTO RENDIMIENTO (OPTIMIZADOS PARA 20.000+ CARTONES POR TENANT)
CREATE INDEX IF NOT EXISTS idx_cards_tenant_game ON public.cards(tenant_id, game_id);
CREATE INDEX IF NOT EXISTS idx_game_tenant_status ON public.game(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_players_tenant_phone ON public.players(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_wallets_tenant_phone ON public.wallets(tenant_id, phone);

-- 5. HABILITAR RLS PARA TENANTS Y BLINDAR COLUMNAS SENSIBLES
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read tenants" ON public.tenants;
DROP POLICY IF EXISTS "Public read tenants safe" ON public.tenants;

-- REGLA DE MÁXIMA SEGURIDAD:
-- Revocar lectura y modificación de admin_password y admin_email a usuarios anónimos y autenticados públicos
REVOKE ALL ON public.tenants FROM anon, authenticated;
-- Otorgar SELECT únicamente sobre columnas públicas no sensibles para la interfaz de los jugadores
GRANT SELECT (id, name, slug, subdomain, custom_domain, logo_url, banner_url, primary_color, plan, is_active, access_code, max_cards_per_game, contact_phone, created_at) ON public.tenants TO anon, authenticated;

CREATE POLICY "Public read tenants safe" ON public.tenants FOR SELECT USING (true);

-- 6. AISLAMIENTO ESTRICTO DE USUARIOS Y BILLETERAS POR SALA (TENANT)
-- Asegura que un jugador con el mismo teléfono pueda pertenecer a diferentes salas
-- de forma 100% independiente, sin cruzar saldos de billeteras, historial ni cartones.
DO $$
BEGIN
    -- Tabla players: eliminar restricción única global por teléfono si existe
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'players_phone_key' 
        AND conrelid = 'public.players'::regclass
    ) THEN
        ALTER TABLE public.players DROP CONSTRAINT players_phone_key;
    END IF;

    -- Agregar restricción compuesta única por tenant y teléfono
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'players_tenant_phone_unique' 
        AND conrelid = 'public.players'::regclass
    ) THEN
        ALTER TABLE public.players ADD CONSTRAINT players_tenant_phone_unique UNIQUE (tenant_id, phone);
    END IF;

    -- Tabla wallets: eliminar restricción única global si existe
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'wallets_phone_key' 
        AND conrelid = 'public.wallets'::regclass
    ) THEN
        ALTER TABLE public.wallets DROP CONSTRAINT wallets_phone_key;
    END IF;

    -- Agregar restricción única en wallets por tenant y teléfono
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'wallets_tenant_phone_unique' 
        AND conrelid = 'public.wallets'::regclass
    ) THEN
        ALTER TABLE public.wallets ADD CONSTRAINT wallets_tenant_phone_unique UNIQUE (tenant_id, phone);
    END IF;
END $$;

-- 7. REFUERZO DE SEGURIDAD EN BASE DE DATOS CONTRA VULNERABILIDADES
-- Bloquear cualquier INSERT, UPDATE o DELETE directo desde clientes anónimos hacia tablas críticas
-- El backend (service_role) mantiene control absoluto sobre estas operaciones seguras
REVOKE INSERT, UPDATE, DELETE ON public.game FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.cards FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wallets FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wallet_transactions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.settings FROM anon, authenticated;

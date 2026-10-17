-- =========================================================================
-- MIGRACIÓN SUPABASE: ACTUALIZACIÓN COMPLETA DE TABLAS Y CAMPOS
-- Puede copiarse y ejecutarse directamente en el SQL Editor de Supabase.
-- Es 100% segura (idempotente) y no borra ni sobreescribe datos existentes.
-- =========================================================================

-- 1. TABLA: wallet_transactions (Historial de transacciones y recargas de billetera)
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id BIGSERIAL PRIMARY KEY,
    player_phone TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'other', -- 'recharge', 'purchase', 'prize', 'other', 'recharge_request'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_phone ON public.wallet_transactions (player_phone);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON public.wallet_transactions (type);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to wallet_transactions" ON public.wallet_transactions;
CREATE POLICY "Allow all access to wallet_transactions" ON public.wallet_transactions FOR ALL USING (true);


-- 2. TABLA: players (Nuevos campos agregados para aprobaciones y sistema de referidos)
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS seller_code TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS referred_by_player_code TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_players_phone ON public.players (phone);
CREATE INDEX IF NOT EXISTS idx_players_referral ON public.players (referral_code);
CREATE INDEX IF NOT EXISTS idx_players_referred ON public.players (referred_by_player_code);


-- 3. TABLA: game (Nuevos campos de transmisión y modalidad gratuita)
ALTER TABLE public.game ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT false;
ALTER TABLE public.game ADD COLUMN IF NOT EXISTS stream_id TEXT;
ALTER TABLE public.game ADD COLUMN IF NOT EXISTS stream_active BOOLEAN DEFAULT false;


-- 4. TABLA: game_patterns (Nuevos campos para gestión de pago de premios)
ALTER TABLE public.game_patterns ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE public.game_patterns ADD COLUMN IF NOT EXISTS rejection_reason TEXT;


-- 5. TABLA: cards (Campos e índices de optimización)
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS player_phone TEXT;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS lottery_code TEXT;
CREATE INDEX IF NOT EXISTS idx_cards_game_player ON public.cards (game_id, player_id);


-- 6. TABLA: sellers (Vendedores y promotores de cartones)
CREATE TABLE IF NOT EXISTS public.sellers (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    code TEXT UNIQUE NOT NULL,
    commission_percentage NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to sellers" ON public.sellers;
CREATE POLICY "Allow all access to sellers" ON public.sellers FOR ALL USING (true);


-- 7. TABLAS AUXILIARES (Para asegurar eliminación en cascada limpia de jugadores)
CREATE TABLE IF NOT EXISTS public.receipts (
    id BIGSERIAL PRIMARY KEY,
    player_phone TEXT,
    url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to receipts" ON public.receipts;
CREATE POLICY "Allow all access to receipts" ON public.receipts FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS public.bingo_claims (
    id BIGSERIAL PRIMARY KEY,
    player_phone TEXT,
    card_number TEXT,
    game_id BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.bingo_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to bingo_claims" ON public.bingo_claims;
CREATE POLICY "Allow all access to bingo_claims" ON public.bingo_claims FOR ALL USING (true);


-- 8. TABLA: ai_presets (Campos de voz y audio base64 para anuncios personalizados de IA)
ALTER TABLE public.ai_presets ADD COLUMN IF NOT EXISTS voice TEXT;
ALTER TABLE public.ai_presets ADD COLUMN IF NOT EXISTS audio_base64 TEXT;


-- 9. TABLA: lottery_numbers_in_play (Módulo de sorteo de lotería nocturna)
CREATE TABLE IF NOT EXISTS public.lottery_numbers_in_play (
    id BIGSERIAL PRIMARY KEY,
    player_id BIGINT REFERENCES public.players(id) ON DELETE CASCADE,
    game_id BIGINT REFERENCES public.game(id) ON DELETE CASCADE,
    lottery_code TEXT,
    card_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.lottery_numbers_in_play ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to lottery_numbers_in_play" ON public.lottery_numbers_in_play;
CREATE POLICY "Allow all access to lottery_numbers_in_play" ON public.lottery_numbers_in_play FOR ALL USING (true);

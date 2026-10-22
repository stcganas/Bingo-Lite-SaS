-- Limpiar tablas existentes (opcional, comentar si no se desea borrar datos)
-- DROP TABLE IF EXISTS public.wallet_activations CASCADE;
-- DROP TABLE IF EXISTS public.wallets CASCADE;
-- DROP TABLE IF EXISTS public.settings CASCADE;
-- DROP TABLE IF EXISTS public.cards CASCADE;
-- DROP TABLE IF EXISTS public.game_patterns CASCADE;
-- DROP TABLE IF EXISTS public.players CASCADE;
-- DROP TABLE IF EXISTS public.patterns CASCADE;
-- DROP TABLE IF EXISTS public.game CASCADE;

-- Tabla para almacenar los juegos de bingo
CREATE TABLE IF NOT EXISTS public.game (
    id BIGSERIAL PRIMARY KEY,
    name TEXT,
    start_time TIMESTAMP WITH TIME ZONE,
    prize TEXT,
    card_value NUMERIC,
    status TEXT NOT NULL DEFAULT 'waiting', -- 'waiting', 'playing', 'paused', 'finished', 'scheduled'
    drawn_balls JSONB DEFAULT '[]',
    current_ball INTEGER,
    final_note TEXT,
    is_free BOOLEAN DEFAULT false,
    stream_id TEXT,
    stream_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabla para los patrones de bingo (ej. "Cartón Lleno", "Línea Horizontal")
CREATE TABLE IF NOT EXISTS public.patterns (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    grid JSONB NOT NULL, -- Matriz 5x5 de booleanos
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabla para los jugadores registrados
CREATE TABLE IF NOT EXISTS public.players (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    state TEXT,
    city TEXT,
    card_count INTEGER DEFAULT 0,
    receipt_url TEXT, -- Almacena un JSON string con el historial de comprobantes
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    is_blocked BOOLEAN DEFAULT false,
    seller_code TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabla que asocia patrones a un juego específico y registra ganadores
CREATE TABLE IF NOT EXISTS public.game_patterns (
    id BIGSERIAL PRIMARY KEY,
    game_id BIGINT REFERENCES public.game(id) ON DELETE CASCADE,
    pattern_id BIGINT REFERENCES public.patterns(id) ON DELETE CASCADE,
    prize TEXT,
    winner_player_id BIGINT REFERENCES public.players(id),
    winner_card_number TEXT,
    won_at TIMESTAMP WITH TIME ZONE,
    payment_status TEXT DEFAULT 'pending', -- 'pending', 'paid', 'rejected'
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabla para los cartones de bingo generados para cada jugador
CREATE TABLE IF NOT EXISTS public.cards (
    id BIGSERIAL PRIMARY KEY,
    player_id BIGINT REFERENCES public.players(id) ON DELETE CASCADE,
    game_id BIGINT REFERENCES public.game(id) ON DELETE CASCADE,
    player_phone TEXT,
    card_number TEXT NOT NULL,
    lottery_code TEXT,
    b INTEGER[] NOT NULL,
    i INTEGER[] NOT NULL,
    n INTEGER[] NOT NULL,
    g INTEGER[] NOT NULL,
    o INTEGER[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabla para almacenar configuraciones generales (como ajustes por juego)
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Tabla para almacenar el saldo de la billetera de los jugadores
CREATE TABLE IF NOT EXISTS public.wallets (
    phone TEXT PRIMARY KEY,
    balance NUMERIC NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabla para transacciones e historial de la billetera digital (recargas, compras, premios, etc.)
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id BIGSERIAL PRIMARY KEY,
    player_phone TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'other', -- 'recharge', 'purchase', 'prize', 'other', 'recharge_request'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabla para registrar qué jugadores han activado su billetera en qué juego
CREATE TABLE IF NOT EXISTS public.wallet_activations (
    phone TEXT NOT NULL,
    game_id BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (phone, game_id)
);

-- Tabla para promotores / vendedores de cartones
CREATE TABLE IF NOT EXISTS public.sellers (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    code TEXT UNIQUE NOT NULL,
    commission_percentage NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.game ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad RLS blindadas
-- Las operaciones de escritura y mutación crítica se reservan al backend (Service Role Key).
-- Solo se otorga SELECT público a los datos indispensables para la experiencia de juego en vivo.

DROP POLICY IF EXISTS "Allow all access to game" ON public.game;
CREATE POLICY "Public read game" ON public.game FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all access to patterns" ON public.patterns;
CREATE POLICY "Public read patterns" ON public.patterns FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all access to game_patterns" ON public.game_patterns;
CREATE POLICY "Public read game_patterns" ON public.game_patterns FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all access to players" ON public.players;
-- Jugadores: Modificaciones y consultas sensibles restringidas al backend

DROP POLICY IF EXISTS "Allow all access to cards" ON public.cards;
CREATE POLICY "Public read cards" ON public.cards FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all access to settings" ON public.settings;
CREATE POLICY "Public read settings" ON public.settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all access to wallets" ON public.wallets;
DROP POLICY IF EXISTS "Service role full access to wallets" ON public.wallets;
-- Wallets: Mutaciones directas desde el cliente web bloqueadas; acceso completo reservado al backend (service_role)
CREATE POLICY "Service role full access to wallets" ON public.wallets FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to wallet_transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Service role full access to wallet_transactions" ON public.wallet_transactions;
-- Wallet Transactions: Mutaciones directas desde el cliente web bloqueadas; acceso completo reservado al backend (service_role)
CREATE POLICY "Service role full access to wallet_transactions" ON public.wallet_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to wallet_activations" ON public.wallet_activations;
DROP POLICY IF EXISTS "Service role full access to wallet_activations" ON public.wallet_activations;
CREATE POLICY "Service role full access to wallet_activations" ON public.wallet_activations FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to sellers" ON public.sellers;
CREATE POLICY "Public read sellers" ON public.sellers FOR SELECT USING (true);

-- Tabla para las notificaciones internas
CREATE TABLE IF NOT EXISTS public.notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL, -- UID del admin o Teléfono del jugador
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to notifications" ON public.notifications;
CREATE POLICY "Public read notifications" ON public.notifications FOR SELECT USING (true);

-- Tabla para almacenar plantillas de anuncios de voz de IA personalizados creados por el administrador
CREATE TABLE IF NOT EXISTS public.ai_presets (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.ai_presets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to ai_presets" ON public.ai_presets;
CREATE POLICY "Allow all access to ai_presets" ON public.ai_presets FOR ALL USING (true);

-- Tabla para registrar invitaciones/regalos de cartones que hacen los jugadores a otros números de WhatsApp
CREATE TABLE IF NOT EXISTS public.gift_invitations (
    id BIGSERIAL PRIMARY KEY,
    sender_phone TEXT NOT NULL,
    recipient_phone TEXT NOT NULL,
    game_id BIGINT REFERENCES public.game(id) ON DELETE SET NULL,
    card_count INTEGER DEFAULT 1,
    status TEXT DEFAULT 'pending', -- 'pending', 'claimed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Asegurar columnas si la tabla ya existía previamente
ALTER TABLE public.gift_invitations ADD COLUMN IF NOT EXISTS game_id BIGINT REFERENCES public.game(id) ON DELETE SET NULL;
ALTER TABLE public.gift_invitations ADD COLUMN IF NOT EXISTS card_count INTEGER DEFAULT 1;

-- Índices para optimizar la consulta de regalos y el contador en la lista de jugadores
CREATE INDEX IF NOT EXISTS idx_gift_invitations_sender_phone ON public.gift_invitations(sender_phone);
CREATE INDEX IF NOT EXISTS idx_gift_invitations_status ON public.gift_invitations(status);
CREATE INDEX IF NOT EXISTS idx_gift_invitations_recipient ON public.gift_invitations(recipient_phone);
CREATE INDEX IF NOT EXISTS idx_gift_invitations_game_id ON public.gift_invitations(game_id);

ALTER TABLE public.gift_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to gift_invitations" ON public.gift_invitations;
CREATE POLICY "Allow all access to gift_invitations" ON public.gift_invitations FOR ALL USING (true) WITH CHECK (true);

-- Tabla para almacenar los números de cartón guardados para participar en el sorteo de lotería
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

-- Insertar algunos patrones básicos por defecto
INSERT INTO public.patterns (name, grid) VALUES 
('Cartón Lleno', '[[true,true,true,true,true],[true,true,true,true,true],[true,true,true,true,true],[true,true,true,true,true],[true,true,true,true,true]]'),
('Línea Horizontal Central', '[[false,false,false,false,false],[false,false,false,false,false],[true,true,true,true,true],[false,false,false,false,false],[false,false,false,false,false]]'),
('Cuatro Esquinas', '[[true,false,false,false,true],[false,false,false,false,false],[false,false,false,false,false],[false,false,false,false,false],[true,false,false,false,true]]'),
('Letra X', '[[true,false,false,false,true],[false,true,false,true,false],[false,false,true,false,false],[false,true,false,true,false],[true,false,false,false,true]]');

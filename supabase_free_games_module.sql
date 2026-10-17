-- ==============================================================
-- MÓDULO: TABLA DE GANADORES, PREMIOS Y GRAN META ($300.000 COP)
--         Y CONTADOR DE 30 JUEGOS PAGOS (BINGO LITE)
-- ==============================================================
-- Instrucciones:
-- 1. Abre el panel de tu proyecto en Supabase (https://supabase.com/dashboard).
-- 2. Dirígete a la sección "SQL Editor" en el menú lateral izquierdo.
-- 3. Haz clic en "New query", pega todo este script y pulsa "Run" (Ejecutar).
-- ==============================================================

-- 1. TABLA: Registro detallado de cada premio ganado en Juegos Gratuitos
CREATE TABLE IF NOT EXISTS public.free_game_prizes (
    id BIGSERIAL PRIMARY KEY,
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
    source VARCHAR(20) NOT NULL DEFAULT 'automatic', -- 'automatic' (sistema) o 'manual' (administrador)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para velocidad y optimización de consultas
CREATE INDEX IF NOT EXISTS idx_free_game_prizes_player_id ON public.free_game_prizes(player_id);
CREATE INDEX IF NOT EXISTS idx_free_game_prizes_won_at ON public.free_game_prizes(won_at DESC);
CREATE INDEX IF NOT EXISTS idx_free_game_prizes_game_id ON public.free_game_prizes(game_id);

-- 2. TABLA: Contador de participación en Juegos Pagos (Para calificar a la Gran Meta de 30 juegos)
CREATE TABLE IF NOT EXISTS public.player_paid_game_participations (
    id BIGSERIAL PRIMARY KEY,
    player_id BIGINT NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    game_id BIGINT NOT NULL REFERENCES public.game(id) ON DELETE CASCADE,
    cards_count INTEGER NOT NULL DEFAULT 1,
    participated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_player_paid_game UNIQUE (player_id, game_id)
);

-- Índices para el contador de participaciones
CREATE INDEX IF NOT EXISTS idx_paid_game_part_player ON public.player_paid_game_participations(player_id);
CREATE INDEX IF NOT EXISTS idx_paid_game_part_game ON public.player_paid_game_participations(game_id);

-- 3. CAMPOS ADICIONALES: Asegurar columnas en la tabla 'players'
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'players' AND column_name = 'paid_games_count') THEN
        ALTER TABLE public.players ADD COLUMN paid_games_count INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'players' AND column_name = 'free_games_total_won') THEN
        ALTER TABLE public.players ADD COLUMN free_games_total_won NUMERIC(12, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'players' AND column_name = 'is_grand_prize_eligible') THEN
        ALTER TABLE public.players ADD COLUMN is_grand_prize_eligible BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 4. SEGURIDAD: Políticas RLS (Row Level Security) para acceso seguro
ALTER TABLE public.free_game_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_paid_game_participations ENABLE ROW LEVEL SECURITY;

-- Lectura pública (para que jugadores y administradores consulten la tabla de clasificación)
DROP POLICY IF EXISTS "Permitir lectura publica de premios gratis" ON public.free_game_prizes;
CREATE POLICY "Permitir lectura publica de premios gratis" 
ON public.free_game_prizes FOR SELECT USING (true);

-- Permisos de escritura y gestión para el servidor y administrador
DROP POLICY IF EXISTS "Permitir gestion total a servicio de premios gratis" ON public.free_game_prizes;
CREATE POLICY "Permitir gestion total a servicio de premios gratis" 
ON public.free_game_prizes FOR ALL USING (true) WITH CHECK (true);

-- Lectura pública de participaciones pagas
DROP POLICY IF EXISTS "Permitir lectura publica de participaciones pagas" ON public.player_paid_game_participations;
CREATE POLICY "Permitir lectura publica de participaciones pagas" 
ON public.player_paid_game_participations FOR SELECT USING (true);

-- Permisos de escritura y gestión de participaciones
DROP POLICY IF EXISTS "Permitir gestion total a servicio de participaciones pagas" ON public.player_paid_game_participations;
CREATE POLICY "Permitir gestion total a servicio de participaciones pagas" 
ON public.player_paid_game_participations FOR ALL USING (true) WITH CHECK (true);

-- 5. VISTA SQL: Resumen de Clasificación y Estado hacia los 30 Juegos (Opcional para consultas directas)
CREATE OR REPLACE VIEW public.v_free_games_leaderboard AS
SELECT 
    p.id AS player_id,
    p.name AS player_name,
    p.phone AS player_phone,
    COALESCE(SUM(fgp.prize_amount), 0) AS total_won,
    COUNT(fgp.id) AS prizes_count,
    COALESCE(part.paid_games_count, 0) AS paid_games_count,
    30 AS paid_games_required,
    LEAST(100, ROUND((COALESCE(part.paid_games_count, 0)::numeric / 30.0) * 100)) AS paid_games_progress,
    GREATEST(0, 30 - COALESCE(part.paid_games_count, 0)) AS paid_games_remaining,
    (COALESCE(part.paid_games_count, 0) >= 30) AS is_eligible,
    LEAST(100, ROUND((COALESCE(SUM(fgp.prize_amount), 0)::numeric / 300000.0) * 100)) AS goal_progress_percent,
    GREATEST(0, 300000 - COALESCE(SUM(fgp.prize_amount), 0)) AS goal_remaining_amount,
    (COALESCE(SUM(fgp.prize_amount), 0) >= 300000) AS reached_goal,
    MAX(fgp.won_at) AS latest_win_at
FROM public.players p
LEFT JOIN public.free_game_prizes fgp ON p.id = fgp.player_id
LEFT JOIN (
    SELECT player_id, COUNT(DISTINCT game_id) AS paid_games_count 
    FROM public.player_paid_game_participations 
    GROUP BY player_id
) part ON p.id = part.player_id
GROUP BY p.id, p.name, p.phone, part.paid_games_count
HAVING COALESCE(SUM(fgp.prize_amount), 0) > 0 OR COALESCE(part.paid_games_count, 0) > 0
ORDER BY total_won DESC, latest_win_at ASC;

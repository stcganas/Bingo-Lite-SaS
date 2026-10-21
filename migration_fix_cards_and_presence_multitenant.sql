-- ==============================================================================
-- MIGRACIÓN: CORRECCIÓN DE TENANT DEFAULTS Y FOREIGN KEYS EN CARDS Y LOTTERY
-- FECHA: 2026-10-21
-- DESCRIPCIÓN:
-- 1. Actualiza el valor por defecto de tenant_id en la tabla 'cards' y 'lottery_numbers_in_play'
--    a 'bingo-lite' (o nulo) para evitar violaciones de clave foránea con 'default'.
-- 2. Asegura que cualquier fila en cards con tenant_id 'default' o nulo sea migrada a la sala correspondiente.
-- ==============================================================================

DO $$
BEGIN
    -- 1. Actualizar el DEFAULT de tenant_id en la tabla 'cards'
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'cards' 
          AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE public.cards ALTER COLUMN tenant_id SET DEFAULT 'bingo-lite';
    END IF;

    -- 2. Actualizar el DEFAULT de tenant_id en 'lottery_numbers_in_play' si existe
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'lottery_numbers_in_play' 
          AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE public.lottery_numbers_in_play ALTER COLUMN tenant_id SET DEFAULT 'bingo-lite';
    END IF;

    -- 3. Actualizar el DEFAULT de tenant_id en 'players' si existe
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'players' 
          AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE public.players ALTER COLUMN tenant_id SET DEFAULT 'bingo-lite';
    END IF;

    -- 4. Actualizar el DEFAULT de tenant_id en 'game' si existe
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'game' 
          AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE public.game ALTER COLUMN tenant_id SET DEFAULT 'bingo-lite';
    END IF;

    -- 5. Curar filas huérfanas en cards que tengan tenant_id 'default' asociándolas al tenant de su juego
    UPDATE public.cards c
    SET tenant_id = COALESCE(g.tenant_id, 'bingo-lite')
    FROM public.game g
    WHERE c.game_id = g.id AND (c.tenant_id = 'default' OR c.tenant_id IS NULL);

    -- 6. Curar jugadores con tenant_id 'default'
    UPDATE public.players
    SET tenant_id = 'demo'
    WHERE tenant_id = 'default';

    RAISE NOTICE 'Migración completada con éxito. Valores por defecto ajustados a bingo-lite y demo.';
END $$;

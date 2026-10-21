-- ============================================================================
-- MIGRACIÓN: SEPARACIÓN DE SALA DEMO Y SALA OFICIAL BINGO LITE
-- ============================================================================
-- 1. Sala Oficial: 'bingo-lite' (LITE777)
-- 2. Sala Demo Visitantes: 'demo' (DEMO2026)
-- Elimina la sala duplicada/ambigua 'default' y aísla completamente los tenants.

-- 1. Asegurar tenant bingo-lite (Oficial)
INSERT INTO public.tenants (
    id, name, slug, subdomain, access_code, primary_color, plan, notes, is_active, max_cards_per_game
) VALUES (
    'bingo-lite',
    'Bingo Lite Oficial',
    'bingo-lite',
    'bingo-lite',
    'LITE777',
    '#2563eb',
    'pro',
    'Sala oficial de Bingo en Vivo con sorteos continuos y premios garantizados.',
    true,
    20000
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    access_code = EXCLUDED.access_code,
    primary_color = EXCLUDED.primary_color,
    plan = EXCLUDED.plan,
    notes = EXCLUDED.notes,
    is_active = true,
    max_cards_per_game = EXCLUDED.max_cards_per_game;

-- 2. Asegurar tenant demo (Sala interactiva para visitantes)
INSERT INTO public.tenants (
    id, name, slug, subdomain, access_code, primary_color, plan, notes, is_active, max_cards_per_game
) VALUES (
    'demo',
    'Sala Demo Visitantes',
    'demo',
    'demo',
    'DEMO2026',
    '#7c3aed',
    'trial',
    'Sala interactiva de demostración para visitantes y nuevos organizadores. Prueba el juego en vivo y las dinámicas.',
    true,
    2000
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    access_code = EXCLUDED.access_code,
    primary_color = EXCLUDED.primary_color,
    plan = EXCLUDED.plan,
    notes = EXCLUDED.notes,
    is_active = true,
    max_cards_per_game = EXCLUDED.max_cards_per_game;

-- 3. Migrar registros que aún estuviesen referenciados a 'default' hacia 'demo'
UPDATE public.patterns SET tenant_id = 'demo' WHERE tenant_id = 'default';
UPDATE public.settings SET tenant_id = 'demo' WHERE tenant_id = 'default';
UPDATE public.game SET tenant_id = 'demo' WHERE tenant_id = 'default';
UPDATE public.players SET tenant_id = 'demo' WHERE tenant_id = 'default';
UPDATE public.cards SET tenant_id = 'demo' WHERE tenant_id = 'default';
UPDATE public.wallets SET tenant_id = 'demo' WHERE tenant_id = 'default';

-- 4. Eliminar el registro ambiguo 'default' si existe en la tabla tenants
DELETE FROM public.tenants WHERE id = 'default';

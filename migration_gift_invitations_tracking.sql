-- ==============================================================================
-- MIGRACIÓN: Rastreo Avanzado de Invitaciones y Cartones de Cortesía
-- Tabla: public.gift_invitations (Multi-Tenant)
-- ==============================================================================

-- 1. Asegurar columnas de auditoría y rastreo multitenant en gift_invitations
ALTER TABLE public.gift_invitations ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'bingo-lite';
ALTER TABLE public.gift_invitations ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE public.gift_invitations ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.gift_invitations ADD COLUMN IF NOT EXISTS claimed_by_phone TEXT;
ALTER TABLE public.gift_invitations ADD COLUMN IF NOT EXISTS claimed_by_name TEXT;

-- 2. Asegurar que las invitaciones existentes tengan tenant_id válido
UPDATE public.gift_invitations 
SET tenant_id = 'bingo-lite' 
WHERE tenant_id IS NULL OR tenant_id = '' OR tenant_id = 'default';

-- 3. Índices de alto rendimiento para filtros multi-tenant y búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_gift_invitations_tenant ON public.gift_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gift_invitations_status ON public.gift_invitations(status);
CREATE INDEX IF NOT EXISTS idx_gift_invitations_claimed_at ON public.gift_invitations(claimed_at);
CREATE INDEX IF NOT EXISTS idx_gift_invitations_claimed_phone ON public.gift_invitations(claimed_by_phone);
CREATE INDEX IF NOT EXISTS idx_gift_invitations_sender_phone ON public.gift_invitations(sender_phone);
CREATE INDEX IF NOT EXISTS idx_gift_invitations_game_id ON public.gift_invitations(game_id);

-- 4. Notificar a PostgREST para recargar el esquema de columnas inmediatamente
DO $$
BEGIN
    PERFORM pg_notify('pgrst', 'reload schema');
EXCEPTION WHEN OTHERS THEN
    -- Ignorar si pg_notify no está disponible en el contexto
    NULL;
END $$;

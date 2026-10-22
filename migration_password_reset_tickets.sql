-- ==============================================================================
-- MIGRACIÓN: Tabla de Tickets de Recuperación de Contraseña
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.password_reset_tickets (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'bingo-lite',
    phone TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'resolved', 'cancelled'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_password_reset_tickets_tenant ON public.password_reset_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tickets_phone ON public.password_reset_tickets(phone);
CREATE INDEX IF NOT EXISTS idx_password_reset_tickets_status ON public.password_reset_tickets(status);

-- Habilitar RLS
ALTER TABLE public.password_reset_tickets ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad
DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow public insert on password_reset_tickets" ON public.password_reset_tickets;
    CREATE POLICY "Allow public insert on password_reset_tickets" ON public.password_reset_tickets FOR INSERT WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow select on password_reset_tickets" ON public.password_reset_tickets;
    CREATE POLICY "Allow select on password_reset_tickets" ON public.password_reset_tickets FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Allow update on password_reset_tickets" ON public.password_reset_tickets;
    CREATE POLICY "Allow update on password_reset_tickets" ON public.password_reset_tickets FOR UPDATE USING (true);
END $$;

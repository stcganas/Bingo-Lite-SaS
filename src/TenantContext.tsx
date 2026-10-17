import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { apiFetch } from './utils/api';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  subdomain?: string;
  logo_url?: string;
  banner_url?: string;
  primary_color: string;
  plan: string;
  access_code?: string;
  description?: string;
  max_cards_per_game: number;
}

const DEFAULT_TENANT: Tenant = {
  id: 'bingo-lite',
  name: 'Bingo Lite Oficial',
  slug: 'bingo-lite',
  primary_color: '#2563eb',
  plan: 'pro',
  access_code: 'LITE777',
  description: 'Sala oficial de Bingo en Vivo con sorteos continuos y premios garantizados.',
  max_cards_per_game: 20000
};

interface TenantContextType {
  tenant: Tenant;
  tenantSlug: string | null;
  tenantPrefix: string; // Devuelve "/sala/slug" o ""
  loading: boolean;
}

const TenantContext = createContext<TenantContextType>({
  tenant: DEFAULT_TENANT,
  tenantSlug: null,
  tenantPrefix: '',
  loading: false
});

export const useTenant = () => useContext(TenantContext);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [tenant, setTenant] = useState<Tenant>(DEFAULT_TENANT);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Detectar si la URL comienza con /sala/:slug
    const match = location.pathname.match(/^\/sala\/([a-zA-Z0-9_-]+)/);
    const slug = match ? match[1].toLowerCase() : null;
    
    setTenantSlug(slug);

    if (slug) {
      setLoading(true);
      apiFetch(`/api/tenant/info?slug=${encodeURIComponent(slug)}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.id) {
            setTenant(data);
            // Actualizar título de la pestaña con el nombre de la sala
            document.title = `${data.name} | Bingo en Vivo Online`;
          } else {
            setTenant({ ...DEFAULT_TENANT, name: slug.replace(/-/g, ' ').toUpperCase(), slug });
          }
        })
        .catch(err => {
          console.warn('[TenantProvider] Error cargando sala:', err);
          setTenant({ ...DEFAULT_TENANT, name: slug.replace(/-/g, ' ').toUpperCase(), slug });
        })
        .finally(() => setLoading(false));
    } else {
      setTenant(DEFAULT_TENANT);
      document.title = 'Bingo Lite | Bingo Familiar, Bingo Colombia y Bingo Ganador';
    }
  }, [location.pathname]);

  const tenantPrefix = tenantSlug ? `/sala/${tenantSlug}` : '';

  return (
    <TenantContext.Provider value={{ tenant, tenantSlug, tenantPrefix, loading }}>
      {children}
    </TenantContext.Provider>
  );
};

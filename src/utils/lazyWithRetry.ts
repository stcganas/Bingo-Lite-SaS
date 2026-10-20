import React, { ComponentType } from 'react';

/**
 * Wrapper de React.lazy con reintento automático para solucionar fallos
 * de dynamic import cuando se despliega una nueva versión en producción
 * (ej. chunk hash mismatch / TypeError: Failed to fetch dynamically imported module).
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>,
  chunkName: string = 'component'
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    const pageHasBeenForceRefreshed = sessionStorage.getItem(`chunk_reload_${chunkName}`);

    try {
      const module = await componentImport();
      // Si la carga fue exitosa, limpiamos la bandera de recarga
      if (pageHasBeenForceRefreshed) {
        sessionStorage.removeItem(`chunk_reload_${chunkName}`);
      }
      return module;
    } catch (error: any) {
      console.warn(`[lazyWithRetry] Error al cargar chunk diferido "${chunkName}":`, error);

      const errorStr = (error?.message || error?.toString() || '').toLowerCase();
      const isChunkError = 
        errorStr.includes('failed to fetch dynamically imported module') ||
        errorStr.includes('error loading dynamically imported module') ||
        errorStr.includes('loading chunk') ||
        errorStr.includes('dynamically imported module') ||
        errorStr.includes('import call failed') ||
        errorStr.includes('networkerror');

      if (isChunkError && !pageHasBeenForceRefreshed) {
        // Marcamos que ya se recargó para evitar bucles infinitos
        sessionStorage.setItem(`chunk_reload_${chunkName}`, 'true');
        console.log(`[lazyWithRetry] Recargando página para sincronizar nueva versión de "${chunkName}"...`);
        window.location.reload();
        // Devolvemos una promesa pendiente para no romper el render antes del reload
        return new Promise(() => {});
      }

      // Si ya se recargó o es otro error, propagar el error hacia ErrorBoundary
      throw error;
    }
  });
}

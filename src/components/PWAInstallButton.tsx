import React, { useState } from 'react';
import { Download, Share, PlusSquare, CheckCircle, X, Loader2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useTenant } from '../TenantContext';
import toast from 'react-hot-toast';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'primary' | 'outline' | 'minimal';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ 
  className = '',
  variant = 'primary'
}) => {
  const { isInstallable, isInstalled, isIOS, isInstalling, install } = usePWAInstall();
  const { tenant, tenantSlug } = useTenant();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const displayAppName = tenantSlug && tenant?.name ? tenant.name : 'Bingo Lite';

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }

    const result = await install();
    if (result.success) {
      toast.success(`¡${displayAppName} se ha instalado con éxito!`, { id: 'pwa-btn-success', icon: '🎉' });
      return;
    }

    if (result.outcome === 'dismissed') {
      return;
    }

    if (result.error === 'no-prompt') {
      // Check if inside iframe
      const inIframe = window.self !== window.top;
      if (inIframe) {
        toast('Abre la app en pestaña completa para instalar directamente desde el botón.', {
          id: 'pwa-iframe-btn-msg',
          icon: 'ℹ️',
          duration: 5000
        });
      } else {
        toast('Preparando el instalador de la app... Intenta de nuevo en un segundo.', {
          id: 'pwa-btn-wait',
          icon: '⏳',
          duration: 3000
        });
      }
    }
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'outline':
        return 'border border-blue-500 text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950/30';
      case 'minimal':
        return 'text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30';
      case 'primary':
      default:
        return 'bg-amber-400 hover:bg-amber-300 text-amber-950 shadow-sm font-bold active:scale-95';
    }
  };

  return (
    <>
      <button
        onClick={handleInstall}
        disabled={isInstalling}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${getVariantStyles()} ${className}`}
        title="Instalar Bingo Lite directamente en tu dispositivo"
      >
        {isInstalling ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Instalando...</span>
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5" />
            <span>Instalar App</span>
          </>
        )}
      </button>

      {/* iOS Safari Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white relative">
            <button
              onClick={() => setShowIOSGuide(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={18} />
            </button>
            <div className="flex items-center gap-3 mb-3">
              <img src="/pwa-192x192.png" alt="Bingo Lite" className="w-10 h-10 rounded-xl" />
              <h3 className="text-base font-bold">Instalar en iPhone / iPad</h3>
            </div>
            
            <div className="space-y-2.5 my-4 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/40 p-2.5 rounded-xl">
                <Share className="text-blue-600 shrink-0 w-4 h-4" />
                <span>1. Pulsa el botón <strong>Compartir</strong> en Safari.</span>
              </div>
              <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl">
                <PlusSquare className="text-emerald-600 shrink-0 w-4 h-4" />
                <span>2. Selecciona <strong>"Agregar a pantalla de inicio"</strong>.</span>
              </div>
              <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/40 p-2.5 rounded-xl">
                <CheckCircle className="text-indigo-600 shrink-0 w-4 h-4" />
                <span>3. Pulsa <strong>Agregar</strong> arriba a la derecha.</span>
              </div>
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 py-2.5 text-xs font-bold text-white transition active:scale-95"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
};

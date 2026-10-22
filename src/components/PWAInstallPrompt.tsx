import React, { useState, useEffect } from 'react';
import { Download, X, Share, PlusSquare, CheckCircle, Loader2, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useTenant } from '../TenantContext';

export default function PWAInstallPrompt() {
  const { isInstallable, isInstalled, isIOS, isInstalling, install } = usePWAInstall();
  const { tenant, tenantSlug } = useTenant();
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isInsideIframe, setIsInsideIframe] = useState(false);

  const displayAppName = tenantSlug && tenant?.name ? tenant.name : 'Bingo Lite';
  const displayAppIcon = tenantSlug && tenant?.logo_url ? tenant.logo_url : '/pwa-192x192.png';
  const displayBadge = tenantSlug ? 'Sala Oficial' : 'App Oficial';

  useEffect(() => {
    // Detect if embedded in an iframe (e.g. preview environment)
    try {
      setIsInsideIframe(window.self !== window.top);
    } catch {
      setIsInsideIframe(true);
    }

    // Don't show if already installed
    if (isInstalled) {
      setShowPrompt(false);
      return;
    }

    // Check if dismissed in this session
    const dismissedThisSession = sessionStorage.getItem('bingo-pwa-banner-dismissed') === 'true';
    if (dismissedThisSession) {
      return;
    }

    // Show prompt after a short delay
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [isInstalled]);

  const handleInstallClick = async () => {
    // If on iOS, Safari requires the manual Share -> Add to Home screen action
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    // If inside an iframe, native beforeinstallprompt is blocked by browser sandbox policy
    if (isInsideIframe && !isInstallable) {
      toast(
        (t) => (
          <div className="flex flex-col gap-2">
            <span className="font-semibold text-sm">
              Para instalar directamente desde el botón, abre la app en ventana completa:
            </span>
            <button
              onClick={() => {
                toast.dismiss(t.id);
                window.open(window.location.href, '_blank');
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow"
            >
              <ExternalLink size={14} /> Abrir y pulsar Instalar
            </button>
          </div>
        ),
        { duration: 8000, id: 'pwa-iframe-notice' }
      );
      return;
    }

    // Trigger installation directly from button
    const result = await install();

    if (result.success) {
      setShowPrompt(false);
      toast.success(`¡${displayAppName} se ha instalado correctamente!`, { 
        id: 'pwa-install-success',
        icon: '🎉',
        duration: 5000 
      });
      return;
    }

    if (result.outcome === 'dismissed') {
      toast('Instalación cancelada', { id: 'pwa-install-dismissed', duration: 3000 });
      return;
    }

    // If prompt was not immediately available yet (e.g. still registering service worker)
    if (result.error === 'no-prompt') {
      toast('Preparando el instalador de la app... Pulsa de nuevo en un segundo.', {
        id: 'pwa-preparing-install',
        icon: '⏳',
        duration: 4000
      });
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    sessionStorage.setItem('bingo-pwa-banner-dismissed', 'true');
  };

  if (isInstalled) {
    return null;
  }

  return (
    <>
      <AnimatePresence>
        {showPrompt && !showIOSModal && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[999] w-[calc(100%-1.5rem)] max-w-lg"
          >
            <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white border border-blue-400/40 rounded-2xl shadow-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 backdrop-blur-md">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative shrink-0">
                  <img 
                    src={displayAppIcon} 
                    alt={displayAppName} 
                    className="w-11 h-11 rounded-xl shadow-md border border-white/20 object-cover bg-white" 
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/pwa-192x192.png';
                    }}
                  />
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-white text-sm sm:text-base leading-tight truncate">
                      Instalar {displayAppName}
                    </h3>
                    <span className="text-[10px] bg-amber-400 text-amber-950 font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                      {displayBadge}
                    </span>
                  </div>
                  <p className="text-xs text-blue-100/90 leading-snug line-clamp-1">
                    Acceso directo, sonido en vivo y juego a pantalla completa.
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleInstallClick}
                  disabled={isInstalling}
                  className="bg-amber-400 hover:bg-amber-300 disabled:opacity-75 text-amber-950 px-4 py-2 rounded-xl text-xs sm:text-sm font-black shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                  title="Instalar aplicación directamente"
                >
                  {isInstalling ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Instalando...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Instalar</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleDismiss}
                  className="p-1.5 text-blue-200 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                  aria-label="Cerrar aviso"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Safari only guide (Apple does not support programmatic prompt) */}
      <AnimatePresence>
        {showIOSModal && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white relative"
            >
              <button
                onClick={() => setShowIOSModal(false)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <img 
                  src={displayAppIcon} 
                  alt={displayAppName} 
                  className="w-12 h-12 rounded-2xl shadow-md border border-slate-200 dark:border-slate-700 object-cover bg-white" 
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/pwa-192x192.png';
                  }}
                />
                <div>
                  <h3 className="text-lg font-bold">Instalar en tu iPhone / iPad</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Instala <span className="font-bold text-blue-500 dark:text-blue-400">{displayAppName}</span> en 3 pasos:
                  </p>
                </div>
              </div>

              <div className="space-y-3.5 my-5 text-sm">
                <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-950/40 p-3 rounded-2xl border border-blue-100 dark:border-blue-900/50">
                  <div className="bg-blue-600 text-white p-2 rounded-xl shrink-0 mt-0.5">
                    <Share size={18} />
                  </div>
                  <div>
                    <p className="font-semibold text-blue-950 dark:text-blue-100">1. Toca el botón Compartir</p>
                    <p className="text-xs text-blue-800 dark:text-blue-300 mt-0.5">
                      En la barra inferior de Safari, pulsa el icono cuadrado con la flecha arriba.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-2xl border border-emerald-100 dark:border-emerald-900/50">
                  <div className="bg-emerald-600 text-white p-2 rounded-xl shrink-0 mt-0.5">
                    <PlusSquare size={18} />
                  </div>
                  <div>
                    <p className="font-semibold text-emerald-950 dark:text-emerald-100">2. "Agregar a pantalla de inicio"</p>
                    <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5">
                      Desplaza hacia abajo y selecciona <span className="font-bold">"Agregar a pantalla de inicio"</span>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-indigo-50 dark:bg-indigo-950/40 p-3 rounded-2xl border border-indigo-100 dark:border-indigo-900/50">
                  <div className="bg-indigo-600 text-white p-2 rounded-xl shrink-0 mt-0.5">
                    <CheckCircle size={18} />
                  </div>
                  <div>
                    <p className="font-semibold text-indigo-950 dark:text-indigo-100">3. Pulsa "Agregar"</p>
                    <p className="text-xs text-indigo-800 dark:text-indigo-300 mt-0.5">
                      Confirma arriba a la derecha. ¡El icono de Bingo Lite quedará instalado en tu inicio!
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setShowIOSModal(false);
                  setShowPrompt(false);
                }}
                className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-2xl font-bold text-sm shadow-lg transition active:scale-98"
              >
                Entendido
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

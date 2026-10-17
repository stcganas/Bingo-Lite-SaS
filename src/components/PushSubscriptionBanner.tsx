import React, { useState, useEffect } from 'react';
import { BellRing, CheckCircle2, X, Sparkles, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { promptPushPermission, getSubscriptionStatus, sendTestNotification } from '../lib/onesignal';
import { useAuth } from '../AuthContext';
import toast from 'react-hot-toast';

interface PushSubscriptionBannerProps {
  forceShow?: boolean;
  onSubscribed?: () => void;
  className?: string;
  variant?: 'card' | 'floating' | 'banner';
}

export default function PushSubscriptionBanner({
  forceShow = false,
  onSubscribed,
  className = '',
  variant = 'banner'
}: PushSubscriptionBannerProps) {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  useEffect(() => {
    // Check if dismissed in this session
    const dismissedSession = sessionStorage.getItem('push_banner_dismissed') === 'true';
    if (dismissedSession && !forceShow) {
      setIsDismissed(true);
    }

    const checkStatus = async () => {
      try {
        const nativePerm = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default';
        if (nativePerm === 'granted') {
          setIsSubscribed(true);
          return;
        } else {
          // Immediately mark as not subscribed so banner renders without delay
          setIsSubscribed(false);
        }

        const status = await getSubscriptionStatus();
        if (status) {
          setIsSubscribed(status.isSubscribed && status.permission === 'granted');
        }
      } catch (e) {
        setIsSubscribed(false);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [forceShow]);

  const handleActivate = async () => {
    setIsActivating(true);
    try {
      const ok = await promptPushPermission();
      if (ok) {
        setIsSubscribed(true);
        toast.success('¡Notificaciones Web Push activadas con éxito! 🔔', { icon: '🎉' });
        
        if (user?.phone) {
          sendTestNotification(user.phone).catch(() => {});
        }
        
        if (onSubscribed) {
          onSubscribed();
        }
      } else {
        toast('Puedes activar las notificaciones en cualquier momento desde la campanita 🔔', { icon: 'ℹ️' });
      }
    } catch (err) {
      console.warn('Error activating push notifications:', err);
    } finally {
      setIsActivating(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('push_banner_dismissed', 'true');
  };

  // CRITICAL: NEVER display subscription banner to unauthenticated visitors before login
  if (!user) {
    return null;
  }

  // If already subscribed and not forced, or dismissed
  if ((isSubscribed && !forceShow) || isDismissed) {
    return null;
  }

  // If loading status
  if (isSubscribed === null && !forceShow) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        className={`bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 text-white rounded-2xl p-4 sm:p-5 shadow-xl border-2 border-yellow-200 relative overflow-hidden ${className}`}
      >
        {/* Background glow & accents */}
        <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute top-0 right-0 p-2">
          {!forceShow && (
            <button
              onClick={handleDismiss}
              className="p-1 rounded-full text-white/70 hover:text-white hover:bg-white/20 transition"
              title="Cerrar aviso"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shrink-0 shadow-inner">
            <BellRing size={26} className="animate-bounce" />
          </div>

          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2">
              <span className="bg-white/20 text-[10px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider">
                🔔 Notificaciones en Tiempo Real
              </span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-yellow-100">
                <Sparkles size={11} /> ¡No te pierdas ningún sorteo!
              </span>
            </div>
            
            <h4 className="text-base sm:text-lg font-black text-white leading-tight mt-1">
              {isSubscribed ? '¡Notificaciones Push Activadas!' : '¿Deseas enterarte cuando inicie tu juego y cuando ganes?'}
            </h4>
            
            <p className="text-xs sm:text-sm text-yellow-100 font-medium mt-0.5 leading-snug">
              {isSubscribed 
                ? 'Recibirás avisos instantáneos de nuevos juegos, pagos aprobados y ganadores.' 
                : 'Activa las notificaciones web para recibir alertas de cartones aprobados, inicio de partidas, ganadores y recargas.'}
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 mt-2 sm:mt-0">
            {isSubscribed ? (
              <div className="px-4 py-2.5 bg-emerald-600 text-white text-xs font-black rounded-xl flex items-center gap-1.5 shadow-md">
                <CheckCircle2 size={16} />
                <span>Activas</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleActivate}
                disabled={isActivating}
                className="w-full sm:w-auto px-5 py-3 bg-slate-900 hover:bg-black text-yellow-300 font-black text-xs sm:text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <BellRing size={16} />
                <span>{isActivating ? 'Activando...' : 'Activar Notificaciones 🔔'}</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

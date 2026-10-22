import React, { useState, useEffect } from 'react';
import { Bell, X, BellRing } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { apiFetch } from '../utils/api';
import toast from 'react-hot-toast';
import OneSignal from 'react-onesignal';
import { promptPushPermission, sendTestNotification, getSubscriptionStatus } from '../lib/onesignal';


interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();

  const unreadCount = notifications.filter(n => !n.read).length;

  const [isSubscribed, setIsSubscribed] = useState(false);
  
  useEffect(() => {
    const checkOneSignal = async () => {
      try {
        const status = await getSubscriptionStatus();
        if (status) {
          setIsSubscribed(status.isSubscribed);
        }
      } catch (e) {
        // Silent error
      }
    };
    checkOneSignal();
    const interval = setInterval(checkOneSignal, 30000); // reduced from 5s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchNotifications();
    // removed 30s polling for notifications to save Supabase Egress/Requests
  }, [user]);

  // Fetch when the user opens the bell to ensure it's up to date
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  const fetchNotifications = async () => {
    try {
      const id = user?.uid;
      if (!id) return;
      const tenantParam = user?.tenant_id ? `?tenantId=${encodeURIComponent(user.tenant_id)}&role=${encodeURIComponent(user.role || '')}` : `?role=${encodeURIComponent(user.role || '')}`;
      const res = await apiFetch(`/api/notifications/${encodeURIComponent(id)}${tenantParam}`).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        setNotifications(Array.isArray(data) ? data : []);
      }
    } catch {
      // silently handle
    }
  };

  const markAsRead = async (notificationId: string) => {
    setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));
    try {
      await apiFetch(`/api/notifications/${notificationId}/read`, { method: 'POST' }).catch(() => null);
    } catch {
      // silently handle
    }
  };

  const markAllAsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      const id = user?.uid;
      if (!id) return;
      await apiFetch(`/api/notifications/user/${encodeURIComponent(id)}/read-all`, { method: 'POST' }).catch(() => null);
    } catch {
      // silently handle
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="relative flex items-center justify-center p-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-950 rounded-xl shadow-sm border border-yellow-300 transition-all active:scale-95"
        title="Notificaciones"
      >
        <Bell size={16} className="animate-pulse" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-black text-white bg-red-600 border-2 border-yellow-300 rounded-full shadow-sm">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-yellow-100 text-yellow-600 rounded-lg">
                  <Bell size={20} />
                </div>
                <h3 className="font-black text-slate-800 text-lg">Notificaciones</h3>
              </div>
              <button 
                onClick={() => setIsOpen(false)} 
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="px-4 py-3 bg-white flex justify-between items-center border-b border-slate-100 shrink-0">
              <span className="text-sm text-slate-500 font-bold">{notifications.length} Registros</span>
              {unreadCount > 0 && (
                <button 
                  onClick={markAllAsRead}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold px-3 py-1.5 bg-blue-50 rounded-full transition-colors"
                >
                  Marcar todas leídas
                </button>
              )}
            </div>
            
            
            {/* OneSignal Push Status */}
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isSubscribed ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-slate-300'}`} />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    {isSubscribed ? 'Notificaciones: ON' : 'Notificaciones: OFF'}
                  </span>
                </div>
                {isSubscribed ? (
                  <button
                    onClick={async () => {
                      if (!user?.phone) {
                        toast.error('Registra tu teléfono primero');
                        return;
                      }
                      const ok = await sendTestNotification(user.phone);
                      if (ok) toast.success('Enviando prueba...');
                      else toast.error('Error al enviar prueba');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-green-700 transition-all shadow-sm active:scale-95"
                  >
                    Probar
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      try {
                        await promptPushPermission();
                        toast.success('Solicitando activación...');
                      } catch (e) {
                        toast.error('Error al solicitar activación');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-blue-700 transition-all shadow-sm active:scale-95"
                  >
                    <BellRing size={12} />
                    Activar
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-2 bg-slate-50/50">
              {notifications.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <Bell size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="font-medium">No tienes notificaciones</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {notifications.map(notif => (
                    <li 
                      key={notif.id} 
                      className={`p-4 rounded-xl transition-all cursor-pointer border ${!notif.read ? 'bg-white border-blue-100 shadow-sm' : 'bg-transparent border-transparent hover:bg-white/50'}`}
                      onClick={() => {
                        if (!notif.read) markAsRead(notif.id);
                      }}
                    >
                      <div className="flex gap-3">
                        <div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${!notif.read ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-slate-200'}`}></div>
                        <div>
                          <h4 className={`text-sm font-bold ${!notif.read ? 'text-slate-900' : 'text-slate-600'}`}>
                            {notif.title}
                          </h4>
                          <p className={`text-sm mt-1 leading-relaxed ${!notif.read ? 'text-slate-700' : 'text-slate-500'}`}>
                            {notif.message}
                          </p>
                          <span className="text-xs text-slate-400 mt-2 block font-medium">
                            {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: es })}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

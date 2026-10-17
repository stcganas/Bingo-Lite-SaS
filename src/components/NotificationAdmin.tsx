import React, { useState, useEffect } from 'react';
import { Send, Users, User, BellRing, Trash2, Key, Settings, ShieldCheck, Activity, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Cpu, Smartphone, Bell, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/api';

interface DiagnosticReport {
  swSupported: boolean;
  pushSupported: boolean;
  permission: string;
  registrationsCount: number;
  registrations: Array<{ scriptUrl: string; scope: string; state: string }>;
  hasActiveSubscription: boolean;
  endpointHost: string;
  oneSignalLoaded: boolean;
  oneSignalSubscribed: boolean;
  oneSignalUserId: string;
  isIframe: boolean;
}

export default function NotificationAdmin() {
  const [recipient, setRecipient] = useState<'all' | 'specific'>('all');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);

  // OneSignal credentials state
  const [showConfig, setShowConfig] = useState(false);
  const [onesignalAppId, setOnesignalAppId] = useState('');
  const [onesignalRestApiKey, setOnesignalRestApiKey] = useState('');
  const [configStatus, setConfigStatus] = useState<{ is_configured: boolean; onesignal_app_id?: string; has_api_key?: boolean; source?: string } | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  // Service Worker & Web Push Diagnostic state
  const [diagnostic, setDiagnostic] = useState<DiagnosticReport | null>(null);
  const [runningDiag, setRunningDiag] = useState(false);
  const [repairingSW, setRepairingSW] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);

  useEffect(() => {
    fetchConfigStatus();
    runDiagnostic();
  }, []);

  const fetchConfigStatus = async () => {
    try {
      const res = await apiFetch('/api/admin/notifications/settings');
      if (res.ok) {
        const data = await res.json();
        setConfigStatus(data);
        if (data.onesignal_app_id) {
          setOnesignalAppId(data.onesignal_app_id);
        }
      }
    } catch (e) {
      console.warn('Error fetching notification settings:', e);
    }
  };

  const runDiagnostic = async () => {
    setRunningDiag(true);
    try {
      const isIframe = typeof window !== 'undefined' && window.self !== window.top;
      const swSupported = 'serviceWorker' in navigator;
      const pushSupported = 'PushManager' in window;
      const permission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';

      let registrationsCount = 0;
      const registrationsList: Array<{ scriptUrl: string; scope: string; state: string }> = [];
      let hasActiveSubscription = false;
      let endpointHost = '';

      if (swSupported) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          registrationsCount = regs.length;
          for (const reg of regs) {
            const activeWorker = reg.active || reg.installing || reg.waiting;
            registrationsList.push({
              scriptUrl: activeWorker?.scriptURL || 'desconocido',
              scope: reg.scope,
              state: activeWorker?.state || 'inactivo'
            });

            try {
              const sub = await reg.pushManager.getSubscription();
              if (sub) {
                hasActiveSubscription = true;
                endpointHost = new URL(sub.endpoint).hostname;
              }
            } catch (e) {}
          }
        } catch (e) {
          console.warn('Error reading service worker registrations:', e);
        }
      }

      const os = (window as any).OneSignal;
      const oneSignalLoaded = Boolean(os);
      let oneSignalSubscribed = false;
      let oneSignalUserId = '';

      if (os?.User) {
        oneSignalUserId = os.User.externalId || os.User.id || '';
        try {
          oneSignalSubscribed = Boolean(os.User.pushSubscription?.optedIn || os.User.pushSubscription?.id);
        } catch (e) {}
      }

      const report: DiagnosticReport = {
        swSupported,
        pushSupported,
        permission,
        registrationsCount,
        registrations: registrationsList,
        hasActiveSubscription,
        endpointHost,
        oneSignalLoaded,
        oneSignalSubscribed,
        oneSignalUserId,
        isIframe
      };

      setDiagnostic(report);
    } catch (e: any) {
      console.warn('Diagnostic run error:', e);
    } finally {
      setRunningDiag(false);
    }
  };

  const handleRegisterSW = async () => {
    setRepairingSW(true);
    try {
      if (!('serviceWorker' in navigator)) {
        throw new Error('Este navegador no soporta Service Workers.');
      }

      // Register both sw.js and OneSignalSDKWorker.js
      const reg1 = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.register('/OneSignalSDKWorker.js', { scope: '/' });

      toast.success(`Service Worker (sw.ts/sw.js) registrado con éxito. Estado: ${reg1.active ? 'Activo' : 'Instalado'}`);
      await runDiagnostic();
    } catch (e: any) {
      toast.error('Error al registrar Service Worker: ' + (e.message || String(e)));
    } finally {
      setRepairingSW(false);
    }
  };

  const handleRequestPermission = async () => {
    try {
      if (typeof Notification === 'undefined') {
        toast.error('Este navegador no soporta la API de Notificaciones.');
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        toast.success('¡Permisos de Notificación Web Push Aprobados! 🔔');
      } else if (perm === 'denied') {
        toast.error('Los permisos de Notificación fueron Bloqueados en tu navegador.');
      } else {
        toast('Permisos en estado pendiente.', { icon: 'ℹ️' });
      }
      await runDiagnostic();
    } catch (e: any) {
      toast.error('Error al solicitar permisos: ' + (e.message || String(e)));
    }
  };

  const handleTestLocalPush = async () => {
    setTestingNotification(true);
    try {
      if (!('serviceWorker' in navigator)) {
        throw new Error('Service Worker no soportado en este navegador');
      }

      if ((Notification.permission as string) !== 'granted') {
        toast.error('Debes otorgar permiso de notificación primero.');
        await handleRequestPermission();
        if ((Notification.permission as string) !== 'granted') return;
      }

      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      }

      if (!reg) {
        throw new Error('No se pudo obtener un Service Worker registrado');
      }

      await reg.showNotification('🎱 Prueba de Notificación Push (sw.ts)', {
        body: '¡Excelente! Tu Service Worker (sw.ts) y Push Manager están funcionando correctamente fuera de la app.',
        icon: 'https://cdn-icons-png.flaticon.com/512/591/591559.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/591/591559.png',
        tag: 'test-push-admin',
        data: { url: window.location.href }
      });

      toast.success('¡Notificación Push de prueba enviada al sistema operativo! Revisa la barra de notificaciones de tu PC/móvil. 🔔');
    } catch (e: any) {
      toast.error('Error al emitir notificación de prueba: ' + (e.message || String(e)));
    } finally {
      setTestingNotification(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onesignalAppId.trim()) {
      toast.error('El OneSignal App ID es requerido');
      return;
    }
    setSavingConfig(true);
    try {
      const res = await apiFetch('/api/admin/notifications/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onesignal_app_id: onesignalAppId.trim(),
          onesignal_rest_api_key: onesignalRestApiKey.trim() || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      toast.success('Configuración de OneSignal guardada correctamente');
      setOnesignalRestApiKey('');
      fetchConfigStatus();
      setShowConfig(false);
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar configuración');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleClearOld = async () => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar todas las notificaciones con más de 24 horas de antigüedad? Esta acción liberará espacio de base de datos de manera inmediata.')) {
      return;
    }
    
    setClearing(true);
    try {
      const res = await apiFetch('/api/admin/notifications/clear-old', {
        method: 'POST'
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al limpiar notificaciones');
      }
      
      const data = await res.json();
      toast.success(data.message || 'Notificaciones antiguas eliminadas correctamente');
    } catch (e: any) {
      toast.error(e.message || 'Error al eliminar notificaciones antiguas');
    } finally {
      setClearing(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !message) {
      toast.error('Título y mensaje son requeridos');
      return;
    }
    if (recipient === 'specific' && !phone) {
      toast.error('El número de teléfono es requerido para envío específico');
      return;
    }

    setSending(true);
    try {
      const res = await apiFetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: recipient === 'specific' ? 'single' : 'all',
          phone: recipient === 'specific' ? phone : undefined,
          title,
          message
        })
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Error al enviar');
      }

      if (data.warning) {
        toast(data.warning, { icon: '⚠️', duration: 4000 });
      } else if (data.push_status === 'unsubscribed') {
        toast(data.message || 'Guardado en la app del jugador (el usuario aún no ha permitido notificaciones push).', { icon: '📲', duration: 5000 });
      } else {
        toast.success('¡Notificación Push transmitida exitosamente a OneSignal y guardada en la app! 🔔');
      }

      setTitle('');
      setMessage('');
      setPhone('');
    } catch (e: any) {
      toast.error(e.message || 'Error al enviar la notificación');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Config Status Banner */}
      <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl flex items-center justify-center ${configStatus?.is_configured ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
            <BellRing size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-800">Estado de OneSignal Web Push</h3>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${configStatus?.is_configured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {configStatus?.is_configured ? 'Conectado / Activo' : 'Pendiente Configurar'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {configStatus?.is_configured 
                ? `App ID: ${configStatus.onesignal_app_id || 'Configurado'} • REST API Key lista para envíos masivos.` 
                : 'Configura tus credenciales de OneSignal para habilitar el envío de notificaciones web push.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowConfig(!showConfig)}
          className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 shrink-0 active:scale-95 cursor-pointer"
        >
          <Settings size={15} />
          <span>{showConfig ? 'Ocultar Configuración' : 'Configurar OneSignal'}</span>
        </button>
      </div>

      {/* Expandable Configuration Form */}
      {showConfig && (
        <form onSubmit={handleSaveConfig} className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl shadow-xl p-6 space-y-4 border border-indigo-800 animate-in fade-in slide-in-from-top-3 duration-300">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Key size={18} className="text-yellow-400" />
              <h4 className="text-sm font-black uppercase tracking-wider text-yellow-300">Credenciales de OneSignal</h4>
            </div>
            <span className="text-[11px] text-slate-400">Panel OneSignal → Settings → Keys & IDs</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">OneSignal App ID</label>
              <input
                type="text"
                value={onesignalAppId}
                onChange={e => setOnesignalAppId(e.target.value)}
                placeholder="Ej: e48b52f1-..."
                className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">OneSignal REST API Key</label>
              <input
                type="password"
                value={onesignalRestApiKey}
                onChange={e => setOnesignalRestApiKey(e.target.value)}
                placeholder={configStatus?.has_api_key ? "•••••••••••••••• (Ya configurada)" : "Pega tu REST API Key aquí"}
                className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowConfig(false)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingConfig}
              className="px-5 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider transition shadow-md disabled:opacity-50 cursor-pointer"
            >
              {savingConfig ? 'Guardando...' : 'Guardar Credenciales'}
            </button>
          </div>
        </form>
      )}

      {/* SERVICE WORKER & WEB PUSH DIAGNOSTIC PANEL */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl shadow-xl border border-slate-700 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Activity size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                Diagnóstico de Service Worker (sw.ts) y Web Push
                <Sparkles size={16} className="text-yellow-400 animate-pulse" />
              </h3>
              <p className="text-xs text-slate-400">Verifica la compatibilidad del navegador, registro de Service Worker y suscripción a notificaciones del sistema.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={runDiagnostic}
            disabled={runningDiag}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={15} className={runningDiag ? 'animate-spin' : ''} />
            <span>{runningDiag ? 'Analizando...' : 'Ejecutar Diagnóstico'}</span>
          </button>
        </div>

        {/* Diagnostic Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Item 1: SW Support */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Cpu size={14} /> Service Worker
              </span>
              {diagnostic?.swSupported ? (
                <CheckCircle2 size={18} className="text-emerald-400" />
              ) : (
                <XCircle size={18} className="text-rose-400" />
              )}
            </div>
            <div className="text-sm font-black">
              {diagnostic?.swSupported ? 'Soportado por Navegador' : 'No Soportado'}
            </div>
            <div className="text-[11px] text-slate-400">
              Registros activos: <strong className="text-white">{diagnostic?.registrationsCount || 0}</strong>
            </div>
          </div>

          {/* Item 2: Push Manager */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Smartphone size={14} /> Push Manager API
              </span>
              {diagnostic?.pushSupported ? (
                <CheckCircle2 size={18} className="text-emerald-400" />
              ) : (
                <XCircle size={18} className="text-rose-400" />
              )}
            </div>
            <div className="text-sm font-black">
              {diagnostic?.pushSupported ? 'Disponible para Push Fuera de App' : 'No Disponible'}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              Endpoint: <strong className="text-white">{diagnostic?.endpointHost || 'Ninguno'}</strong>
            </div>
          </div>

          {/* Item 3: Notification Permission */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Bell size={14} /> Permisos de Sistema
              </span>
              {diagnostic?.permission === 'granted' ? (
                <CheckCircle2 size={18} className="text-emerald-400" />
              ) : diagnostic?.permission === 'denied' ? (
                <XCircle size={18} className="text-rose-400" />
              ) : (
                <AlertTriangle size={18} className="text-amber-400" />
              )}
            </div>
            <div className="text-sm font-black capitalize">
              {diagnostic?.permission === 'granted' ? 'Aprobados (Granted)' : diagnostic?.permission === 'denied' ? 'Bloqueados (Denied)' : 'Pendientes (Default)'}
            </div>
            <div className="text-[11px] text-slate-400">
              Estado en sistema operativo
            </div>
          </div>

          {/* Item 4: OneSignal Status */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck size={14} /> OneSignal SDK
              </span>
              {diagnostic?.oneSignalSubscribed ? (
                <CheckCircle2 size={18} className="text-emerald-400" />
              ) : (
                <AlertTriangle size={18} className="text-amber-400" />
              )}
            </div>
            <div className="text-sm font-black">
              {diagnostic?.oneSignalSubscribed ? 'Suscrito & Vinculado' : diagnostic?.oneSignalLoaded ? 'Inicializado' : 'Inactivo'}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              User ID: <strong className="text-white">{diagnostic?.oneSignalUserId || 'Sin vincular'}</strong>
            </div>
          </div>
        </div>

        {/* Detailed Registered Service Workers List */}
        {diagnostic && diagnostic.registrations.length > 0 && (
          <div className="bg-slate-950/60 rounded-xl p-4 border border-white/10 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-indigo-300">
              Service Workers Registrados en este Dominio:
            </div>
            <div className="space-y-1.5 text-xs font-mono">
              {diagnostic.registrations.map((r, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-white/5 rounded-lg border border-white/5">
                  <span className="truncate text-slate-200">
                    <strong className="text-yellow-300">Script:</strong> {r.scriptUrl}
                  </span>
                  <div className="flex items-center gap-3 shrink-0 text-[11px]">
                    <span className="text-slate-400">Scope: {r.scope}</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold uppercase">
                      {r.state}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Diagnostic Action Controls */}
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={handleRegisterSW}
            disabled={repairingSW}
            className="flex-1 min-w-[200px] px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={16} className={repairingSW ? 'animate-spin' : ''} />
            <span>{repairingSW ? 'Registrando...' : 'Registrar / Reparar Service Worker (sw.ts)'}</span>
          </button>

          <button
            type="button"
            onClick={handleRequestPermission}
            className="flex-1 min-w-[200px] px-4 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-md active:scale-95 cursor-pointer"
          >
            <Bell size={16} />
            <span>Solicitar Permiso Notificaciones</span>
          </button>

          <button
            type="button"
            onClick={handleTestLocalPush}
            disabled={testingNotification}
            className="flex-1 min-w-[200px] px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Sparkles size={16} />
            <span>{testingNotification ? 'Enviando...' : 'Probar Notificación Push Fuera de App'}</span>
          </button>
        </div>
      </div>

      {/* Main Dispatch Center */}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
            <BellRing size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">Centro de Notificaciones Push</h2>
            <p className="text-slate-500 text-sm">Envía alertas instantáneas a los teléfonos y computadores de los jugadores</p>
          </div>
        </div>

        <form onSubmit={handleSend} className="space-y-6">
          <div className="space-y-4">
            <label className="block text-sm font-bold text-slate-700">Destinatarios</label>
            <div className="flex flex-wrap gap-4">
              <label className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-colors flex-1 ${recipient === 'all' ? 'border-blue-600 bg-blue-50/50' : 'border-slate-200 hover:border-blue-300'}`}>
                <input 
                  type="radio" 
                  name="recipient" 
                  className="hidden" 
                  checked={recipient === 'all'}
                  onChange={() => setRecipient('all')}
                />
                <Users className={recipient === 'all' ? 'text-blue-600' : 'text-slate-400'} size={24} />
                <div>
                  <div className={`font-bold ${recipient === 'all' ? 'text-blue-900' : 'text-slate-700'}`}>Todos los usuarios</div>
                  <div className="text-xs text-slate-500">Enviar a todos los jugadores suscritos a nivel nacional</div>
                </div>
              </label>

              <label className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-colors flex-1 ${recipient === 'specific' ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-300'}`}>
                <input 
                  type="radio" 
                  name="recipient" 
                  className="hidden" 
                  checked={recipient === 'specific'}
                  onChange={() => setRecipient('specific')}
                />
                <User className={recipient === 'specific' ? 'text-indigo-600' : 'text-slate-400'} size={24} />
                <div>
                  <div className={`font-bold ${recipient === 'specific' ? 'text-indigo-900' : 'text-slate-700'}`}>Usuario Específico</div>
                  <div className="text-xs text-slate-500">Enviar por número de celular de WhatsApp</div>
                </div>
              </label>
            </div>
          </div>

          {recipient === 'specific' && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Teléfono del Jugador</label>
              <input 
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                placeholder="Ej: 3001234567 o +573001234567"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Título de la Notificación</label>
            <input 
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold"
              placeholder="Ej: 🏆 ¡Gran Juego Especial de Fin de Semana!"
              maxLength={60}
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Mensaje</label>
            <textarea 
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none h-32 leading-relaxed"
              placeholder="Escribe el mensaje de la notificación push..."
              maxLength={200}
            />
          </div>

          <button 
            type="submit"
            disabled={sending || !title || !message}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-black uppercase tracking-widest transition-all hover:shadow-lg hover:-translate-y-0.5 active:scale-95 cursor-pointer"
          >
            {sending ? (
              <span className="animate-pulse">Transmitiendo Notificación...</span>
            ) : (
              <>
                <Send size={20} />
                <span>Enviar Notificación Web Push 🔔</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* MAINTENANCE & DB OPTIMIZATION */}
      <div className="bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-red-100 text-red-600 rounded-xl">
            <Trash2 size={24} />
          </div>
          <div className="space-y-2 flex-1">
            <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Mantenimiento y Optimización de Base de Datos</h3>
            <p className="text-slate-500 text-xs font-medium leading-relaxed">
              Las notificaciones antiguas generan un consumo persistente de consultas y almacenamiento. Para optimizar el rendimiento y evitar restricciones de Supabase, la aplicación ejecuta una <strong className="text-slate-700">limpieza automática cada 24 horas</strong> eliminando historiales viejos.
            </p>
            <p className="text-slate-500 text-xs font-medium leading-relaxed">
              Si deseas liberar espacio de forma inmediata, puedes realizar una purga manual para eliminar todas las notificaciones de jugadores y administradores que tengan más de <strong className="text-slate-700">24 horas de antigüedad</strong>.
            </p>
            
            <div className="pt-2">
              <button
                type="button"
                onClick={handleClearOld}
                disabled={clearing}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-wider border border-red-200 transition-all active:scale-95 disabled:opacity-50"
              >
                {clearing ? (
                  <span className="animate-pulse">Purgando Notificaciones...</span>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Purgar Notificaciones Antiguas (&gt;24h)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../utils/api';
import PushSubscriptionBanner from '../components/PushSubscriptionBanner';
import { 
  LogOut, 
  Users, 
  DollarSign, 
  Activity, 
  TrendingUp, 
  Ticket, 
  BarChart3, 
  Award,
  RefreshCw,
  Gift,
  Bell,
  Send,
  Megaphone,
  Sparkles,
  Radio,
  CheckCircle2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend, 
  Cell 
} from 'recharts';
import toast from 'react-hot-toast';

interface GameStat {
  game_id: number;
  game_name: string;
  cards_sold: number;
  revenue: number;
  commissions: number;
}

interface PlayerStat {
  id: number;
  name: string;
  phone: string;
  city?: string;
  card_count: number;
  total_revenue: number;
  status?: string;
}

interface SellerStatsState {
  players: PlayerStat[];
  totalCommissions: number;
  totalCardsSold: number;
  totalRevenue: number;
  salesByGame: GameStat[];
  salesByPlayer: PlayerStat[];
}

export default function SellerDashboard() {
  const { user } = useAuth();
  const [seller, setSeller] = useState<any>(null);
  const [stats, setStats] = useState<SellerStatsState>({ 
    players: [], 
    totalCommissions: 0,
    totalCardsSold: 0,
    totalRevenue: 0,
    salesByGame: [],
    salesByPlayer: []
  });
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [invitePhone, setInvitePhone] = useState('');
  const [chartMode, setChartMode] = useState<'cards' | 'financial' | 'players'>('cards');

  // Push notification state
  const [pushTitle, setPushTitle] = useState('🚨 ¡Nuevas ventas de cartones abiertas! 🎟️');
  const [pushMessage, setPushMessage] = useState('¡Hola! Se han abierto nuevas ventas de cartones para el próximo Bingo. ¡Asegura los tuyos antes de que se agoten!');
  const [pushAudience, setPushAudience] = useState<'my_players' | 'all_players'>('my_players');
  const [isSendingPush, setIsSendingPush] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    if (user && user.role === 'seller') {
      fetchSellerData(user.uid);
    } else {
      navigate('/admin/login');
    }
  }, [user, navigate]);

  const sendInvite = () => {
    if (!invitePhone) {
      toast.error("Ingresa un número de teléfono");
      return;
    }
    
    const cleanPhone = invitePhone.replace(/\D/g, '');
    const baseUrl = "https://bingolite.click";
    const inviteUrl = `${baseUrl}/register?ref=${seller?.code || ''}&phone=${cleanPhone}`;
    const message = encodeURIComponent(`¡Hola! Te invito a jugar conmigo en *BingoLite*. 🎰✨\n\nRegístrate y compra tus cartones fácilmente aquí:\n${inviteUrl}\n\n¡Mucha suerte! 🍀`);
    
    const finalPhone = cleanPhone.length === 10 ? `57${cleanPhone}` : cleanPhone;
    window.open(`https://wa.me/${finalPhone}?text=${message}`, '_blank');
    setInvitePhone('');
    toast.success("Abriendo WhatsApp...");
  };

  const fetchSellerData = async (uid: string) => {
    try {
      const sessionRes = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      const session = sessionRes.data?.session;
      const res = await apiFetch('/api/sellers/me', {
        headers: {
          'Authorization': session ? `Bearer ${session.access_token}` : ''
        }
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      
      setSeller(data.seller);
      setNewEmail(data.seller.email || '');
      fetchStats(data.seller.code);
    } catch (err) {
      toast.error('Error cargando datos del vendedor');
      setLoading(false);
    }
  };

  const fetchStats = async (code: string) => {
    try {
      const res = await apiFetch(`/api/sellers/${code}/stats`);
      const data = await res.json();
      if (data.success) {
        setStats({ 
          players: data.players || [], 
          totalCommissions: data.totalCommissions || 0,
          totalCardsSold: data.totalCardsSold || 0,
          totalRevenue: data.totalRevenue || 0,
          salesByGame: data.salesByGame || [],
          salesByPlayer: data.salesByPlayer || []
        });
        if (data.seller) {
          setSeller(data.seller);
        }
      }
    } catch (err) {
      toast.error('Error cargando estadísticas');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  const handleUpdateCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      const res = await apiFetch('/api/sellers/update-credentials', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': (await supabase.auth.getSession().catch(() => ({ data: { session: null } }))).data.session ? `Bearer ${(await supabase.auth.getSession().catch(() => ({ data: { session: null } }))).data.session?.access_token}` : ''
        },
        body: JSON.stringify({ email: newEmail, password: newPassword })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Credenciales actualizadas correctamente");
        setShowSettings(false);
        setNewPassword('');
        setSeller({ ...seller, email: newEmail });
      } else {
        toast.error(data.error || "Error al actualizar");
      }
    } catch (err) {
      toast.error("Error al actualizar credenciales");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSendPushNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pushTitle.trim() || !pushMessage.trim()) {
      toast.error('Escribe un título y mensaje para la notificación push');
      return;
    }

    setIsSendingPush(true);
    try {
      const sessionRes = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      const token = sessionRes.data?.session?.access_token;

      const res = await apiFetch('/api/sellers/send-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          title: pushTitle,
          message: pushMessage,
          targetAudience: pushAudience
        })
      });

      const data = await res.json();
      if (data.success) {
        toast.success(data.message || '¡Notificación Push enviada con éxito!');
      } else {
        toast.error(data.error || 'Error al enviar notificación push');
      }
    } catch (err: any) {
      toast.error('Error enviando notificación push');
    } finally {
      setIsSendingPush(false);
    }
  };

  const setTemplate = (title: string, message: string) => {
    setPushTitle(title);
    setPushMessage(message);
    toast.success('Plantilla cargada');
  };

  if (loading || !seller) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-emerald-400 font-bold">
        <div className="flex items-center gap-3">
          <RefreshCw className="animate-spin text-emerald-400" size={24} />
          <span>Cargando Panel de Revendedor...</span>
        </div>
      </div>
    );
  }

  // Custom Chart Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-xl border border-slate-700 text-xs space-y-1">
          <p className="font-bold text-slate-300 mb-1 border-b border-slate-800 pb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 font-medium" style={{ color: entry.color }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
                {entry.name}:
              </span>
              <span className="font-black tabular-nums">
                {entry.name.includes('$') || entry.dataKey === 'revenue' || entry.dataKey === 'commissions' || entry.dataKey === 'total_revenue'
                  ? `$${Number(entry.value).toLocaleString()}`
                  : entry.value}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top Header Contract */}
      <header className="bg-slate-900 text-white p-4 shadow-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black flex items-center gap-2 tracking-tight">
              <TrendingUp className="text-emerald-400" /> Panel de Revendedor
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Vendedor: <span className="text-white font-bold">{seller.name}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowSettings(true)} 
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold transition border border-slate-700/50"
            >
              Ajustes
            </button>
            <button 
              onClick={logout} 
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-red-400 transition border border-slate-700/50"
              title="Cerrar sesión"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 py-8 space-y-6">
        
        {/* Banner de Suscripción a Notificaciones Push */}
        <PushSubscriptionBanner />
        
        {/* Invite Tool */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-3xl p-6 text-white shadow-lg shadow-emerald-200">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-[10px] font-bold uppercase tracking-wider mb-2 text-emerald-100">
                Enlace de Afiliado Activo
              </span>
              <h2 className="text-2xl font-black mb-1 leading-tight">Invitar Jugador por WhatsApp</h2>
              <p className="text-emerald-100 text-xs font-medium">
                Envía tu invitación con el código <span className="font-mono bg-white/20 px-2 py-0.5 rounded text-white font-bold">{seller.code}</span>
              </p>
            </div>
            <div className="flex w-full md:w-auto gap-2 bg-white/10 p-2 rounded-2xl backdrop-blur-md border border-white/20">
              <input 
                type="tel" 
                placeholder="WhatsApp del Jugador (ej: 3001234567)" 
                value={invitePhone}
                onChange={e => setInvitePhone(e.target.value)}
                className="bg-transparent border-none focus:ring-0 placeholder:text-emerald-100 text-white font-bold w-full md:w-64 px-3 py-2 text-sm"
              />
              <button 
                onClick={sendInvite}
                className="bg-white text-emerald-700 px-5 py-2 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-emerald-50 transition shrink-0 shadow-md active:scale-95"
              >
                Enviar Invitación
              </button>
            </div>
          </div>
        </div>

        {/* Executive Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200/80 hover:shadow-md transition">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
                <Ticket size={24} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cartones Vendidos</p>
                <p className="text-2xl font-black text-slate-800 tabular-nums">{stats.totalCardsSold.toLocaleString()}</p>
                <p className="text-[11px] text-blue-600 font-bold mt-0.5">
                  Total acumulado
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200/80 hover:shadow-md transition">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
                <TrendingUp size={24} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ingresos Acumulados</p>
                <p className="text-2xl font-black text-slate-800 tabular-nums">${stats.totalRevenue.toLocaleString()}</p>
                <p className="text-[11px] text-emerald-600 font-bold mt-0.5">
                  Venta bruta de cartones
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200/80 hover:shadow-md transition">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center shrink-0">
                <DollarSign size={24} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Comisiones Ganadas</p>
                <p className="text-2xl font-black text-emerald-600 tabular-nums">${stats.totalCommissions.toLocaleString()}</p>
                <p className="text-[11px] text-amber-600 font-bold mt-0.5">
                  Tasa: {seller.commission_percentage}% base
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200/80 hover:shadow-md transition">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center shrink-0">
                <Users size={24} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Jugadores Afiliados</p>
                <p className="text-2xl font-black text-slate-800 tabular-nums">{stats.players.length}</p>
                <p className="text-[11px] text-purple-600 font-bold mt-0.5 font-mono">
                  Código: {seller.code}
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Sección de Notificaciones Push OneSignal para Apertura de Ventas */}
        <div className="bg-slate-900 rounded-3xl shadow-xl border border-slate-800 p-6 text-white space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-10 -mt-10 w-48 h-48 bg-red-500/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-[11px] font-black uppercase tracking-wider mb-2 border border-red-500/30">
                <Bell size={13} className="animate-bounce" />
                Notificaciones Push con OneSignal
              </div>
              <h2 className="text-xl font-black text-white flex items-center gap-2 tracking-tight">
                Notificar Apertura de Ventas de Cartones
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Incentiva la participación enviando alertas instantáneas a los navegadores y celulares de tus jugadores.
              </p>
            </div>

            {/* Selector de Audiencia */}
            <div className="flex items-center bg-slate-800/80 p-1.5 rounded-2xl border border-slate-700 shrink-0">
              <button
                type="button"
                onClick={() => setPushAudience('my_players')}
                className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center gap-2 ${
                  pushAudience === 'my_players'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users size={14} />
                Mis Afiliados ({stats.players.length})
              </button>
              <button
                type="button"
                onClick={() => setPushAudience('all_players')}
                className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center gap-2 ${
                  pushAudience === 'all_players'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Radio size={14} />
                Todos los Jugadores
              </button>
            </div>
          </div>

          {/* Plantillas Rápidas para Vendedores */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={13} className="text-yellow-400" />
              Plantillas Rápidas
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTemplate('🚨 ¡Nuevas ventas de cartones abiertas! 🎟️', `¡Hola! Se han abierto nuevas ventas de cartones para el próximo Bingo. ¡Entra ya con el código ${seller.code} y asegura tus números!`)}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition active:scale-95 text-left"
              >
                🎟️ Apertura de Ventas
              </button>
              <button
                type="button"
                onClick={() => setTemplate('🔥 ¡Últimos cartones disponibles!', '¡Quedan pocos cartones para el gran sorteo de hoy! Compra tus cartones de la suerte antes de iniciar el juego.')}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition active:scale-95 text-left"
              >
                🔥 Últimos Cartones
              </button>
              <button
                type="button"
                onClick={() => setTemplate('🏆 ¡Gran Acumulado Aumentado!', '¡El pozo acumulado ha subido! Entra ahora a comprar tus cartones adicionales y gana grandes premios.')}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition active:scale-95 text-left"
              >
                🏆 Gran Acumulado
              </button>
            </div>
          </div>

          {/* Formulario y Vista Previa */}
          <form onSubmit={handleSendPushNotification} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Título de la Notificación Push
                </label>
                <input
                  type="text"
                  required
                  value={pushTitle}
                  onChange={e => setPushTitle(e.target.value)}
                  placeholder="Ej: 🚨 ¡Nuevas ventas abiertas!"
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-2xl p-3.5 text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:border-red-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Mensaje para el Jugador
                </label>
                <textarea
                  rows={3}
                  required
                  value={pushMessage}
                  onChange={e => setPushMessage(e.target.value)}
                  placeholder="Escribe el mensaje motivador..."
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-2xl p-3.5 text-sm font-medium text-white placeholder-slate-500 focus:outline-none focus:border-red-500 transition resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSendingPush}
                  className="w-full py-4 bg-gradient-to-r from-red-600 via-rose-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-wider shadow-lg shadow-red-900/40 hover:shadow-red-900/60 transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2.5"
                >
                  {isSendingPush ? (
                    <>
                      <RefreshCw className="animate-spin" size={18} />
                      Enviando Alertas OneSignal...
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      Enviar Notificación Push 🚀
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Simulación Visual de Notificación en Teléfono/Navegador */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                  <span className="flex items-center gap-1.5 text-red-400">
                    <Megaphone size={12} /> Previsualización OneSignal
                  </span>
                  <span>Ahora mismo</span>
                </div>

                <div className="bg-slate-900 p-3.5 rounded-2xl border border-slate-800 shadow-md flex gap-3 items-start">
                  <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center text-white shrink-0 shadow-sm font-black text-xs">
                    🎰
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-white leading-tight truncate">
                      {pushTitle || 'Título de notificación'}
                    </p>
                    <p className="text-[11px] text-slate-300 font-medium leading-relaxed mt-1 line-clamp-3">
                      {pushMessage || 'Mensaje de notificación...'}
                    </p>
                    <p className="text-[9px] text-slate-500 font-mono mt-2 flex items-center gap-1">
                      <CheckCircle2 size={10} className="text-emerald-400" /> bingo-online.app • OneSignal Push
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800 text-[11px] text-slate-400 font-medium">
                💡 <span className="text-slate-200 font-bold">Nota de Vendedor:</span> Al hacer clic en la notificación push, los jugadores serán redirigidos directamente a la sala de bingo.
              </div>
            </div>
          </form>
        </div>

        {/* Resumen Estadístico con Gráfica de Barras Recharts */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <BarChart3 className="text-emerald-500" size={22} /> Resumen Estadístico de Ventas
              </h2>
              <p className="text-xs text-slate-500 mt-1">Análisis gráfico del desempeño de cartones e ingresos acumulados</p>
            </div>

            {/* Selector de Vista de Gráfica */}
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl shrink-0">
              <button
                onClick={() => setChartMode('cards')}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  chartMode === 'cards' 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cartones por Juego
              </button>
              <button
                onClick={() => setChartMode('financial')}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  chartMode === 'financial' 
                    ? 'bg-white text-emerald-600 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ingresos vs Comisiones
              </button>
              <button
                onClick={() => setChartMode('players')}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  chartMode === 'players' 
                    ? 'bg-white text-purple-600 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Top Jugadores
              </button>
            </div>
          </div>

          {/* Gráficas con Recharts */}
          <div className="w-full h-80 pt-2">
            {stats.totalCardsSold === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-500">
                <BarChart3 size={40} className="text-slate-300 mb-2" />
                <p className="font-bold text-slate-700">Aún no hay ventas registradas para generar la gráfica.</p>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                  Comparte tu enlace de invitación por WhatsApp o entrega tu código <span className="font-mono text-emerald-600 font-bold">{seller.code}</span> a tus jugadores para empezar a ver sus compras reflejadas aquí.
                </p>
              </div>
            ) : chartMode === 'cards' ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.salesByGame} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="game_name" 
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    wrapperStyle={{ paddingTop: 10, fontSize: 12, fontWeight: 600 }} 
                  />
                  <Bar 
                    dataKey="cards_sold" 
                    name="Cartones Vendidos" 
                    fill="#3b82f6" 
                    radius={[6, 6, 0, 0]} 
                    maxBarSize={50}
                  >
                    {stats.salesByGame.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#3b82f6' : '#2563eb'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : chartMode === 'financial' ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.salesByGame} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="game_name" 
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    wrapperStyle={{ paddingTop: 10, fontSize: 12, fontWeight: 600 }} 
                  />
                  <Bar 
                    dataKey="revenue" 
                    name="Ingresos Totales ($)" 
                    fill="#10b981" 
                    radius={[6, 6, 0, 0]} 
                    maxBarSize={40}
                  />
                  <Bar 
                    dataKey="commissions" 
                    name="Tus Comisiones ($)" 
                    fill="#f59e0b" 
                    radius={[6, 6, 0, 0]} 
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.salesByPlayer} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    wrapperStyle={{ paddingTop: 10, fontSize: 12, fontWeight: 600 }} 
                  />
                  <Bar 
                    dataKey="card_count" 
                    name="Cartones Comprados" 
                    fill="#8b5cf6" 
                    radius={[6, 6, 0, 0]} 
                    maxBarSize={50}
                  >
                    {stats.salesByPlayer.map((entry, index) => (
                      <Cell key={`cell-player-${index}`} fill={index % 2 === 0 ? '#8b5cf6' : '#7c3aed'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Players List Table */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Users size={20} className="text-blue-500" /> Detalle de Jugadores
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Listado de personas registradas con tu código de revendedor</p>
            </div>
            <button 
              onClick={() => fetchStats(seller.code)} 
              className="px-3.5 py-1.5 bg-white border border-slate-200 shadow-sm rounded-xl text-xs font-bold text-slate-700 hover:text-blue-600 transition flex items-center gap-1.5"
            >
              <RefreshCw size={14} /> Actualizar
            </button>
          </div>
          <div className="p-0 overflow-x-auto">
            {stats.players.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-sm">
                Aún no tienes jugadores registrados. ¡Comparte tu código <b className="text-slate-800 font-mono">{seller.code}</b> para empezar a ganar!
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                    <th className="p-4 border-b">Jugador</th>
                    <th className="p-4 border-b">WhatsApp</th>
                    <th className="p-4 border-b">Ciudad</th>
                    <th className="p-4 border-b">Cartones Totales</th>
                    <th className="p-4 border-b">Ingreso Generado</th>
                    <th className="p-4 border-b">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {stats.players.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition">
                      <td className="p-4 font-bold text-slate-800">{p.name}</td>
                      <td className="p-4 text-slate-600 font-mono text-xs">{p.phone}</td>
                      <td className="p-4 text-slate-600">{p.city || '-'}</td>
                      <td className="p-4 font-black text-blue-600 tabular-nums">{p.card_count}</td>
                      <td className="p-4 font-black text-emerald-600 tabular-nums">
                        ${(p.total_revenue || 0).toLocaleString()}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                          p.status === 'approved' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {p.status === 'approved' ? 'Aprobado' : 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </main>
      
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100">
            <h2 className="text-xl font-black text-slate-800 mb-4">Actualizar Credenciales</h2>
            <form onSubmit={handleUpdateCredentials} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Correo Electrónico
                </label>
                <input 
                  required 
                  type="email" 
                  value={newEmail} 
                  onChange={e => setNewEmail(e.target.value)} 
                  className="w-full p-3 border-2 border-slate-200 rounded-2xl outline-none focus:border-slate-800 text-sm font-medium" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Nueva Contraseña (Opcional)
                </label>
                <input 
                  type="password" 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                  placeholder="Dejar en blanco para no cambiar" 
                  className="w-full p-3 border-2 border-slate-200 rounded-2xl outline-none focus:border-slate-800 text-sm font-medium" 
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowSettings(false)} 
                  className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 text-xs uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isUpdating} 
                  className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-2xl hover:bg-emerald-600 disabled:opacity-50 text-xs uppercase tracking-wider shadow-md shadow-emerald-200"
                >
                  {isUpdating ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

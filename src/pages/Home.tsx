import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Ticket, Shield, LogIn, Clock, Trophy, Zap, Star, ChevronRight, Phone, CheckCircle2, Building, ArrowRight, Calendar, MessageCircle, X, Bell, Users, Award, Plus, Key, Gift, ShieldCheck } from 'lucide-react';
import { formatCurrency } from '../utils/format';
import { useAuth } from '../AuthContext';
import { useTenant } from '../TenantContext';
import toast, { Toaster } from 'react-hot-toast';
import FloatingChatAgent from '../components/FloatingChatAgent';
import QuickBingoIndicator from '../components/QuickBingoIndicator';
import clsx from 'clsx';
import { apiFetch } from '../utils/api';
import { motion, AnimatePresence } from 'motion/react';
import WhatsAppLogo from '../components/WhatsAppLogo';

export default function Home() {
  const navigate = useNavigate();
  const { loginPlayer, user } = useAuth();
  const { tenant, tenantSlug, tenantPrefix } = useTenant();
  const [featuredGame, setFeaturedGame] = useState<any>(null);
  const [freeGames, setFreeGames] = useState<any[]>([]);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [showWhatsappModal, setShowWhatsappModal] = useState(false);
  const [showUserNotFound, setShowUserNotFound] = useState(false);
  const [timeLeft, setTimeLeft] = useState<{ days: number, hours: number, minutes: number, seconds: number } | null>(null);
  const phoneInputRef = React.useRef<HTMLInputElement>(null);

  // Auto scroll to top on load
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const checkIsFree = (g: any) => {
    if (!g) return false;
    const cardValNum = parseInt(String(g.card_value || '0').replace(/[^0-9]/g, ''), 10) || 0;
    return Boolean(
      g.is_free === true ||
      g.is_free === 'true' ||
      g.is_free === 1 ||
      g.type === 'free' ||
      cardValNum === 0 ||
      g.card_value === '0' ||
      g.card_value === '$0'
    );
  };

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const [gamesRes, settingsRes] = await Promise.all([
          apiFetch('/api/games').catch(() => null),
          apiFetch('/api/game').catch(() => null)
        ]);

        const fetchedGames = gamesRes && gamesRes.ok ? await gamesRes.json().catch(() => []) : [];
        const fetchedSettings = settingsRes && settingsRes.ok ? await settingsRes.json().catch(() => ({})) : {};
        
        console.log('Fetched games list:', fetchedGames);

        setSettings(fetchedSettings);
        
        // Categorize games
        let allGames = Array.isArray(fetchedGames) ? [...fetchedGames] : [];
        if (fetchedSettings && fetchedSettings.id && !allGames.some((g: any) => g.id === fetchedSettings.id)) {
          allGames.unshift(fetchedSettings);
        }

        allGames = allGames.map((g: any) => ({
          ...g,
          is_free: checkIsFree(g)
        }));
        
        const free = allGames.filter((g: any) => g.is_free && ['waiting', 'scheduled', 'playing', 'paused'].includes(g.status));

        // Featured game selection: priority to active games (playing/paused), then scheduled games (waiting/scheduled), then any game
        const activeGames = allGames.filter((g: any) => ['playing', 'paused'].includes(g.status)).sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
        const scheduledGames = allGames.filter((g: any) => ['waiting', 'scheduled'].includes(g.status)).sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
        const finishedGames = allGames.filter((g: any) => g.status === 'finished').sort((a: any, b: any) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
        
        const selectedFeatured = activeGames[0] || scheduledGames[0] || finishedGames[0] || allGames[0] || null;
        setFeaturedGame(selectedFeatured);
        
        // Slider: All free games
        const statusOrder: Record<string, number> = { 'playing': 1, 'paused': 2, 'scheduled': 3, 'waiting': 4 };
        setFreeGames(free.sort((a: any, b: any) => {
          if (a.status !== b.status) {
            return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
          }
          return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
        }));
      } catch (err: any) {
        // ignored
      }
    };
    fetchGames();
  }, []);

  useEffect(() => {
    if (!featuredGame?.start_time || (featuredGame.status !== 'waiting' && featuredGame.status !== 'scheduled')) {
      setTimeLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const startTime = new Date(featuredGame.start_time).getTime();
      const distance = startTime - now;

      if (distance < 0) {
        setTimeLeft(null);
        clearInterval(interval);
      } else {
        setTimeLeft({
          days: Math.floor(distance / (1000 * 60 * 60 * 24)),
          hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((distance % (1000 * 60)) / 1000)
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [featuredGame?.start_time, featuredGame?.status]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await loginPlayer(phone, password);
    } catch (error: any) {
      if (error.message && error.message.includes('Contraseña requerida')) {
        setShowPasswordInput(true);
        toast.error("Este número de WhatsApp está protegido con contraseña. Por favor ingrésala.");
      } else if (error.message && error.message.includes('Contraseña incorrecta')) {
        setShowPasswordInput(true);
        toast.error("Contraseña incorrecta. Por favor verifícala.");
      } else if (error.message && error.message.includes('Usuario no encontrado')) {
        setShowUserNotFound(true);
        setTimeout(() => {
          navigate(`${tenantPrefix ? `${tenantPrefix}/register` : '/register'}?phone=${encodeURIComponent(phone)}`);
        }, 3500);
      } else {
        toast.error(error.message || "Error al iniciar sesión");
        console.error("Error signing in", error);
      }
    } finally {
      setLoading(false);
    }
  };

  // Use an effect to redirect when user is loaded after login
  useEffect(() => {
    if (user && user.role === 'player') {
      navigate(tenantPrefix ? `${tenantPrefix}/player` : '/player');
    }
  }, [user, navigate, tenantPrefix]);

  const scrollToLogin = () => {
    const loginSection = document.getElementById('login-section');
    if (loginSection) {
      loginSection.scrollIntoView({ behavior: 'smooth' });
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans relative pb-24">
      <Toaster position="top-center" />
      {/* Top Bar (Admin link hidden but accessible) */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {user?.isSuperAdmin && (
          <Link 
            to="/super-admin" 
            className="px-4 py-2 bg-blue-600 text-white rounded-full text-xs font-black uppercase tracking-widest shadow-lg hover:bg-blue-700 transition flex items-center gap-2"
          >
            <Shield size={16} /> Super Admin
          </Link>
        )}
        <Link to="/admin" className="p-2 bg-white/10 backdrop-blur-md rounded-full text-white/70 hover:text-white hover:bg-white/20 transition flex items-center justify-center">
          <Shield size={20} />
        </Link>
      </div>

      {/* Hero Section */}
      <div className="relative bg-blue-700 text-white pt-12 pb-20 px-6 rounded-b-[2.5rem] shadow-2xl overflow-hidden">
        {/* Header Background Image */}
        {settings?.header_image_url && (
          <div 
            className="absolute inset-0 z-0 bg-cover bg-center transition-opacity duration-1000"
            style={{ 
              backgroundImage: `url(${settings.header_image_url})`,
              opacity: settings.header_opacity ?? 0.4
            }}
          />
        )}
        
        <div className="relative z-20 flex flex-col items-center text-center">
          {tenantSlug ? (
            <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-slate-900/90 backdrop-blur-md text-xs font-black text-amber-300 border border-amber-400/50 shadow-2xl mb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
              <span>🏢 SALA: {tenant.name.toUpperCase()}</span>
              {tenant.access_code && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(tenant.access_code || '');
                    toast.success(`Código de sala copiado: ${tenant.access_code}`);
                  }}
                  title="Clic para copiar código de acceso seguro"
                  className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-400/30 text-[10px] font-mono flex items-center gap-1 transition active:scale-95 cursor-pointer"
                >
                  <Key size={10} className="text-emerald-300" />
                  PIN: {tenant.access_code}
                </button>
              )}
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-black text-yellow-300 border border-white/10 shadow-lg animate-pulse uppercase tracking-[0.2em] mb-4">
              <Star size={12} className="fill-yellow-300" /> ¡El Bingo Más Regalón!
            </div>
          )}

          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-3 drop-shadow-2xl leading-[0.9]">
            {tenantSlug ? (
              <>SALA <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500">{tenant.name.toUpperCase()}</span></>
            ) : settings?.header_title?.split(' ').map((word: string, i: number) => (
              <React.Fragment key={i}>
                {i > 0 && ' '}
                {i === settings?.header_title?.split(' ').length - 1 ? (
                   <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500">{word}</span>
                ) : word}
              </React.Fragment>
            )) || <>BINGO <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500">ONLINE</span></>}
          </h1>

          <p className="text-blue-100 text-base md:text-lg font-bold max-w-md drop-shadow-md leading-snug mb-6">
            {tenant.description || settings?.header_subtitle || 'Juega desde tu celular, gana premios al instante y diviértete en grande.'}
          </p>

          {/* Button LEER PRIMERO ¡AQUÍ ESTOY! placed right after subtitle, centered */}
          <div className="flex justify-center w-full">
            <Link 
              to={tenantPrefix ? `${tenantPrefix}/dynamics` : "/dynamics"}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 text-yellow-950 font-black text-xs md:text-sm uppercase tracking-wider shadow-2xl hover:scale-105 active:scale-95 transition-all border-2 border-white/50 group relative"
            >
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
              </span>
              <motion.span 
                animate={{ x: [0, 4, 0] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="text-lg"
              >
                👋
              </motion.span>
              <span>LEER PRIMERO</span>
              <span className="text-red-700 bg-yellow-100 px-2.5 py-0.5 rounded-full font-black text-[11px] shadow-sm group-hover:scale-105 transition-transform">
                ¡AQUÍ ESTOY!
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 px-4 -mt-12 relative z-10 max-w-lg mx-auto w-full space-y-8">
        
        {/* Quick Bingo Indicator */}
        <QuickBingoIndicator onBuyCard={scrollToLogin} />

        {/* Featured Game Promo Card (Free or Paid) */}
        {featuredGame ? (
          <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden transform transition hover:scale-[1.01]">
            <div className={clsx(
              "p-6 text-center relative overflow-hidden",
              checkIsFree(featuredGame) 
                ? "bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700" 
                : "bg-gradient-to-br from-indigo-600 via-blue-600 to-blue-700"
            )}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-yellow-400/10 rounded-full blur-xl -ml-6 -mb-6"></div>
              
              <div className="inline-block px-3 py-1 bg-yellow-400 text-yellow-950 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-3 border border-yellow-200 shadow-lg animate-pulse">
                {checkIsFree(featuredGame)
                  ? (featuredGame.status === 'playing' ? '🎉 ¡JUEGO GRATIS EN VIVO!' : '🎉 ¡JUEGO GRATUITO PROGRAMADO!')
                  : (featuredGame.status === 'playing' ? '¡JUEGO EN VIVO!' : 'PRÓXIMO JUEGO PREMIUM')}
              </div>

              <div className="relative z-20 mb-3 flex justify-center">
                <div className="bg-red-600 text-white font-black text-[10px] uppercase tracking-[0.2em] px-3 py-1 rounded-full border-2 border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.7)] animate-pulse">
                  {checkIsFree(featuredGame) ? 'Inscripción Abierta' : 'Venta Abierta'}
                </div>
              </div>
              
              <h2 className="text-3xl font-black text-white uppercase tracking-tight relative z-10 drop-shadow-md">
                {featuredGame.name || (checkIsFree(featuredGame) ? 'GRAN BINGO GRATIS' : 'BINGO PREMIUM')}
              </h2>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-emerald-50 rounded-3xl p-4 text-center border border-emerald-100 shadow-sm relative overflow-hidden group">
                  <div className="absolute inset-0 bg-emerald-100 opacity-0 group-hover:opacity-20 transition-opacity"></div>
                  <span className="block text-[10px] font-black text-emerald-600 uppercase mb-1 tracking-widest relative z-10">Premio Mayor</span>
                  <span className="block text-2xl font-black text-emerald-700 flex items-center justify-center gap-1.5 relative z-10">
                    <Trophy size={20} className="text-yellow-500 fill-yellow-500" /> {formatCurrency(featuredGame.prize)}
                  </span>
                </div>
                <div className="bg-blue-50 rounded-3xl p-4 text-center border border-blue-100 shadow-sm relative overflow-hidden group">
                  <div className="absolute inset-0 bg-blue-100 opacity-0 group-hover:opacity-20 transition-opacity"></div>
                  <span className="block text-[10px] font-black text-blue-600 uppercase mb-1 tracking-widest relative z-10">Costo Cartón</span>
                  <span className="block text-xl sm:text-2xl font-black text-blue-700 flex items-center justify-center gap-1 relative z-10">
                    {checkIsFree(featuredGame) ? (
                      <span className="text-emerald-600 font-extrabold text-lg sm:text-xl">¡GRATIS! 🎁</span>
                    ) : (
                      <><Ticket size={20} className="text-blue-500" /> {formatCurrency(featuredGame.card_value)}</>
                    )}
                  </span>
                </div>
                <div className="bg-slate-900 rounded-[2rem] p-4 text-center border border-slate-700 col-span-2 shadow-xl">
                  <span className="block text-[10px] font-black text-yellow-400 uppercase mb-2 tracking-[0.2em] opacity-80">Fecha de Sorteo</span>
                  <span className="block text-sm font-black text-white flex items-center justify-center gap-3">
                    <Calendar size={16} className="text-yellow-400" /> 
                    {new Date(featuredGame.start_time).toLocaleDateString('es-ES', { 
                      weekday: 'long', 
                      day: 'numeric', 
                      month: 'long', 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                </div>
              </div>

              {timeLeft && (
                <div className="bg-gradient-to-b from-slate-800 to-slate-950 rounded-3xl p-5 text-white shadow-2xl mb-6 border border-slate-700/50">
                  <p className="text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">INICIA EN:</p>
                  <div className="flex justify-center gap-5">
                    <div className="flex flex-col items-center">
                      <span className="text-3xl font-black text-white leading-none mb-1">{timeLeft.days}</span>
                      <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Días</span>
                    </div>
                    <div className="text-slate-700 font-black text-2xl">:</div>
                    <div className="flex flex-col items-center">
                      <span className="text-3xl font-black text-white leading-none mb-1">{timeLeft.hours.toString().padStart(2, '0')}</span>
                      <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Horas</span>
                    </div>
                    <div className="text-slate-700 font-black text-2xl">:</div>
                    <div className="flex flex-col items-center">
                      <span className="text-3xl font-black text-white leading-none mb-1">{timeLeft.minutes.toString().padStart(2, '0')}</span>
                      <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Min</span>
                    </div>
                    <div className="text-slate-700 font-black text-2xl">:</div>
                    <div className="flex flex-col items-center">
                      <span className="text-3xl font-black text-yellow-400 leading-none mb-1">{timeLeft.seconds.toString().padStart(2, '0')}</span>
                      <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Seg</span>
                    </div>
                  </div>
                </div>
              )}

              {checkIsFree(featuredGame) ? (
                <button 
                  onClick={() => navigate(`${tenantPrefix ? `${tenantPrefix}/register` : '/register'}?gameId=${featuredGame.id}&free=true`)}
                  className="w-full py-5 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black text-xl rounded-3xl shadow-xl shadow-emerald-500/30 transform transition active:scale-[0.98] flex items-center justify-center gap-3 border-b-4 border-emerald-700 uppercase tracking-wide"
                >
                  <Gift size={24} className="animate-bounce" /> ¡OBTENER MIS 2 CARTONES GRATIS!
                </button>
              ) : (
                <button 
                  onClick={() => navigate(`${tenantPrefix ? `${tenantPrefix}/register` : '/register'}?gameId=${featuredGame.id}`)}
                  className="w-full py-5 bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 text-yellow-950 font-black text-xl rounded-3xl shadow-xl shadow-yellow-500/20 transform transition active:scale-[0.98] flex items-center justify-center gap-3 border-b-4 border-yellow-600 uppercase tracking-wide"
                >
                  <Ticket size={24} /> ¡COMPRAR MI CARTÓN!
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-10 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-100">
              <Clock size={40} className="text-slate-300" />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-2 uppercase tracking-tight">Próximamente</h3>
            <p className="text-slate-500 font-medium leading-relaxed">Estamos preparando el próximo gran sorteo con premios increíbles. ¡Mantente atento!</p>
          </div>
        )}

        {/* Free Games Section */}
        {freeGames.length > 0 && (
          <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700 text-white rounded-[2.5rem] shadow-2xl p-6 sm:p-8 space-y-4 relative overflow-hidden border border-emerald-400/30">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white/20 backdrop-blur-md text-yellow-300 rounded-2xl border border-white/20 shadow-lg">
                  <Gift size={28} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-200 block">Sorteos de Cortesía</span>
                  <h3 className="font-black text-white uppercase tracking-tight text-xl sm:text-2xl">Juegos Gratuitos</h3>
                </div>
              </div>
              <Link 
                to={tenantPrefix ? `${tenantPrefix}/free-games` : "/free-games"}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-2xl text-xs font-black uppercase tracking-widest transition flex items-center gap-1 border border-white/30 shadow-md"
              >
                Ver Todos <ChevronRight size={16} />
              </Link>
            </div>

            <div className="space-y-3 pt-2">
              {freeGames.map((fg: any) => (
                <div key={fg.id} className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                  <div className="space-y-1">
                    <div className="flex items-center justify-center sm:justify-start gap-2">
                      <span className="px-2 py-0.5 bg-yellow-400 text-yellow-950 rounded-md font-black text-[9px] uppercase tracking-wider">
                        Gratis
                      </span>
                      <h4 className="font-black text-white text-base leading-tight">{fg.name || 'Juego Gratis'}</h4>
                    </div>
                    <p className="text-xs text-emerald-100 font-bold flex items-center justify-center sm:justify-start gap-1">
                      <Calendar size={13} className="text-yellow-300" />
                      {new Date(fg.start_time).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-white/10 pt-2 sm:pt-0">
                    <div className="text-left sm:text-right">
                      <span className="text-[9px] text-emerald-200 uppercase font-black block">Premio</span>
                      <span className="text-lg font-black text-yellow-300">{formatCurrency(fg.prize)}</span>
                    </div>
                    <button 
                      onClick={() => navigate(`${tenantPrefix ? `${tenantPrefix}/register` : '/register'}?gameId=${fg.id}&free=true`)}
                      className="px-4 py-2.5 bg-yellow-400 hover:bg-yellow-300 text-yellow-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition active:scale-95 flex items-center gap-1.5 shrink-0"
                    >
                      <Gift size={16} /> ¡Participar Gratis!
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Buy Cards Fast CTA */}
        <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-1">
          <Link 
            to={tenantPrefix ? `${tenantPrefix}/register` : "/register"} 
            className="group relative overflow-hidden block w-full py-6 px-6 bg-slate-900 text-white rounded-[1.4rem] shadow-2xl transform transition active:scale-[0.98]"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-blue-600/40 transition-colors"></div>
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/10 rounded-3xl flex items-center justify-center backdrop-blur-md border border-white/10 group-hover:rotate-6 transition-transform">
                  <Ticket size={30} className="text-yellow-400" />
                </div>
                <div className="text-left">
                  <span className="block text-2xl font-black leading-none mb-1 text-white tracking-tight">¡VINCÚLATE YA!</span>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Adquiere tus cartones al instante</p>
                </div>
              </div>
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center border border-white/5 group-hover:translate-x-1 transition-all">
                <ChevronRight size={24} className="text-yellow-400" />
              </div>
            </div>
          </Link>
        </div>

        {/* Secondary CTA - Login */}
        <div id="login-section" className="relative group max-w-2xl mx-auto mb-16">
          <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/10 via-blue-500/10 to-purple-500/10 rounded-[3rem] blur-xl opacity-0 group-hover:opacity-100 transition duration-700"></div>
          
          <div className="relative border border-white/10 rounded-[2.75rem] p-10 shadow-2xl overflow-hidden min-h-[420px] flex flex-col justify-center">
            {/* Background Image with Overlay */}
            <div 
              className="absolute inset-0 z-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110" 
              style={{ backgroundImage: `url('${settings?.login_bg_image_url || '/src/assets/images/bingo_player_woman_bg_1782074519120.jpg'}')` }}
            />
            <div 
              className="absolute inset-0 z-0 bg-slate-900 backdrop-blur-[1px]" 
              style={{ opacity: 1 - (settings?.login_bg_opacity ?? 0.6) }}
            />

            <div className="text-left mb-8 relative z-10 px-2">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-emerald-500/20 backdrop-blur-md rounded-xl border border-white/20 shadow-inner shrink-0">
                  <LogIn className="text-emerald-400" size={18} />
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tighter drop-shadow-lg leading-tight">
                  ¿Ya tienes tus cartones?
                </h3>
              </div>
              <p className="text-white/90 font-bold text-xs sm:text-sm drop-shadow-md leading-relaxed">
                Ingresa con tu número para gestionar tus juegos y marcar tus números en vivo.
              </p>
            </div>
          
          <form onSubmit={handleLogin} className="space-y-6 relative z-10 flex flex-col items-center w-full">
            <div className="relative group/input w-full">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none z-20">
                <div className="p-2 bg-emerald-500/30 backdrop-blur-sm rounded-xl border border-white/20 shadow-lg">
                  <MessageCircle className="text-white" size={18} />
                </div>
              </div>
              <input 
                ref={phoneInputRef}
                required
                type="tel"
                placeholder="Número de WhatsApp (Ej: 3001234567)"
                className="w-full p-4 pl-16 bg-black/60 backdrop-blur-md border-2 border-white/50 focus:border-emerald-500 focus:bg-black/80 rounded-2xl outline-none transition-all font-bold text-lg text-white placeholder:text-white/60 placeholder:text-base placeholder:font-medium placeholder:normal-case placeholder:tracking-normal shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </div>

            {showPasswordInput && (
              <div className="relative group/input w-full animate-fadeIn">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none z-20">
                  <div className="p-2 bg-emerald-500/30 backdrop-blur-sm rounded-xl border border-white/20 shadow-lg">
                    <Key className="text-white" size={18} />
                  </div>
                </div>
                <input 
                  required
                  type="password"
                  placeholder="Ingresa tu contraseña"
                  className="w-full p-4 pl-16 bg-black/60 backdrop-blur-md border-2 border-white/50 focus:border-emerald-500 focus:bg-black/80 rounded-2xl outline-none transition-all font-bold text-lg text-white placeholder:text-white/60 placeholder:text-base placeholder:font-medium placeholder:normal-case placeholder:tracking-normal shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
            )}
            <button 
              type="submit"
              disabled={loading}
              className="w-full max-w-[280px] py-3.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-500 text-white font-black text-sm rounded-xl shadow-[0_10px_40px_-10px_rgba(16,185,129,0.5)] transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 border-b-4 border-emerald-700 uppercase tracking-wider whitespace-nowrap"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <LogIn size={18} /> INGRESAR AHORA
                </>
              )}
            </button>
            <p className="text-center text-[11px] text-white/50 font-bold uppercase tracking-widest mt-8 w-full">
              PLATAFORMA 100% SEGURA
            </p>
          </form>
          </div>
        </div>

        {/* Trust Indicators / Features */}
        <div className="grid grid-cols-3 gap-3 pt-4 pb-8">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-2 shadow-sm border border-blue-100">
              <Zap size={24} />
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase">Premios al Instante</span>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mb-2 shadow-sm border border-green-100">
              <Shield size={24} />
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase">100% Seguro</span>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-2 shadow-sm border border-purple-100">
              <CheckCircle2 size={24} />
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase">Fácil de Jugar</span>
          </div>
        </div>

      </div>

      {/* Sticky Bottom Bar for Mobile */}
      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-50 md:hidden flex gap-3">
        <Link 
          to={tenantPrefix ? `${tenantPrefix}/register` : "/register"} 
          className="flex-1 py-3.5 bg-yellow-400 text-yellow-950 font-black text-center rounded-xl shadow-sm active:scale-95 transition flex items-center justify-center gap-2"
        >
          <Ticket size={18} /> COMPRAR
        </Link>
        <button 
          onClick={scrollToLogin}
          className="flex-1 py-3.5 bg-emerald-500 text-white font-black text-center rounded-xl shadow-[0_4px_10px_rgba(16,185,129,0.2)] active:scale-95 transition flex items-center justify-center gap-2"
        >
          <LogIn size={18} /> INGRESAR
        </button>
      </div>
      {/* Floating WhatsApp Button */}
      {settings?.whatsapp_group_link && (
        <motion.button
          initial={{ opacity: 0, y: 100, scale: 0.5 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', damping: 15, stiffness: 100, delay: 1 }}
          onClick={() => setShowWhatsappModal(true)}
          className="fixed bottom-24 md:bottom-8 left-6 z-40 group flex items-center gap-2.5 bg-[#25D366] hover:bg-[#20ba5a] text-white p-2.5 px-3.5 md:p-3.5 md:px-5 rounded-full shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 border-2 border-white/30"
        >
          <div className="relative flex items-center justify-center shrink-0">
            <div className="absolute inset-0 bg-white rounded-full animate-ping opacity-25 scale-150"></div>
            <WhatsAppLogo size={32} className="md:w-9 md:h-9" />
          </div>
          <div className="flex flex-col items-start pl-0.5 text-left">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-100 opacity-90 leading-none mb-0.5">
              Comunidad VIP
            </span>
            <span className="text-xs md:text-sm font-black leading-tight whitespace-nowrap">
              Únete al WhatsApp
            </span>
          </div>
        </motion.button>
      )}

      {/* WhatsApp Community Modal */}
      <AnimatePresence>
        {showWhatsappModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWhatsappModal(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 50 }}
              className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-y-auto max-h-[calc(100vh-2rem)] scrollbar-thin border border-slate-100"
            >
              <button 
                onClick={() => setShowWhatsappModal(false)}
                className="absolute top-4 right-4 z-20 p-2.5 bg-white hover:bg-slate-100 text-slate-800 rounded-full transition-all duration-200 shadow-lg border border-slate-100 active:scale-95"
                title="Cerrar modal"
              >
                <X size={18} className="stroke-[3]" />
              </button>

              <div className="bg-emerald-600 p-6 md:p-8 text-center text-white relative overflow-hidden">
                <motion.div 
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 4 }}
                  className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" 
                />
                <div className="relative z-10 inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 bg-white/20 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl mb-3 md:mb-4">
                  <WhatsAppLogo size={44} className="md:w-14 md:h-14" />
                </div>
                <h3 className="text-2xl md:text-3xl font-black leading-tight tracking-tighter uppercase italic">
                  ¡Únete a la <span className="text-emerald-200">Comunidad VIP!</span>
                </h3>
              </div>

              <div className="p-6 md:p-8 space-y-4 md:space-y-6">
                <div className="space-y-3 md:space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-9 h-9 md:w-10 md:h-10 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0 border border-emerald-100">
                      <Bell size={18} className="text-emerald-600 md:w-5 md:h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800 uppercase tracking-tight leading-none mb-1">Enterate de primero</p>
                      <p className="text-xs text-slate-500 font-medium leading-normal">Anunciamos nuevos juegos programados antes que nadie.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-4">
                    <div className="w-9 h-9 md:w-10 md:h-10 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0 border border-emerald-100">
                      <Users size={18} className="text-emerald-600 md:w-5 md:h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800 uppercase tracking-tight leading-none mb-1">Comunidad Activa</p>
                      <p className="text-xs text-slate-500 font-medium leading-normal">Comparte con otros jugadores y mira los testimonios reales.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-9 h-9 md:w-10 md:h-10 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0 border border-emerald-100">
                      <Award size={18} className="text-emerald-600 md:w-5 md:h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800 uppercase tracking-tight leading-none mb-1">Noticias de Ganadores</p>
                      <p className="text-xs text-slate-500 font-medium leading-normal">Mira quién ganó el último bingo y sus comprobantes de pago.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 italic">
                  <p className="text-xs font-bold text-slate-600 leading-relaxed text-center">
                    "Es vital participar en el grupo para mantenerse informado sobre novedades, pagos y el calendario de juegos."
                  </p>
                </div>

                <div className="space-y-3">
                  <a 
                    href={settings?.whatsapp_group_link || 'https://chat.whatsapp.com/CDgs5mXL8HWGJjbJn0VxHk'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative flex w-full py-4 bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white rounded-2xl shadow-[0_12px_24px_rgba(16,185,129,0.25)] transform transition-all duration-300 hover:scale-[1.02] active:scale-95 text-center justify-center font-black text-base md:text-lg tracking-tight overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 skew-x-12" />
                    <span className="flex items-center justify-center gap-2">
                      INGRESAR AL GRUPO <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </span>
                  </a>

                  <button
                    onClick={() => setShowWhatsappModal(false)}
                    className="w-full py-2.5 text-xs font-black text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest text-center"
                  >
                    Omitir por ahora
                  </button>
                </div>
                
                <p className="text-[10px] text-center font-black text-slate-300 uppercase tracking-[0.2em] pt-1">Más de 500 miembros activos</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="text-center py-6 pb-20 relative z-20">
        <Link to="/seller" className="text-xs font-bold text-white/40 hover:text-white/80 transition-colors">
          ¿Eres revendedor? Ingresa aquí
        </Link>
      </div>

      <AnimatePresence>
        {showUserNotFound && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl"
            />
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-gradient-to-br from-emerald-500 via-emerald-400 to-orange-500 p-1 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden"
            >
              <div className="bg-white rounded-[2.3rem] p-8 text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full blur-3xl -mr-16 -mt-16 opacity-50"></div>
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-orange-50 rounded-full blur-3xl -ml-16 -mb-16 opacity-50"></div>
                
                <div className="relative z-10">
                  <div className="w-20 h-20 bg-gradient-to-tr from-emerald-100 to-orange-100 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                    <Users size={40} className="text-emerald-600 animate-pulse" />
                  </div>
                  
                  <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mb-3 leading-tight">
                    ¡Hola! No te encontramos
                  </h3>
                  
                  <p className="text-slate-600 font-bold text-sm leading-relaxed mb-8">
                    Parece que aún no eres parte de la familia. No te preocupes, te llevaremos al registro para que empieces a ganar.
                  </p>
                  
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-full border border-slate-100">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Redirigiendo...</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <FloatingChatAgent />
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Ticket, Shield, LogIn, Clock, Trophy, Zap, Star, ChevronRight, Phone, CheckCircle2, Building, ArrowRight, Calendar, MessageCircle, X, Bell, Users, Award, Plus, Key, Gift, ShieldCheck, Lock, Eye, EyeOff, Search, Loader2, Sparkles, Share2, Copy, BookOpen } from 'lucide-react';
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
import defaultLoginBg from '../assets/images/bingo_player_woman_bg_1782074519120.jpg';

export default function Home() {
  const navigate = useNavigate();
  const { loginPlayer, user } = useAuth();
  const { tenant, tenantSlug, tenantPrefix } = useTenant();
  const [featuredGame, setFeaturedGame] = useState<any>(null);
  const [freeGames, setFreeGames] = useState<any[]>([]);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [roomCode, setRoomCode] = useState(tenant?.access_code || '');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [showWhatsappModal, setShowWhatsappModal] = useState(false);
  const [showUserNotFound, setShowUserNotFound] = useState(false);
  const [timeLeft, setTimeLeft] = useState<{ days: number, hours: number, minutes: number, seconds: number } | null>(null);
  const [hasPaidGames, setHasPaidGames] = useState<boolean>(false);
  const phoneInputRef = React.useRef<HTMLInputElement>(null);



  // Estados para solicitud técnica de recuperación de contraseña
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [resetPhone, setResetPhone] = useState('');
  const [resetName, setResetName] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);

  // Estados y lógica para compartir en redes sociales la invitación de la sala
  const [showSocialShareModal, setShowSocialShareModal] = useState(false);
  const [socialInviteData, setSocialInviteData] = useState<any>(null);
  const [isGeneratingSocialLink, setIsGeneratingSocialLink] = useState(false);

  const fetchSocialShareData = async (targetNetwork = 'general') => {
    if (socialInviteData && socialInviteData._network === targetNetwork) return socialInviteData;
    setIsGeneratingSocialLink(true);
    try {
      const tenantKey = tenantSlug || tenant?.slug || 'bingo-lite';
      const res = await apiFetch('/api/gift-invitations/social-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_phone: user?.phone || '',
          tenantId: tenantKey,
          network: targetNetwork
        })
      });
      if (res.ok) {
        const data = await res.json();
        data._network = targetNetwork;
        setSocialInviteData(data);
        return data;
      }
    } catch (err) {
      console.error('Error fetching social share data:', err);
    } finally {
      setIsGeneratingSocialLink(false);
    }
    return null;
  };

  const handleOpenSocialShareModal = async () => {
    setShowSocialShareModal(true);
    await fetchSocialShareData('whatsapp');
  };

  const handleSocialShareWhatsApp = async () => {
    const data = await fetchSocialShareData('whatsapp');
    const fallbackUrl = window.location.href;
    const smartLink = data?.smartUrl || data?.registerUrl || fallbackUrl;
    let msg = data?.message || `🎉 ¡Te invito a jugar en ${tenant?.name || 'Bingo Live'}! Reclama tu cartón gratis:\n${smartLink}`;
    if (!msg.includes(smartLink)) {
      msg = `${msg.trim()}\n\n👉 *Reclama tu cartón gratis aquí:*\n${smartLink}`;
    }
    const encoded = encodeURIComponent(msg);
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = `whatsapp://send?text=${encoded}`;
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    }
    toast.success('🎁 ¡Abriendo WhatsApp con tu invitación!');
  };

  const handleSocialShareFacebook = async () => {
    const data = await fetchSocialShareData('facebook');
    const shareUrl = data?.smartUrl || data?.registerUrl || window.location.href;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank', 'width=600,height=500');
    toast.success('¡Abriendo Facebook para compartir tu invitación!');
  };

  const handleSocialShareCopy = async () => {
    const data = socialInviteData || (await fetchSocialShareData());
    const linkToCopy = data?.smartUrl || data?.registerUrl || window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(linkToCopy);
      toast.success('¡Enlace inteligente copiado al portapapeles! 🚀');
    }
  };

  const handleSocialShareNative = async () => {
    const data = socialInviteData || (await fetchSocialShareData());
    const shareUrl = data?.smartUrl || data?.registerUrl || window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Invitación a ${tenant?.name || 'Bingo Live'}`,
          text: data?.message,
          url: shareUrl
        });
      } catch (e) {}
    }
  };



  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanP = resetPhone.replace(/\D/g, '');
    if (!cleanP || cleanP.length !== 10) {
      toast.error('Por favor ingresa un número de WhatsApp válido de 10 dígitos.');
      return;
    }
    if (!resetName.trim()) {
      toast.error('Por favor ingresa tu nombre de registro.');
      return;
    }

    setIsSubmittingReset(true);
    try {
      const res = await apiFetch('/api/support/tickets/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanP,
          name: resetName,
          email: resetEmail,
          message: resetMessage,
          tenant_id: tenantSlug || tenant?.slug || 'bingo-lite'
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error al enviar la solicitud');
      }

      toast.success('¡Solicitud técnica enviada! Tu contraseña se restablecerá temporalmente a 123456.', { duration: 6000 });
      setShowPasswordResetModal(false);
      setResetPhone('');
      setResetName('');
      setResetEmail('');
      setResetMessage('');
    } catch (err: any) {
      toast.error(err.message || 'Error al enviar la solicitud técnica');
    } finally {
      setIsSubmittingReset(false);
    }
  };

  // Auto scroll to top on load
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Pre-cargar automáticamente el código de acceso de la sala activa
  useEffect(() => {
    if (tenant?.access_code) {
      setRoomCode(tenant.access_code);
    }
  }, [tenant?.access_code]);

  const checkIsFree = (g: any) => {
    if (!g) return false;
    if (g.is_free === false || g.type === 'paid') return false;
    const cardValNum = parseInt(String(g.card_value || '0').replace(/[^0-9]/g, ''), 10) || 0;
    if (cardValNum > 0) return false;
    return Boolean(
      g.is_free === true ||
      g.is_free === 'true' ||
      g.is_free === 1 ||
      g.type === 'free' ||
      (typeof g.card_value === 'string' && g.card_value.toLowerCase().includes('gratis'))
    );
  };

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const tenantParam = tenantSlug ? `?tenantId=${encodeURIComponent(tenantSlug)}` : '';
        const [gamesRes, settingsRes] = await Promise.all([
          apiFetch(`/api/games${tenantParam}`).catch(() => null),
          apiFetch(`/api/game${tenantParam}`).catch(() => null)
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
        const paidScheduled = allGames.some((g: any) => !g.is_free && ['waiting', 'scheduled', 'playing', 'paused'].includes(g.status));
        setHasPaidGames(paidScheduled);

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
  }, [tenantSlug]);

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
    if (!phone.trim()) {
      toast.error("Por favor ingresa tu número de WhatsApp");
      return;
    }
    if (!password.trim()) {
      toast.error("Por favor ingresa tu contraseña de usuario");
      return;
    }
    if (!roomCode.trim()) {
      toast.error("Por favor ingresa el código de seguridad de la sala");
      return;
    }

    setLoading(true);
    try {
      const data = await loginPlayer(
        phone, 
        password, 
        undefined, 
        roomCode.trim().toUpperCase(), 
        tenantSlug || ''
      );
      const targetSlug = data.room_slug || tenantSlug || 'bingo-lite';
      const cleanSlug = targetSlug === 'default' ? 'demo' : targetSlug;
      toast.success(`¡Acceso concedido a la sala ${tenant?.name || cleanSlug}!`, {
        id: 'login-success-toast',
        duration: 2500
      });
      setTimeout(() => {
        try { toast.dismiss('login-success-toast'); } catch (e) {}
      }, 2600);
      navigate(`/sala/${cleanSlug}/player`);
    } catch (error: any) {
      const msg = error.message || 'Error al iniciar sesión';
      if (msg.includes('No estás registrado en la sala') || msg.includes('notRegisteredInRoom') || msg.includes('Usuario no encontrado')) {
        setShowUserNotFound(true);
        setTimeout(() => {
          const registerUrl = tenantPrefix ? `${tenantPrefix}/register` : '/register';
          navigate(`${registerUrl}?phone=${encodeURIComponent(phone)}`);
        }, 3500);
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Redirigir únicamente si el usuario pertenece estrictamente a esta sala
  useEffect(() => {
    if (user && user.role === 'player') {
      const rawUserTenant = (user.tenant_id || 'bingo-lite').toLowerCase();
      const userTenant = rawUserTenant === 'default' ? 'demo' : rawUserTenant;
      const rawCurrentTenant = (tenantSlug || 'bingo-lite').toLowerCase();
      const currentTenant = rawCurrentTenant === 'default' ? 'demo' : rawCurrentTenant;
      if (userTenant === currentTenant) {
        navigate(tenantPrefix ? `${tenantPrefix}/player` : `/sala/${currentTenant}/player`);
      }
    }
  }, [user, navigate, tenantPrefix, tenantSlug]);

  const scrollToLogin = () => {
    const loginSection = document.getElementById('login-section');
    if (loginSection) {
      loginSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      <div className="min-h-screen flex flex-col font-sans relative pb-24 bg-slate-50 text-slate-900">
        {/* Top Bar (Enlaces administrativos) */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
          {user?.isSuperAdmin && (
            <Link 
              to="/super-admin" 
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-black uppercase tracking-wider shadow-lg transition flex items-center gap-1.5"
            >
              <Shield size={14} /> <span>Super Admin</span>
            </Link>
          )}
          <Link 
            to={tenantSlug ? `/sala/${tenantSlug}/admin/login` : "/admin/login"} 
            className="px-3 py-1.5 bg-slate-900/80 hover:bg-slate-900 text-amber-300 hover:text-amber-200 border border-amber-400/40 rounded-full text-xs font-black uppercase tracking-wider shadow-lg backdrop-blur-md transition flex items-center gap-1.5 transform hover:scale-105 active:scale-95"
            title="Acceso al panel administrativo de la sala"
          >
            <Shield size={14} className="text-amber-400" />
            <span>Admin Acceso</span>
          </Link>
        </div>

        {/* Hero Section */}
        <div className="relative text-white pt-10 pb-16 px-6 rounded-b-[2.5rem] shadow-2xl overflow-hidden transition-all duration-500 bg-blue-700">
          {/* Header Background Image */}
          {settings?.header_image_url && settings.header_image_url !== 'none' && (
            <div 
              className="absolute inset-0 z-0 bg-cover bg-center transition-opacity duration-1000"
              style={{ 
                backgroundImage: `url(${settings.header_image_url})`,
                opacity: settings.header_opacity ?? 0.4
              }}
            />
          )}
          
          <div className="relative z-20 flex flex-col items-center text-center">
            {/* Logo personalizado de la sala si está configurado */}
            {tenant.logo_url ? (
              <div className="mb-4 flex items-center justify-center">
                <img 
                  src={tenant.logo_url} 
                  alt={tenant.name} 
                  className="h-16 md:h-20 w-auto max-w-[220px] object-contain drop-shadow-xl rounded-2xl bg-white/10 p-2 backdrop-blur-md border border-white/20" 
                />
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-black text-yellow-300 border border-white/10 shadow-lg animate-pulse uppercase tracking-[0.2em] mb-4">
                <Star size={12} className="fill-yellow-300" /> ¡El Bingo Más Regalón!
              </div>
            )}

            <p className="text-blue-100 text-sm md:text-base font-bold max-w-md drop-shadow-md leading-snug mb-5">
              {tenant.description || settings?.header_subtitle || 'Juega desde tu celular, gana premios al instante y diviértete en grande.'}
            </p>

            {/* Botón Leer Instrucciones */}
            <div className="flex justify-center w-full">
              <Link 
                to={tenantPrefix ? `${tenantPrefix}/dynamics` : "/dynamics"}
                className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 text-yellow-950 font-black text-xs md:text-sm uppercase tracking-wider shadow-2xl hover:scale-105 active:scale-95 transition-all border-2 border-white/50 group relative"
              >
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
                </span>
                <BookOpen size={16} className="text-yellow-950 shrink-0" />
                <span>Leer Instrucciones</span>
              </Link>
            </div>
          </div>
        </div>

      {/* Main Content Area */}
      <div className="flex-1 px-4 -mt-10 relative z-10 max-w-lg mx-auto w-full space-y-4">
        
        {/* Quick Bingo Indicator */}
        <QuickBingoIndicator onBuyCard={scrollToLogin} />

        {/* Título y Código de la Sala colocado sobre la tarjeta de juegos pagos programados */}
        {(tenantSlug || tenant?.name) && (
          <div className="bg-slate-900/95 backdrop-blur-md text-white rounded-2xl sm:rounded-3xl p-3 sm:p-3.5 px-4 sm:px-5 shadow-xl border border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 block leading-none mb-0.5">
                  Sala
                </span>
                <h2 className="text-sm sm:text-base font-black text-amber-300 uppercase truncate tracking-tight">
                  {tenant.name || 'Bingo Live'}
                </h2>
              </div>
            </div>

            {tenant.access_code && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(tenant.access_code || '');
                  toast.success(`Código de sala copiado: ${tenant.access_code}`);
                }}
                title="Clic para copiar código de acceso seguro"
                className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 text-xs font-mono font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0 shadow-sm"
              >
                <Key size={13} className="text-emerald-300" />
                <span>PIN: {tenant.access_code}</span>
                <Copy size={11} className="text-emerald-400/70" />
              </button>
            )}
          </div>
        )}

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
              
              {/* Aviso de Juego Gratuito / Programado / En Vivo - Agrandado */}
              <div className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-xs sm:text-sm font-black uppercase tracking-[0.15em] mb-3 border-2 shadow-xl animate-pulse bg-yellow-400 text-yellow-950 border-yellow-200">
                {checkIsFree(featuredGame)
                  ? (featuredGame.status === 'playing' ? '🎉 ¡JUEGO GRATIS EN VIVO!' : '🎉 ¡JUEGO GRATUITO PROGRAMADO!')
                  : (featuredGame.status === 'playing' ? '🔥 ¡JUEGO EN VIVO!' : '⭐ PRÓXIMO JUEGO PREMIUM')}
              </div>

              <div className="relative z-20 mb-3 flex justify-center">
                <div className="bg-red-600 text-white font-black text-[10px] uppercase tracking-[0.2em] px-3.5 py-1 rounded-full border-2 border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.7)] animate-pulse">
                  {checkIsFree(featuredGame) ? 'Inscripción Abierta' : 'Venta Abierta'}
                </div>
              </div>
              
              <h2 className="text-3xl font-black text-white uppercase tracking-tight relative z-10 drop-shadow-md">
                {featuredGame.name || (checkIsFree(featuredGame) ? 'GRAN BINGO GRATIS' : 'BINGO PREMIUM')}
              </h2>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="rounded-3xl p-4 text-center shadow-sm relative overflow-hidden group bg-emerald-50 border border-emerald-100 text-emerald-700">
                  <div className="absolute inset-0 bg-emerald-100 opacity-0 group-hover:opacity-20 transition-opacity"></div>
                  <span className="block text-[10px] font-black uppercase mb-1 tracking-widest relative z-10 text-emerald-600">Premio Mayor</span>
                  <span className="block text-2xl font-black flex items-center justify-center gap-1.5 relative z-10 text-emerald-700">
                    <Trophy size={20} className="text-yellow-500 fill-yellow-500" /> {formatCurrency(featuredGame.prize)}
                  </span>
                </div>
                <div className="rounded-3xl p-4 text-center shadow-sm relative overflow-hidden group bg-blue-50 border border-blue-100 text-blue-700">
                  <div className="absolute inset-0 bg-blue-100 opacity-0 group-hover:opacity-20 transition-opacity"></div>
                  <span className="block text-[10px] font-black uppercase mb-1 tracking-widest relative z-10 text-blue-600">Costo Cartón</span>
                  <span className="block text-xl sm:text-2xl font-black flex items-center justify-center gap-1 relative z-10 text-blue-700">
                    {checkIsFree(featuredGame) ? (
                      <span className="text-emerald-400 font-extrabold text-lg sm:text-xl">¡GRATIS! 🎁</span>
                    ) : (
                      <><Ticket size={20} className="text-blue-500" /> {formatCurrency(featuredGame.card_value)}</>
                    )}
                  </span>
                </div>
              </div>

              {/* Tarjeta Fusionada: Fecha de Sorteo y Contador Regresivo */}
              <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 rounded-3xl p-5 text-white shadow-2xl mb-6 border border-slate-700/60 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
                <div className="flex flex-col items-center text-center space-y-3 relative z-10">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/90 border border-slate-700 text-[11px] sm:text-xs font-black text-yellow-300 uppercase tracking-wider shadow-inner">
                    <Calendar size={14} className="text-yellow-400 shrink-0" />
                    <span>
                      {new Date(featuredGame.start_time).toLocaleDateString('es-ES', { 
                        weekday: 'long', 
                        day: 'numeric', 
                        month: 'long', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </div>

                  {timeLeft && (
                    <div className="w-full pt-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">EL SORTEO INICIA EN:</p>
                      <div className="flex justify-center items-center gap-3 sm:gap-5">
                        <div className="flex flex-col items-center">
                          <span className="text-2xl sm:text-3xl font-black text-white leading-none mb-1">{timeLeft.days}</span>
                          <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Días</span>
                        </div>
                        <div className="text-slate-700 font-black text-xl sm:text-2xl">:</div>
                        <div className="flex flex-col items-center">
                          <span className="text-2xl sm:text-3xl font-black text-white leading-none mb-1">{String(timeLeft?.hours ?? 0).padStart(2, '0')}</span>
                          <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Horas</span>
                        </div>
                        <div className="text-slate-700 font-black text-xl sm:text-2xl">:</div>
                        <div className="flex flex-col items-center">
                          <span className="text-2xl sm:text-3xl font-black text-white leading-none mb-1">{String(timeLeft?.minutes ?? 0).padStart(2, '0')}</span>
                          <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Min</span>
                        </div>
                        <div className="text-slate-700 font-black text-xl sm:text-2xl">:</div>
                        <div className="flex flex-col items-center">
                          <span className="text-2xl sm:text-3xl font-black text-yellow-400 leading-none mb-1">{String(timeLeft?.seconds ?? 0).padStart(2, '0')}</span>
                          <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Seg</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Botones: Jugar (lleva a login inferior) y Registrarse (lleva a registro de sala) */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-1">
                <button 
                  onClick={scrollToLogin}
                  className="py-4 px-3 sm:px-4 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black text-base sm:text-lg rounded-2xl sm:rounded-3xl shadow-xl shadow-emerald-500/25 transform transition active:scale-[0.98] flex items-center justify-center gap-2 border-b-4 border-emerald-700 uppercase tracking-wide cursor-pointer"
                  title="Ingresa con tu teléfono y clave para jugar"
                >
                  <LogIn size={20} className="shrink-0" /> Jugar
                </button>
                <button 
                  onClick={() => navigate(`${tenantPrefix ? `${tenantPrefix}/register` : '/register'}?gameId=${featuredGame.id}${checkIsFree(featuredGame) ? '&free=true' : ''}`)}
                  className="py-4 px-3 sm:px-4 bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 text-yellow-950 font-black text-base sm:text-lg rounded-2xl sm:rounded-3xl shadow-xl shadow-yellow-500/25 transform transition active:scale-[0.98] flex items-center justify-center gap-2 border-b-4 border-yellow-600 uppercase tracking-wide cursor-pointer"
                  title="Crear cuenta para participar en esta sala"
                >
                  <Ticket size={20} className="shrink-0" /> Registrarse
                </button>
              </div>
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
                  <span className="block text-2xl font-black leading-none mb-1 text-white tracking-tight">
                    {hasPaidGames ? "¡VINCÚLATE YA!" : "¡REGÍSTRATE EN LA SALA!"}
                  </span>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    {hasPaidGames ? "Adquiere tus cartones al instante" : "Crea tu cuenta oficial para participar"}
                  </p>
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
          <div className="absolute -inset-1 rounded-[3rem] blur-xl opacity-0 group-hover:opacity-100 transition duration-700 bg-gradient-to-r from-emerald-500/10 via-blue-500/10 to-purple-500/10"></div>
          
          <div className="relative border border-white/10 rounded-[2.75rem] p-6 sm:p-10 shadow-2xl overflow-hidden min-h-[420px] flex flex-col justify-center">
            {/* Background Image with Overlay */}
            {settings?.login_bg_image_url !== 'none' && (
              <div 
                className="absolute inset-0 z-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105" 
                style={{ 
                  backgroundImage: `url('${(settings?.login_bg_image_url && settings.login_bg_image_url !== 'default') ? settings.login_bg_image_url : defaultLoginBg}')` 
                }}
              />
            )}
            <div 
              className="absolute inset-0 z-0 bg-slate-950 backdrop-blur-[0.5px]" 
              style={{ opacity: settings?.login_bg_image_url === 'none' ? 0.35 : Math.max(0.2, 1 - (settings?.login_bg_opacity ?? 0.6)) }}
            />

            <div className="text-left mb-6 relative z-10 px-1 w-full">
              <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow-lg leading-tight mb-2">
                Ingresa tus datos de Registro si ya te haz registrado
              </h3>
              <p className="text-white/90 font-bold text-xs sm:text-sm drop-shadow-md leading-relaxed">
                Ingresa telefono y contraseña.
              </p>
            </div>
          
          <form onSubmit={handleLogin} className="space-y-4 relative z-10 flex flex-col items-center w-full">
            {/* Campo 1: WhatsApp */}
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
                className="w-full p-4 pl-16 bg-black/60 backdrop-blur-md border-2 border-white/50 focus:border-emerald-500 focus:bg-black/80 rounded-2xl outline-none transition-all font-bold text-base sm:text-lg text-white placeholder:text-white/60 placeholder:text-sm sm:placeholder:text-base placeholder:font-medium placeholder:normal-case placeholder:tracking-normal shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </div>

            {/* Campo 2: Contraseña */}
            <div className="relative group/input w-full">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none z-20">
                <div className="p-2 bg-emerald-500/30 backdrop-blur-sm rounded-xl border border-white/20 shadow-lg">
                  <Key className="text-white" size={18} />
                </div>
              </div>
              <input 
                required
                type={showPassword ? "text" : "password"}
                placeholder="Ingresa tu contraseña de usuario"
                className="w-full p-4 pl-16 pr-12 bg-black/60 backdrop-blur-md border-2 border-white/50 focus:border-emerald-500 focus:bg-black/80 rounded-2xl outline-none transition-all font-bold text-base sm:text-lg text-white placeholder:text-white/60 placeholder:text-sm sm:placeholder:text-base placeholder:font-medium placeholder:normal-case placeholder:tracking-normal shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-3 flex items-center text-white/60 hover:text-white transition z-20"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {/* Opción Recuperar Contraseña */}
            <div className="w-full flex justify-end -mt-1 mb-1">
              <button
                type="button"
                onClick={() => {
                  setResetPhone(phone);
                  setShowPasswordResetModal(true);
                }}
                className="text-xs text-yellow-300 hover:text-yellow-200 font-bold underline underline-offset-4 transition cursor-pointer"
              >
                ¿Olvidaste tu contraseña? Recuperar aquí
              </button>
            </div>

            {/* Campo 3: Código de Seguridad de la Sala */}
            <div className="relative group/input w-full">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none z-20">
                <div className="p-2 bg-yellow-500/30 backdrop-blur-sm rounded-xl border border-yellow-400/30 shadow-lg">
                  <Lock className="text-yellow-400" size={18} />
                </div>
              </div>
              <input 
                required
                type="text"
                maxLength={10}
                placeholder={tenantSlug ? "Código de seguridad de la sala (PIN)" : "Código de seguridad de la sala (Ej: 1234)"}
                className="w-full p-4 pl-16 bg-black/60 backdrop-blur-md border-2 border-yellow-400/60 focus:border-yellow-400 focus:bg-black/80 rounded-2xl outline-none transition-all font-mono font-black text-base sm:text-lg text-yellow-300 placeholder:text-yellow-200/50 placeholder:font-sans placeholder:text-xs sm:placeholder:text-sm placeholder:font-semibold uppercase tracking-widest shadow-[0_0_15px_rgba(234,179,8,0.1)]"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
              />
            </div>

            {tenantSlug && (
              <div className="flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full border border-white/20 text-xs text-white/90 font-bold">
                <ShieldCheck size={14} className="text-emerald-400" />
                <span>Sala activa: <span className="text-yellow-300 uppercase">{tenant?.name || tenantSlug}</span></span>
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full max-w-[280px] mt-2 py-3.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-500 text-white font-black text-sm rounded-xl shadow-[0_10px_40px_-10px_rgba(16,185,129,0.5)] transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 border-b-4 border-emerald-700 uppercase tracking-wider whitespace-nowrap"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <LogIn size={18} /> INGRESAR AHORA
                </>
              )}
            </button>
            <p className="text-center text-[11px] text-white/50 font-bold uppercase tracking-widest mt-4 w-full">
              SALA 100% PRIVADA &bull; PLATAFORMA SEGURA
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
        {hasPaidGames ? (
          <Link 
            to={tenantPrefix ? `${tenantPrefix}/register` : "/register"} 
            className="flex-1 py-3.5 bg-yellow-400 text-yellow-950 font-black text-center rounded-xl shadow-sm active:scale-95 transition flex items-center justify-center gap-2"
          >
            <Ticket size={18} /> COMPRAR
          </Link>
        ) : (
          <button 
            disabled
            className="flex-1 py-3.5 bg-slate-200 text-slate-400 font-black text-center rounded-xl cursor-not-allowed opacity-60 flex items-center justify-center gap-2 border border-slate-300"
            title="No hay juegos de pago programados en este momento"
          >
            <Ticket size={18} /> COMPRAR
          </button>
        )}
        <button 
          onClick={scrollToLogin}
          className="flex-1 py-3.5 bg-emerald-500 text-white font-black text-center rounded-xl shadow-[0_4px_10px_rgba(16,185,129,0.2)] active:scale-95 transition flex items-center justify-center gap-2"
        >
          <LogIn size={18} /> INGRESAR
        </button>
      </div>
      {/* Botones Flotantes en la Página Principal: Compartir en Redes y WhatsApp */}
      <div className="fixed left-4 sm:left-6 bottom-24 md:bottom-8 z-40 flex flex-col items-start gap-2.5 sm:gap-3 pointer-events-none">
        {/* 1. Botón Flotante para Compartir en Redes Sociales */}
        <motion.button
          initial={{ opacity: 0, y: 30, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', damping: 15, stiffness: 100, delay: 0.6 }}
          onClick={handleOpenSocialShareModal}
          className="pointer-events-auto flex items-center gap-2.5 py-2.5 px-3.5 sm:py-3 sm:px-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-full font-black text-xs sm:text-sm uppercase tracking-wider shadow-2xl border-2 border-white/60 hover:scale-105 active:scale-95 transition-all cursor-pointer group"
          title="Compartir en Redes Sociales e Invitar Amigos 📢"
        >
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white text-blue-600 flex items-center justify-center shrink-0 shadow-md group-hover:rotate-12 transition-transform">
            <Share2 size={16} className="sm:w-[18px] sm:h-[18px] text-blue-600" />
          </div>
          <span className="hidden sm:inline">📢 Compartir en Redes</span>
          <span className="sm:hidden font-extrabold text-[11px]">📢 Compartir</span>
        </motion.button>

        {/* 2. Floating WhatsApp / Redes Sociales Button */}
        {settings?.whatsapp_group_link && (
          <motion.button
            initial={{ opacity: 0, y: 30, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', damping: 15, stiffness: 100, delay: 1 }}
            onClick={() => setShowWhatsappModal(true)}
            className="pointer-events-auto group flex items-center gap-2.5 bg-[#25D366] hover:bg-[#20ba5a] text-white p-2.5 px-3.5 md:p-3.5 md:px-5 rounded-full shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 border-2 border-white/30 cursor-pointer"
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
      </div>
        </div>

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

      {/* Modal de Solicitud Técnica de Cambio de Contraseña */}
      <AnimatePresence>
        {showPasswordResetModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPasswordResetModal(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border-2 border-amber-300 overflow-hidden text-left z-10"
            >
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
                    <Key size={20} />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-800 text-base sm:text-lg leading-tight">Solicitud Técnica</h4>
                    <p className="text-[11px] text-slate-500 font-bold">Recuperación de Contraseña</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPasswordResetModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-full transition"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300/80 rounded-2xl p-3.5 mb-4 space-y-1">
                <p className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                  ⚠️ Advertencia Importante
                </p>
                <p className="text-[11px] text-amber-950 font-semibold leading-relaxed">
                  Al enviar esta solicitud técnica, tu contraseña será restablecida temporalmente a: <b className="bg-amber-200 px-1.5 py-0.5 rounded text-amber-950 font-black">123456</b> por el administrador. Una vez que ingreses a tu panel de jugador, deberás personalizarla inmediatamente por una contraseña más segura.
                </p>
              </div>

              <form onSubmit={handlePasswordResetSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Número de Teléfono (WhatsApp) *
                  </label>
                  <input
                    required
                    type="tel"
                    value={resetPhone}
                    onChange={(e) => setResetPhone(e.target.value)}
                    placeholder="Ej: 3001234567 (10 dígitos)"
                    className="w-full p-3 bg-slate-50 border-2 border-slate-200 focus:border-amber-500 rounded-xl font-bold text-sm text-slate-800 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Nombre con el que te Registraste *
                  </label>
                  <input
                    required
                    type="text"
                    value={resetName}
                    onChange={(e) => setResetName(e.target.value)}
                    placeholder="Tu nombre completo de registro"
                    className="w-full p-3 bg-slate-50 border-2 border-slate-200 focus:border-amber-500 rounded-xl font-bold text-sm text-slate-800 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Correo Electrónico (Opcional)
                  </label>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="tucorreo@ejemplo.com"
                    className="w-full p-3 bg-slate-50 border-2 border-slate-200 focus:border-amber-500 rounded-xl font-medium text-sm text-slate-800 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Mensaje Adicional (Opcional)
                  </label>
                  <textarea
                    rows={2}
                    value={resetMessage}
                    onChange={(e) => setResetMessage(e.target.value)}
                    placeholder="Detalles adicionales sobre tu cuenta..."
                    className="w-full p-3 bg-slate-50 border-2 border-slate-200 focus:border-amber-500 rounded-xl font-medium text-sm text-slate-800 outline-none"
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="submit"
                    disabled={isSubmittingReset}
                    className="flex-1 py-3 px-4 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black text-xs sm:text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-md cursor-pointer"
                  >
                    {isSubmittingReset ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}
                    <span>{isSubmittingReset ? 'Enviando...' : 'Enviar Solicitud Técnica'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPasswordResetModal(false)}
                    className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>





      {/* Modal para Compartir en Redes Sociales con Enlace Inteligente e Imagen Promocional */}
      <AnimatePresence>
        {showSocialShareModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSocialShareModal(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl p-5 sm:p-7 shadow-2xl border-2 border-blue-300 overflow-hidden text-left z-10 max-h-[calc(100vh-2rem)] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl shadow-sm">
                    <Share2 size={22} className="text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-800 text-base sm:text-lg leading-tight">Compartir en Redes</h4>
                    <p className="text-[11px] text-blue-600 font-extrabold uppercase tracking-wider">
                      {tenant?.name || 'Bingo Lite Oficial'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSocialShareModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-full transition cursor-pointer"
                  title="Cerrar"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Vista previa de Imagen Promocional Personalizada */}
                {(socialInviteData?.imageUrl || settings?.social_share_image_url || tenant?.banner_url) && (
                  <div className="relative rounded-2xl overflow-hidden border-2 border-blue-200/80 shadow-md max-h-40 bg-slate-950 group">
                    <img 
                      src={socialInviteData?.imageUrl || settings?.social_share_image_url || tenant?.banner_url || defaultLoginBg} 
                      alt="Promoción de la Sala"
                      className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent flex flex-col justify-end p-3">
                      <span className="text-[10px] font-black uppercase tracking-wider text-yellow-300 bg-black/60 backdrop-blur-md px-2.5 py-0.5 rounded-full w-fit border border-yellow-400/40">
                        🎁 1 Cartón Gratis de Regalo
                      </span>
                      <p className="text-white font-black text-xs sm:text-sm drop-shadow mt-1">
                        {socialInviteData?.bingoName || tenant?.name || 'Gran Sorteo en Vivo'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Mensaje Promocional Personalizado */}
                <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Sparkles size={12} className="text-amber-500" /> Mensaje de Invitación Oficial
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const msg = socialInviteData?.message || '';
                        if (msg) {
                          navigator.clipboard.writeText(msg);
                          toast.success('¡Mensaje copiado al portapapeles!');
                        }
                      }}
                      className="text-[11px] font-black text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer transition"
                    >
                      <Copy size={12} /> Copiar Texto
                    </button>
                  </div>
                  <p className="text-xs text-slate-700 font-medium whitespace-pre-line max-h-24 overflow-y-auto pr-1 leading-relaxed border-t border-slate-200/50 pt-1.5">
                    {socialInviteData?.message || 'Cargando invitación personalizada de la sala...'}
                  </p>
                </div>

                {/* Enlace Inteligente */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center justify-between">
                    <span>Enlace Inteligente</span>
                    <span className="text-[10px] text-emerald-600 font-extrabold uppercase">Listo para publicar</span>
                  </label>
                  <div className="flex items-center gap-2 p-2 bg-blue-50/70 rounded-xl border border-blue-200">
                    <input
                      type="text"
                      readOnly
                      value={socialInviteData?.smartUrl || socialInviteData?.registerUrl || window.location.href}
                      className="flex-1 bg-transparent text-xs font-mono font-bold text-blue-950 outline-none select-all truncate px-1"
                    />
                    <button
                      type="button"
                      onClick={handleSocialShareCopy}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-lg text-xs font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer shrink-0"
                    >
                      <Copy size={13} />
                      <span>Copiar</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium leading-tight">
                    🌐 Al compartir este enlace en redes sociales, Facebook y WhatsApp mostrarán la imagen y descripción personalizada de la sala.
                  </p>
                </div>

                {/* Botones de Acción para Publicar y Enviar */}
                <div className="flex flex-col gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleSocialShareWhatsApp}
                    className="flex items-center justify-center gap-2.5 py-3.5 px-4 bg-[#25D366] hover:bg-[#128C7E] text-white font-black text-sm rounded-xl transition shadow-md active:scale-95 cursor-pointer"
                  >
                    <MessageCircle size={20} />
                    <span>Enviar Invitación por WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSocialShareFacebook}
                    className="flex items-center justify-center gap-2.5 py-3.5 px-4 bg-[#1877F2] hover:bg-[#166fe5] text-white font-black text-sm rounded-xl transition shadow-md active:scale-95 cursor-pointer"
                  >
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                    <span>Publicar en Perfil de Facebook</span>
                  </button>

                  {typeof navigator !== 'undefined' && !!navigator.share && (
                    <button
                      type="button"
                      onClick={handleSocialShareNative}
                      className="flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer border border-slate-200 active:scale-95"
                    >
                      <Share2 size={15} />
                      <span>Compartir en Otras Redes (Instagram, Telegram, etc.)</span>
                    </button>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-bold">¿Quieres ingresar a tu cuenta?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSocialShareModal(false);
                      scrollToLogin();
                    }}
                    className="text-xs font-black text-blue-600 hover:text-blue-800 transition uppercase tracking-wider cursor-pointer"
                  >
                    Ir al Inicio de Sesión →
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <FloatingChatAgent />
    </>
  );
}

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Trophy, Ticket, LogIn, Calendar, Clock, Key, Eye, EyeOff, 
  ShoppingCart, ArrowRight, MessageCircle, Sparkles, Shield, 
  ExternalLink, Check, Smartphone, Lock
} from 'lucide-react';
import { formatCurrency } from '../utils/format';
import WhatsAppLogo from './WhatsAppLogo';

interface NeonGlowRoomTemplateProps {
  tenant: any;
  tenantSlug?: string;
  tenantPrefix?: string;
  featuredGame: any;
  freeGames: any[];
  timeLeft: { days: number; hours: number; minutes: number; seconds: number } | null;
  settings: any;
  user: any;
  loginPlayer: (phone: string, token: string, user: any) => void;
  phone: string;
  setPhone: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  showPassword: boolean;
  setShowPassword: (val: boolean) => void;
  loading: boolean;
  handleLogin: (e: React.FormEvent) => void;
  phoneInputRef: React.RefObject<HTMLInputElement | null>;
  scrollToLogin: () => void;
  setShowWhatsappModal: (val: boolean) => void;
  setShowPasswordResetModal: (val: boolean) => void;
  checkIsFree: (game: any) => boolean;
  onSwitchTheme: () => void;
}

export default function NeonGlowRoomTemplate({
  tenant,
  tenantSlug,
  tenantPrefix,
  featuredGame,
  freeGames,
  timeLeft,
  settings,
  user,
  phone,
  setPhone,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  loading,
  handleLogin,
  phoneInputRef,
  scrollToLogin,
  setShowWhatsappModal,
  setShowPasswordResetModal,
  checkIsFree,
  onSwitchTheme
}: NeonGlowRoomTemplateProps) {
  const navigate = useNavigate();
  const roomName = tenant?.name || 'SALA BINGO LITE OFICIAL';
  const whatsappUrl = settings?.whatsapp_group_url || settings?.whatsapp_support_url || 'https://chat.whatsapp.com';

  const isFree = featuredGame ? checkIsFree(featuredGame) : false;

  return (
    <div className="min-h-screen bg-[#07091f] text-white font-sans relative overflow-x-hidden selection:bg-cyan-500 selection:text-black pb-24">
      {/* Fondo de rayos y nebulosa espacial neón */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-blue-600/20 blur-[130px]" />
        <div className="absolute top-[20%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-purple-600/20 blur-[140px]" />
        <div className="absolute bottom-[-10%] left-[20%] w-[55vw] h-[55vw] rounded-full bg-cyan-600/15 blur-[150px]" />
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-25" />
      </div>

      <div className="relative z-10 max-w-md mx-auto px-4 pt-4 sm:pt-6">
        
        {/* Barra superior discreta: Selector de Plantilla y Admin Acceso */}
        <div className="flex items-center justify-between gap-2 mb-4 bg-slate-900/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-800 text-[11px]">
          <span className="flex items-center gap-1.5 text-cyan-400 font-bold uppercase tracking-wider">
            <Sparkles size={13} className="text-cyan-400 animate-spin" />
            Tema: <span className="text-white font-black">Neón Glow VIP</span>
          </span>
          <div className="flex items-center gap-1.5">
            <Link
              to={tenantSlug ? `/sala/${tenantSlug}/admin/login` : "/admin/login"}
              className="px-2.5 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 border border-amber-400/30 rounded-full font-black text-[10px] uppercase tracking-wider flex items-center gap-1 transition"
              title="Acceso al panel administrativo de la sala"
            >
              <Shield size={11} className="text-amber-400" />
              <span>Admin Acceso</span>
            </Link>
            <button
              onClick={onSwitchTheme}
              className="px-2.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-full font-bold transition flex items-center gap-1 text-[10px]"
              title="Cambiar a la plantilla clásica original"
            >
              🎨 Cambiar a Clásica
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* HEADER DE LA SALA CON BALOTAS 3D Y CORONA */}
        {/* ============================================================== */}
        <header className="relative text-center pt-2 pb-5">
          {/* Balota flotante B-7 (Izquierda) */}
          <div className="absolute -top-1 -left-2 sm:left-1 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-blue-400 via-blue-600 to-indigo-900 shadow-[0_10px_25px_rgba(37,99,235,0.6)] flex flex-col items-center justify-center border-2 border-cyan-300/60 transform -rotate-12 animate-pulse">
            <span className="text-[10px] font-black tracking-tighter text-blue-200 uppercase leading-none">B</span>
            <span className="text-xl sm:text-2xl font-black text-white leading-none drop-shadow">7</span>
            <div className="absolute top-1 left-2 w-3 h-3 rounded-full bg-white/70 blur-[1px]" />
          </div>

          {/* Balota flotante G-52 (Derecha) */}
          <div className="absolute -top-1 -right-2 sm:right-1 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-fuchsia-400 via-purple-600 to-purple-950 shadow-[0_10px_25px_rgba(168,85,247,0.6)] flex flex-col items-center justify-center border-2 border-fuchsia-300/60 transform rotate-12 animate-pulse">
            <span className="text-[10px] font-black tracking-tighter text-fuchsia-200 uppercase leading-none">G</span>
            <span className="text-xl sm:text-2xl font-black text-white leading-none drop-shadow">52</span>
            <div className="absolute top-1 left-2 w-3 h-3 rounded-full bg-white/70 blur-[1px]" />
          </div>

          {/* Corona Dorada 👑 */}
          <div className="flex justify-center mb-1">
            <span className="text-2xl sm:text-3xl filter drop-shadow-[0_0_12px_rgba(250,204,21,0.8)]">👑</span>
          </div>

          {/* Letrero Principal con Borde Neón Eléctrico */}
          <div className="inline-block relative px-5 sm:px-7 py-2.5 rounded-2xl bg-gradient-to-r from-blue-950/80 via-slate-900/90 to-purple-950/80 border-2 border-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.6)] backdrop-blur-md">
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-b from-white via-cyan-100 to-cyan-300 drop-shadow-[0_2px_8px_rgba(6,182,212,0.9)]">
              {roomName}
            </h1>
          </div>

          <p className="text-xs sm:text-sm text-slate-300/90 font-semibold mt-3 px-4 leading-relaxed max-w-sm mx-auto">
            {tenant?.description || 'Sala oficial de Bingo en Vivo con sorteos continuos y premios garantizados.'}
          </p>

          {/* Botón Píldora Dorado: LEER PRIMERO / AQUÍ ESTOY */}
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => setShowWhatsappModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-500 border-2 border-yellow-300 text-slate-950 shadow-[0_0_20px_rgba(234,179,8,0.7)] font-black text-xs uppercase tracking-wider hover:scale-105 active:scale-95 transition transform"
            >
              <span>📢 LEER PRIMERO</span>
              <span className="bg-red-600 text-white text-[10px] px-2.5 py-0.5 rounded-full font-black animate-pulse shadow">
                ¡AQUÍ ESTOY!
              </span>
            </button>
          </div>
        </header>

        {/* ============================================================== */}
        {/* TARJETA DEL JUEGO ACTIVO CON MARCO NEÓN LUMINOSO */}
        {/* ============================================================== */}
        {featuredGame ? (
          <div className="relative mt-2 mb-6">
            <div className="relative rounded-[2rem] p-5 sm:p-6 bg-gradient-to-b from-[#0a0e2d]/95 via-[#0d123b]/95 to-[#080b22]/95 border-2 border-cyan-400 shadow-[0_0_35px_rgba(6,182,212,0.45)] backdrop-blur-xl overflow-hidden">
              
              {/* Balotas esquineras decorativas */}
              <div className="absolute top-2 left-2 w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-800 border border-cyan-300 flex items-center justify-center font-black text-xs shadow-md opacity-85">
                B7
              </div>
              <div className="absolute top-2 right-2 w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-purple-800 border border-fuchsia-300 flex items-center justify-center font-black text-xs shadow-md opacity-85">
                O72
              </div>
              <div className="absolute bottom-24 left-2 w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-800 border border-emerald-300 flex items-center justify-center font-black text-xs shadow-md opacity-85">
                N34
              </div>
              <div className="absolute bottom-24 right-2 w-10 h-10 rounded-full bg-gradient-to-br from-rose-400 to-rose-800 border border-rose-300 flex items-center justify-center font-black text-xs shadow-md opacity-85">
                G52
              </div>

              {/* Badge Superior: ¡JUEGO PROGRAMADO! */}
              <div className="flex justify-center mb-2.5">
                <div className="inline-flex items-center gap-1.5 px-4 py-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-black text-[11px] uppercase tracking-wider shadow-[0_0_15px_rgba(251,191,36,0.5)] border border-yellow-200">
                  <span>📢</span>
                  <span>{isFree ? '¡JUEGO GRATUITO PROGRAMADO!' : '¡GRAN BINGO EN VIVO!'}</span>
                </div>
              </div>

              {/* Badge Ovalado Rojo: INSCRIPCIÓN ABIERTA */}
              <div className="flex justify-center mb-2">
                <span className="px-3.5 py-0.5 rounded-full bg-red-600/90 text-white border border-red-400 text-[10px] font-black uppercase tracking-widest shadow-[0_0_12px_rgba(239,68,68,0.7)] animate-pulse">
                  {featuredGame.status === 'playing' ? '🔴 EN VIVO AHORA' : 'INSCRIPCIÓN ABIERTA'}
                </span>
              </div>

              {/* Corona sobre el título */}
              <div className="flex justify-center -mb-1">
                <span className="text-xl filter drop-shadow">👑</span>
              </div>

              {/* Nombre de la partida en letrero Neón Azul/Cian */}
              <div className="text-center mb-4">
                <div className="inline-block px-5 py-2 rounded-2xl bg-cyan-950/60 border border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.4)]">
                  <h2 className="text-lg sm:text-xl font-black uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-white to-blue-200 drop-shadow">
                    {featuredGame.name || 'BINGO FULL GANADOR'}
                  </h2>
                </div>
              </div>

              {/* Contador Regresivo si está programado */}
              {timeLeft && (
                <div className="mb-4 bg-slate-950/70 border border-cyan-500/30 rounded-2xl p-3 text-center">
                  <p className="text-[10px] font-black text-cyan-300 uppercase tracking-[0.2em] mb-1.5">
                    EL SORTEO INICIA EN:
                  </p>
                  <div className="flex justify-center items-center gap-3">
                    <div className="text-center">
                      <span className="block text-xl font-black text-white">{timeLeft.days}</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Días</span>
                    </div>
                    <span className="text-cyan-400 font-bold">:</span>
                    <div className="text-center">
                      <span className="block text-xl font-black text-white">{String(timeLeft.hours).padStart(2, '0')}</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Horas</span>
                    </div>
                    <span className="text-cyan-400 font-bold">:</span>
                    <div className="text-center">
                      <span className="block text-xl font-black text-white">{String(timeLeft.minutes).padStart(2, '0')}</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Min</span>
                    </div>
                    <span className="text-cyan-400 font-bold">:</span>
                    <div className="text-center">
                      <span className="block text-xl font-black text-amber-400">{String(timeLeft.seconds).padStart(2, '0')}</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Seg</span>
                    </div>
                  </div>
                </div>
              )}

              {/* GRID DE MÉTRICAS NEÓN */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                {/* Caja Izquierda: PREMIO MAYOR + WHATSAPP */}
                <div className="bg-[#0b102b] border border-cyan-500/40 rounded-2xl p-3 flex flex-col justify-between shadow-inner">
                  <div>
                    <div className="flex items-center gap-1 text-[11px] font-black text-slate-300 uppercase tracking-wider mb-1">
                      <Trophy size={14} className="text-yellow-400" />
                      <span>PREMIO MAYOR</span>
                    </div>
                    <p className="text-lg sm:text-xl font-black text-yellow-300 drop-shadow-[0_0_8px_rgba(253,224,71,0.5)]">
                      {formatCurrency(featuredGame.prize_pool || featuredGame.jackpot || 300000)}
                    </p>
                  </div>

                  {/* Sub-botón de WhatsApp */}
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2.5 flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/60 hover:bg-emerald-900 text-emerald-300 text-[10px] font-black uppercase tracking-wider transition group"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <WhatsAppLogo className="w-3.5 h-3.5 fill-emerald-400 shrink-0" />
                      <span className="truncate">COMUNIDAD VIP</span>
                    </div>
                    <span className="text-emerald-400 group-hover:translate-x-0.5 transition">›</span>
                  </a>
                </div>

                {/* Caja Derecha: COSTO CARTÓN */}
                <div className="bg-[#0b102b] border border-purple-500/40 rounded-2xl p-3 flex flex-col justify-between shadow-inner text-center">
                  <div className="flex items-center justify-center gap-1 text-[11px] font-black text-slate-300 uppercase tracking-wider mb-1">
                    <Ticket size={14} className="text-cyan-400" />
                    <span>COSTO CARTÓN</span>
                  </div>
                  <div className="my-auto py-1">
                    {isFree ? (
                      <span className="text-lg sm:text-xl font-black text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.7)] flex items-center justify-center gap-1">
                        ¡GRATIS! 🎁
                      </span>
                    ) : (
                      <span className="text-lg sm:text-xl font-black text-cyan-300 drop-shadow-[0_0_10px_rgba(6,182,212,0.6)]">
                        {formatCurrency(featuredGame.card_value || 5000)}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {isFree ? '2 Cartones de Regalo' : 'Disponible para compra'}
                  </span>
                </div>
              </div>

              {/* ============================================================ */}
              {/* BOTONES GEMELOS DE ACCIÓN NEÓN (COMPRAR / INGRESAR) */}
              {/* ============================================================ */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                {/* Botón Izquierdo: COMPRAR */}
                <button
                  type="button"
                  onClick={() => {
                    const regUrl = `${tenantPrefix ? `${tenantPrefix}/register` : '/register'}?gameId=${featuredGame.id}${isFree ? '&free=true' : ''}`;
                    navigate(regUrl);
                  }}
                  className="py-3.5 px-3 rounded-2xl bg-gradient-to-r from-amber-600/30 via-yellow-600/20 to-amber-700/30 border-2 border-yellow-400 text-yellow-300 font-black text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(250,204,21,0.4)] hover:shadow-[0_0_30px_rgba(250,204,21,0.7)] hover:border-yellow-300 hover:text-white flex items-center justify-center gap-2 transition transform active:scale-95 cursor-pointer"
                >
                  <ShoppingCart size={18} className="text-yellow-400" />
                  <span>COMPRAR</span>
                </button>

                {/* Botón Derecho: INGRESAR / JUGAR */}
                <button
                  type="button"
                  onClick={scrollToLogin}
                  className="py-3.5 px-3 rounded-2xl bg-gradient-to-r from-emerald-600/30 via-teal-600/20 to-emerald-700/30 border-2 border-emerald-400 text-emerald-300 font-black text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(52,211,153,0.4)] hover:shadow-[0_0_30px_rgba(52,211,153,0.7)] hover:border-emerald-300 hover:text-white flex items-center justify-center gap-2 transition transform active:scale-95 cursor-pointer"
                >
                  <ArrowRight size={18} className="text-emerald-400" />
                  <span>INGRESAR</span>
                </button>
              </div>

            </div>
          </div>
        ) : (
          <div className="my-6 p-8 rounded-3xl bg-slate-900/80 border-2 border-cyan-500/40 text-center">
            <Clock size={36} className="mx-auto mb-2 text-cyan-400 animate-spin" />
            <h3 className="text-lg font-black text-white uppercase tracking-wider">Próximo Bingo en Preparación</h3>
            <p className="text-xs text-slate-400 mt-1">Registra tu número para asegurar tus cartones tan pronto inicie la convocatoria.</p>
          </div>
        )}

        {/* ============================================================== */}
        {/* FORMULARIO DE INGRESO CON ESTILO NEÓN DARK */}
        {/* ============================================================== */}
        <div id="login-form-section" className="mt-8 relative">
          <div className="rounded-3xl p-6 sm:p-7 bg-[#0b0f2d]/95 border-2 border-purple-500/50 shadow-[0_0_30px_rgba(168,85,247,0.3)] backdrop-blur-xl">
            
            <div className="mb-5 text-center">
              <h3 className="font-black text-base sm:text-lg text-white leading-tight">
                Ingresa tus datos de Registro si ya te haz registrado, Ingresa telefono y contraseña.
              </h3>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-300 uppercase tracking-wider mb-1.5">
                  Número de Teléfono (WhatsApp)
                </label>
                <div className="relative">
                  <input
                    ref={phoneInputRef}
                    required
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ej: 3001234567"
                    className="w-full bg-slate-950 border-2 border-slate-700 focus:border-cyan-400 rounded-xl py-3 pl-10 pr-4 text-white font-bold text-sm outline-none transition shadow-inner placeholder:text-slate-600"
                  />
                  <Smartphone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-300 uppercase tracking-wider mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Tu contraseña secreta"
                    className="w-full bg-slate-950 border-2 border-slate-700 focus:border-cyan-400 rounded-xl py-3 pl-10 pr-10 text-white font-bold text-sm outline-none transition shadow-inner placeholder:text-slate-600"
                  />
                  <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Enlace para Recuperar Contraseña */}
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setShowPasswordResetModal(true)}
                  className="text-xs font-bold text-cyan-400 hover:text-cyan-300 transition underline underline-offset-4"
                >
                  ¿Olvidaste tu contraseña? Recuperar aquí
                </button>
              </div>

              {/* Botón de Ingreso Neón */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black text-sm uppercase tracking-widest shadow-[0_0_20px_rgba(6,182,212,0.5)] border border-cyan-300/60 transition transform active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span>Verificando...</span>
                ) : (
                  <>
                    <LogIn size={18} />
                    <span>ENTRAR A MI SALA</span>
                  </>
                )}
              </button>
            </form>

            {/* Enlace a Registro si aún no está inscrito */}
            <div className="mt-5 text-center pt-4 border-t border-slate-800">
              <p className="text-xs text-slate-400 font-bold mb-2">¿Aún no tienes cuenta en esta sala?</p>
              <button
                type="button"
                onClick={() => {
                  const regUrl = `${tenantPrefix ? `${tenantPrefix}/register` : '/register'}${featuredGame ? `?gameId=${featuredGame.id}` : ''}`;
                  navigate(regUrl);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-black text-amber-400 hover:text-yellow-300 uppercase tracking-wider"
              >
                <span>Crear Cuenta y Obtener Cartones</span>
                <ArrowRight size={14} />
              </button>
            </div>

          </div>
        </div>

        {/* Píldora inferior de dominio */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-slate-400 text-xs font-bold">
            <span>🌐</span>
            <span>{window.location.hostname}</span>
          </div>
        </div>

      </div>

      {/* Botón Flotante de Chat Neón Fucsia */}
      <button
        type="button"
        onClick={() => setShowWhatsappModal(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-tr from-fuchsia-600 via-purple-600 to-pink-500 text-white flex items-center justify-center shadow-[0_0_25px_rgba(217,70,239,0.8)] border-2 border-fuchsia-300 hover:scale-110 active:scale-95 transition transform animate-bounce"
        title="Atención al Jugador y Comunidad"
      >
        <MessageCircle size={26} />
      </button>

    </div>
  );
}

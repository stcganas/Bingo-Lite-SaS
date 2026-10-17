import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/api';
import { useLocation, Link, Navigate, useParams } from 'react-router-dom';
import { CheckCircle2, Ticket, MapPin, Phone, User, Home, ArrowRight, Gift, MessageCircle, BellRing, Copy, Check, ShieldCheck, Lock, Mail, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import PushSubscriptionBanner from '../components/PushSubscriptionBanner';
import { promptPushPermission } from '../lib/onesignal';
import { useTenant } from '../TenantContext';

export default function RegistrationSuccess() {
  const location = useLocation();
  const registrationData = location.state?.registrationData;
  const { tenant, tenantPrefix } = useTenant();
  const [whatsappGroupLink, setWhatsappGroupLink] = useState<string>('https://chat.whatsapp.com/CDgs5mXL8HWGJjbJn0VxHk');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const notificationSentRef = useRef(false);

  const copyToClipboard = (text: string, type: 'code' | 'link') => {
    navigator.clipboard.writeText(text);
    if (type === 'code') {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  useEffect(() => {
    // Load WhatsApp group link dynamically from current active game / global settings
    apiFetch('/api/game')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.whatsapp_group_link) {
          setWhatsappGroupLink(data.whatsapp_group_link);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (registrationData && !notificationSentRef.current) {
      notificationSentRef.current = true;
      
      const sendWelcomeNotification = async () => {
        try {
          await apiFetch('/api/notifications/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: 'single',
              phone: registrationData.phone,
              title: `¡Bienvenido a ${registrationData.roomName || 'Bingo Lite'}!`,
              message: `Hola ${registrationData.name}, tu registro ha sido exitoso. Código de sala: ${registrationData.roomAccessCode || 'LITE777'}. ¡Prepárate para ganar!`
            })
          });
        } catch (error) {
          console.error('Error sending welcome notification:', error);
        }
      };

      sendWelcomeNotification();

      // Trigger push permission prompt automatically after registration
      const promptTimer = setTimeout(() => {
        promptPushPermission().catch(() => {});
      }, 1500);

      return () => clearTimeout(promptTimer);
    }
  }, [registrationData]);

  if (!registrationData) {
    return <Navigate to={tenantPrefix || "/"} replace />;
  }

  const roomName = registrationData.roomName || tenant.name || 'Bingo Lite Oficial';
  const roomAccessCode = registrationData.roomAccessCode || tenant.access_code || 'LITE777';
  const roomDirectUrl = registrationData.roomDirectUrl || `${window.location.origin}${tenantPrefix || '/sala/bingo-lite'}`;

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-8 flex items-center justify-center">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden border-2 border-emerald-500"
      >
        <div className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 p-6 text-white text-center relative overflow-hidden">
          <div className="inline-block px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-wider mb-2 border border-white/20">
            🏢 {roomName}
          </div>
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.2 }}
            className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg"
          >
            <CheckCircle2 className="text-emerald-600" size={38} />
          </motion.div>
          <h1 className="text-2xl font-black tracking-tight uppercase">¡Registro Exitoso!</h1>
          <p className="text-emerald-100 font-bold text-xs mt-1">Tu cuenta y tus datos han sido creados correctamente.</p>
        </div>

        <div className="p-6 space-y-5">
          {/* Card Destacada: Envío Automático a WhatsApp */}
          <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-green-100 rounded-2xl p-4 border-2 border-emerald-400 shadow-sm space-y-3 text-center">
            <div className="flex items-center justify-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-md animate-bounce">
                <MessageCircle size={18} />
              </div>
              <span className="text-xs font-black uppercase text-emerald-950 tracking-wider">
                Resumen Enviado a tu WhatsApp
              </span>
            </div>
            <p className="text-[11px] text-emerald-900 font-bold leading-relaxed">
              Hemos preparado el mensaje en tu WhatsApp con tus credenciales y acceso a la sala. Si tu aplicación no se abrió automáticamente, presiona el botón:
            </p>
            {registrationData.whatsappSendUrl && (
              <a
                href={registrationData.whatsappSendUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 bg-[#25D366] hover:bg-[#1ebc59] text-white font-black text-sm uppercase tracking-wider rounded-xl shadow-lg transition transform active:scale-95 flex items-center justify-center gap-2"
              >
                <MessageCircle size={18} /> Abrir y Enviar a mi WhatsApp
              </a>
            )}
          </div>

          {/* Resumen de Cuenta Oficial */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-2">
              📋 Resumen de tu Cuenta
            </h2>
            
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-bold flex items-center gap-1.5">
                <User size={14} className="text-blue-600" /> Jugador:
              </span>
              <span className="font-black text-slate-800">{registrationData.name}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-bold flex items-center gap-1.5">
                <Phone size={14} className="text-emerald-600" /> WhatsApp:
              </span>
              <span className="font-black text-slate-800">{registrationData.phone}</span>
            </div>

            {registrationData.password && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-bold flex items-center gap-1.5">
                  <Lock size={14} className="text-amber-600" /> Contraseña:
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-black text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {showPassword ? registrationData.password : '••••••••'}
                  </span>
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-slate-400 hover:text-slate-600 transition"
                    title={showPassword ? "Ocultar" : "Mostrar"}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            )}

            {registrationData.email && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-bold flex items-center gap-1.5">
                  <Mail size={14} className="text-purple-600" /> Email:
                </span>
                <span className="font-bold text-slate-800">{registrationData.email}</span>
              </div>
            )}

            {/* Código Seguro de Ingreso a la Sala */}
            <div className="pt-2 border-t border-slate-200">
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-amber-800 uppercase tracking-wider flex items-center gap-1">
                    <ShieldCheck size={13} className="text-amber-600" /> Código Seguro de la Sala
                  </p>
                  <p className="text-base font-black text-amber-950 font-mono tracking-widest mt-0.5">
                    {roomAccessCode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(roomAccessCode, 'code')}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 active:scale-95 shadow-xs"
                >
                  {copiedCode ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedCode ? '¡Copiado!' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            {/* Enlace Directo a la Sala */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 flex items-center justify-between text-xs">
              <div className="truncate mr-2">
                <p className="text-[10px] font-black text-blue-700 uppercase tracking-wider">Enlace de la Sala</p>
                <p className="text-[11px] font-bold text-blue-900 truncate font-mono">{roomDirectUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(roomDirectUrl, 'link')}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 active:scale-95 shrink-0"
              >
                {copiedLink ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedLink ? 'Listo' : 'Copiar'}</span>
              </button>
            </div>
          </div>

          {/* Banner de Suscripción a Notificaciones Push OneSignal */}
          <PushSubscriptionBanner forceShow className="animate-in fade-in slide-in-from-top-3 duration-300" />

          {registrationData.payment_method === 'gift' ? (
            <div className="bg-gradient-to-br from-purple-100 via-indigo-50 to-pink-150 p-6 rounded-md border-2 border-purple-300 space-y-4 shadow-md text-left">
              <div className="text-center space-y-2">
                <p className="text-[10px] font-black text-purple-700 uppercase tracking-[0.2em] leading-none">👨‍👩‍👧‍👦 MENSAJE ESPECIAL DE BIENVENIDA 👨‍👩‍👧‍👦</p>
                <h3 className="text-sm font-black text-purple-950 uppercase tracking-tight leading-snug">
                  🏠 ¡Bienvenidos a Bingo Lite, Entretenimiento desde Casa! 🎉✨
                </h3>
              </div>
              
              <p className="text-xs text-slate-700 leading-relaxed font-bold text-center">
                ¡Qué inmensa alegría nos da recibirte en nuestra gran familia de <span className="text-purple-700 text-xs font-black">Bingo Lite</span>! 🤗 Aquí te vas a sentir como en casa, compartiendo con la familia y viviendo emociones inigualables. 🏠✨
              </p>

              {registrationData.active_lottery && registrationData.active_draw && (
                <div className="bg-amber-50 border-2 border-amber-300 p-4 rounded-xl flex items-start gap-3 text-left">
                  <span className="text-xl">🎰</span>
                  <div>
                    <p className="text-xs font-black text-amber-950 uppercase tracking-wide">
                      🍀 ¡SORTEO DE LOTERÍA ACTIVO!
                    </p>
                    <p className="text-[11px] text-amber-900 leading-relaxed font-bold mt-1">
                      Atención: Tu cartón participa con las últimas tres cifras de la lotería en juego para la noche.
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-amber-50 border border-amber-250 p-3.5 rounded-sm">
                <p className="text-[11px] text-amber-900 font-extrabold leading-normal">
                  🎁 <span className="uppercase text-amber-950">Tu Cartón Promocional:</span> Tu cartón de regalo promocional ya fue cargado exitosamente en tu cuenta para esta ronda. Ten en cuenta que <strong className="text-amber-950 underline">este obsequio se puede utilizar por una única vez (1 juego)</strong> 🎫. 
                </p>
                <p className="text-[11px] text-amber-900 font-extrabold leading-normal mt-2">
                  👍 A partir del próximo juego, deberás adquirir tus propios cartones para seguir participando, acumulando saldo real en tu billetera y ganando grandes premios al instante. ¡Te va a encantar jugar en familia!
                </p>
              </div>

              <div className="bg-purple-600 p-3 rounded-sm text-center text-xs font-black text-white uppercase tracking-wider shadow-sm">
                🎉 ¡Vive la emoción del juego y gana desde casa! 🏠🍀
              </div>
            </div>
          ) : (registrationData.payment_method === 'free' || registrationData.is_free) ? (
            <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-green-100 p-6 rounded-2xl border-2 border-emerald-300 space-y-4 shadow-md text-left">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md">
                  <Gift size={26} className="text-yellow-300" />
                </div>
                <p className="text-[10px] font-black text-emerald-700 uppercase tracking-[0.2em] leading-none">🎉 ¡REGISTRO 100% GRATUITO COMPLETADO! 🎉</p>
                <h3 className="text-base font-black text-emerald-950 uppercase tracking-tight leading-snug">
                  Tus cartones gratuitos están activos y listos para jugar
                </h3>
              </div>
              
              <p className="text-xs text-slate-700 leading-relaxed font-bold text-center">
                ¡Felicitaciones! No requieres enviar ningún comprobante ni esperar verificaciones. Tus cartones de cortesía ya están vinculados a tu cuenta para el sorteo.
              </p>

              <div className="bg-emerald-600 p-3.5 rounded-xl text-center text-xs font-black text-white uppercase tracking-wider shadow-sm">
                🍀 ¡Muchos éxitos en la partida! 🍀
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-md border border-blue-100 space-y-3">
                <p className="text-xs text-blue-800 font-bold text-center leading-relaxed">
                  Estamos verificando tu comprobante de pago. En unos minutos tus cartones aparecerán en tu panel personal.
                </p>
                <div className="bg-gradient-to-r from-orange-50 via-amber-50 to-emerald-50 p-3.5 rounded-xl border border-emerald-300 shadow-xs">
                  <p className="text-[11px] text-slate-800 font-bold text-center uppercase leading-tight">
                    ⚠️ <span className="text-orange-700 font-black">IMPORTANTE:</span> Cartones sin pagar o con evidencia insuficiente del pago <span className="text-emerald-700 font-black">NO RECIBIRÁN</span> el pago de su premio. Debe enviar una evidencia verdadera y verificable.
                  </p>
                </div>
              </div>

              {registrationData.active_lottery && registrationData.active_draw && (
                <div className="bg-amber-50 border-2 border-amber-300 p-4 rounded-xl flex items-start gap-3 text-left">
                  <span className="text-xl">🎰</span>
                  <div>
                    <p className="text-xs font-black text-amber-950 uppercase tracking-wide">
                      🍀 ¡SORTEO DE LOTERÍA ACTIVO!
                    </p>
                    <p className="text-[11px] text-amber-900 leading-relaxed font-bold mt-1">
                      Atención: Tu cartón participa con las últimas tres cifras de la lotería en juego para la noche.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tarjeta Oficial para Unirse al Grupo de WhatsApp Configurado */}
          {whatsappGroupLink && (
            <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-green-50 border-2 border-emerald-400 p-4 rounded-2xl text-center space-y-2.5 shadow-sm">
              <div className="flex items-center justify-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-sm">
                  <MessageCircle size={18} />
                </div>
                <span className="text-xs font-black uppercase text-emerald-950 tracking-wider">
                  ¡Únete a la Comunidad VIP de WhatsApp!
                </span>
              </div>
              <p className="text-[11px] text-emerald-800 font-semibold leading-relaxed">
                Por el grupo avisamos el inicio del sorteo, resolvemos dudas en vivo y publicamos la tabla de ganadores oficiales.
              </p>
              <a
                href={whatsappGroupLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 bg-[#25D366] hover:bg-[#1ebc59] text-white font-black text-sm uppercase tracking-wider rounded-xl shadow-md transition transform active:scale-95 flex items-center justify-center gap-2"
              >
                <MessageCircle size={18} /> Unirme al Grupo Oficial
              </a>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            <Link 
              to={registrationData.gameId ? `${tenantPrefix}/player?gameId=${registrationData.gameId}` : (tenantPrefix ? `${tenantPrefix}/player` : "/player")} 
              className={`w-full py-4 ${(registrationData.payment_method === 'free' || registrationData.is_free) ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-emerald-600/30' : 'bg-blue-600 hover:bg-blue-700'} text-white font-black text-base md:text-lg rounded-2xl shadow-lg transition active:scale-95 flex items-center justify-center gap-2 uppercase tracking-wide`}
            >
              {(registrationData.payment_method === 'free' || registrationData.is_free) ? '¡IR A JUGAR CON MIS CARTONES GRATIS!' : 'IR A MI PANEL EN LA SALA'} <ArrowRight size={20} />
            </Link>
            <Link 
              to={tenantPrefix || "/"} 
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl transition flex items-center justify-center gap-2 uppercase text-xs"
            >
              <Home size={18} /> Volver a la Sala
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

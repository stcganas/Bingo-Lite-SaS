import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useParams, useSearchParams } from 'react-router-dom';
import { Upload, Home as HomeIcon, Loader2, Wallet, CreditCard, Gift, Info, Clock, QrCode, Copy, Check, MessageCircle, Mail, Lock, ShieldCheck, Eye, EyeOff, Key, Sparkles, Ticket } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../AuthContext';
import { useTenant } from '../TenantContext';
import { playBuyCardSound } from '../utils/sound';
import { formatCurrency, normalizePhone } from '../utils/format';
import { apiFetch } from '../utils/api';
import { ReceiptScanner, ReceiptScanningModal } from '../components/ReceiptScanner';

export default function Register() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams] = useSearchParams();
  const invitedBy = searchParams.get('invited_by') || '';
  const inviteId = searchParams.get('invite_id') || '';
  const urlPhone = searchParams.get('phone') || '';
  const urlRef = searchParams.get('ref') || '';
  const playerRef = searchParams.get('player_ref') || '';
  const gameId = searchParams.get('gameId') || '';
  const isFreeQuery = searchParams.get('free') === 'true' || searchParams.get('is_free') === 'true' || searchParams.get('type') === 'free';
  const registerOnlyQuery = searchParams.get('register_only') === 'true' || searchParams.get('mode') === 'register';
  const { user, loginPlayer } = useAuth();
  const { tenant, tenantSlug, tenantPrefix } = useTenant();
  const [loading, setLoading] = useState(false);
  const [activeGame, setActiveGame] = useState<any>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isRegisterOnly, setIsRegisterOnly] = useState<boolean>(Boolean(registerOnlyQuery));

  const rawTenantCandidate = (slug || tenantSlug || tenant?.slug || 'bingo-lite').toLowerCase();
  const cleanTenant = rawTenantCandidate === 'default' ? 'demo' : rawTenantCandidate;

  const cardPriceNumber = Math.max(0, Number(String(activeGame?.card_value ?? '').replace(/[^0-9.-]+/g, "")) || 0);
  const hasActiveGame = Boolean(activeGame && activeGame.id);
  const isFreeGame = Boolean(
    !invitedBy &&
    activeGame?.is_free !== false &&
    activeGame?.type !== 'paid' &&
    (
      isFreeQuery || 
      activeGame?.is_free === true || 
      activeGame?.is_free === 'true' || 
      activeGame?.is_free === 1 || 
      activeGame?.type === 'free' ||
      (typeof activeGame?.card_value === 'string' && activeGame.card_value.toLowerCase().includes('gratis')) ||
      (activeGame && cardPriceNumber === 0 && activeGame?.is_free === true)
    )
  );

  const [formData, setFormData] = useState({
    name: '',
    phone: urlPhone,
    email: '',
    city: '',
    seller_code: urlRef,
    player_ref: playerRef,
    card_count: isFreeGame ? 2 : (registerOnlyQuery ? 0 : 0),
    password: '',
    room_code: tenant.access_code || 'LITE777',
  });

  // Pre-cargar y sincronizar el código de la sala automáticamente
  useEffect(() => {
    if (tenant?.access_code) {
      setFormData(prev => ({
        ...prev,
        room_code: tenant.access_code || 'LITE777'
      }));
    }
  }, [tenant?.access_code]);

  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        name: user.name || '',
        phone: user.phone || '',
        city: user.city || '',
      }));
    }
  }, [user]);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const clearReceiptFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCloseErrorModal = () => {
    setErrorMsg(null);
    clearReceiptFile();
  };

  const [paymentMethod, setPaymentMethod] = useState<'receipt' | 'wallet' | 'gift' | 'free'>(
    invitedBy ? 'gift' : (isFreeGame ? 'free' : 'receipt')
  );
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [walletActivated, setWalletActivated] = useState<boolean>(false);
  const [hasPassword, setHasPassword] = useState<boolean>(false);
  const [isWalletLoading, setIsWalletLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedNequi, setCopiedNequi] = useState(false);

  useEffect(() => {
    if (invitedBy) {
      setPaymentMethod('gift');
      setFormData(prev => ({ ...prev, card_count: 1 }));
    } else if (isFreeGame) {
      setPaymentMethod('free');
      setFormData(prev => ({ ...prev, card_count: 2 }));
    } else {
      if (paymentMethod === 'free' || paymentMethod === 'gift') {
        setPaymentMethod('receipt');
      }
    }
  }, [invitedBy, isFreeGame]);

  useEffect(() => {
    const tenantParam = `tenantId=${encodeURIComponent(cleanTenant)}`;
    const fetchGamePath = gameId ? `/api/game?id=${gameId}&${tenantParam}` : `/api/game?${tenantParam}`;
    apiFetch(fetchGamePath)
      .then(async res => {
        if (!res.ok) throw new Error('Error al cargar el juego');
        
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await res.text();
          if (text.trim().startsWith('<!doctype') || text.trim().startsWith('<html')) {
            throw new Error('Respuesta del servidor no es JSON');
          }
        }
        
        return res.json();
      })
      .then(data => {
        setActiveGame(data);
        const parsedCost = Math.max(0, Number(String(data?.card_value ?? '').replace(/[^0-9.-]+/g, "")) || 0);
        const isFree = Boolean(
          !invitedBy &&
          data?.is_free !== false &&
          data?.type !== 'paid' &&
          (
            isFreeQuery || 
            data?.is_free === true || 
            data?.is_free === 'true' || 
            data?.is_free === 1 || 
            data?.type === 'free' ||
            (typeof data?.card_value === 'string' && data.card_value.toLowerCase().includes('gratis')) ||
            (parsedCost === 0 && data?.is_free === true)
          )
        );
        if (isFree) {
          if (invitedBy) {
            setFormData(prev => ({ ...prev, card_count: 1 }));
            setPaymentMethod('gift');
          } else {
            setFormData(prev => ({ ...prev, card_count: 2 }));
            setPaymentMethod('free');
          }
        }
      })
      .catch(err => console.error(err));
  }, [gameId, isFreeQuery, invitedBy]);

  useEffect(() => {
    const fetchWallet = async () => {
      const normalizedPhone = normalizePhone(formData.phone);
      if (normalizedPhone.length < 10) return;
      setIsWalletLoading(true);
      try {
        const res = await apiFetch(`/api/wallet?phone=${normalizedPhone}&gameId=${activeGame?.id || ''}`);
        if (res.ok) {
          const data = await res.json();
          setWalletBalance(data.balance);
          setWalletActivated(data.activated);
          setHasPassword(data.hasPassword || false);
        }
      } catch (err) {
        // ignored
      } finally {
        setIsWalletLoading(false);
      }
    };

    const timer = setTimeout(fetchWallet, 500);
    return () => clearTimeout(timer);
  }, [formData.phone, activeGame?.id]);

  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!formData.name.trim()) {
      setErrorMsg('El nombre del jugador es requerido.');
      return;
    }

    const normalizedPhone = normalizePhone(formData.phone);
    if (!normalizedPhone) {
      setErrorMsg('El número de teléfono es requerido.');
      return;
    }

    if (normalizedPhone.length !== 10) {
      setErrorMsg('El número de teléfono de WhatsApp debe tener exactamente 10 dígitos.');
      return;
    }

    if (!formData.password || formData.password.trim().length < 4) {
      setErrorMsg('La contraseña es requerida (mínimo 4 caracteres) para proteger tu cuenta y tus cartones.');
      return;
    }

    if (hasActiveGame && !isFreeGame && !invitedBy && !isRegisterOnly && paymentMethod === 'receipt' && !file) {
      setErrorMsg('Por favor, adjunta el comprobante de pago o selecciona la opción de solo registrar tu cuenta.');
      return;
    }
    
    // Si no es gratuito ni regalo ni solo registro y el método es recibo con comprobante adjunto, mostramos la advertencia primero
    if (hasActiveGame && !isFreeGame && !invitedBy && !isRegisterOnly && paymentMethod === 'receipt' && file && formData.card_count > 0 && !showConfirmModal) {
      setShowConfirmModal(true);
      return;
    }

    await processRegistration();
  };

  const processRegistration = async () => {
    setShowConfirmModal(false);
    setErrorMsg(null);
    setLoading(true);
    const normalizedPhone = normalizePhone(formData.phone);
    const finalMethod = !hasActiveGame 
      ? 'register_only' 
      : (isFreeGame 
          ? 'free' 
          : (invitedBy 
              ? 'gift' 
              : (isRegisterOnly ? 'register_only' : paymentMethod)));
    const finalCards = (!hasActiveGame || isRegisterOnly) 
      ? 0 
      : (isFreeGame 
          ? 2 
          : (invitedBy ? 1 : formData.card_count));
    const data = new FormData();
    data.append('name', formData.name);
    data.append('phone', normalizedPhone);
    data.append('city', formData.city);
    if (formData.email) data.append('email', formData.email.trim());
    data.append('tenant_id', cleanTenant);
    data.append('access_code', formData.room_code || tenant.access_code || 'LITE777');
    if (formData.seller_code) data.append('seller_code', formData.seller_code);
    if (formData.player_ref) data.append('player_ref', formData.player_ref);
    if (formData.password) data.append('password', formData.password);
    data.append('card_count', finalCards.toString());
    data.append('payment_method', finalMethod);
    if (isFreeGame) {
      data.append('is_free', 'true');
    }
    if (gameId) {
      data.append('gameId', gameId);
    }
    if (invitedBy) {
      data.append('invited_by', invitedBy);
    }
    if (inviteId) {
      data.append('invite_id', inviteId);
    }
    if (!isFreeGame && !isRegisterOnly && file) data.append('receipt', file);

    try {
      console.log('Enviando registro para:', normalizedPhone, 'en sala:', cleanTenant);
      const res = await apiFetch(`/api/players?tenantId=${encodeURIComponent(cleanTenant)}`, {
        method: 'POST',
        body: data,
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Error desconocido en el servidor' }));
        console.log('Validación de registro rechazada:', errorData?.error || res.status);
        clearReceiptFile();
        
        if (errorData.message) {
          setErrorMsg(errorData.message);
          return;
        }

        if (errorData.error) {
          setErrorMsg(errorData.error);
          return;
        }

        setErrorMsg(`Error del servidor (${res.status})`);
        return;
      }

      const result = await res.json();
      console.log('Resultado del registro:', result);

      if (result.success) {
        // Guardar token y sesión de jugador directamente para garantizar autenticación inmediata
        const currentSlug = cleanTenant;
        if (result.token) {
          localStorage.setItem('bingo_player_token', result.token);
        }
        if (result.player) {
          const playerObj = {
            uid: result.player.id ? `player-${result.player.id}` : `player-${result.player.phone}`,
            name: result.player.name || formData.name,
            role: 'player' as const,
            phone: result.player.phone || normalizedPhone,
            email: result.player.email,
            city: result.player.city,
            tenant_id: currentSlug
          };
          localStorage.setItem('bingo_player', JSON.stringify(playerObj));
          localStorage.setItem(`bingo_player_${currentSlug.toLowerCase()}`, JSON.stringify(playerObj));
        }

        // Construir el Resumen de Cuenta completo para WhatsApp
        const roomName = tenant.name || 'Bingo Lite Oficial';
        const roomAccessCode = formData.room_code || tenant.access_code || 'LITE777';
        const origin = typeof window !== 'undefined' ? window.location.origin : 'https://bingolite.click';
        const roomDirectUrl = `${origin}/sala/${currentSlug}`;

        // Iniciar sesión del jugador automáticamente con el código de sala pre-cargado
        try {
          await loginPlayer(normalizedPhone, formData.password, formData.name, roomAccessCode, currentSlug);
        } catch (loginErr) {
          console.warn('[Register] Aviso en loginPlayer secundario (token ya preservado):', loginErr);
        }
        
        const soundSettings = JSON.parse(localStorage.getItem('bingo-sound-settings') || '{}');
        if (soundSettings.buyCard) playBuyCardSound();

        const accountSummary = 
`🎉 *¡BIENVENIDO A ${roomName.toUpperCase()}!* 🎱
━━━━━━━━━━━━━━━━━━━━━
📋 *RESUMEN DE TU CUENTA:*
👤 *Jugador:* ${formData.name}
📱 *Teléfono:* ${normalizedPhone}
🔑 *Contraseña:* ${formData.password}
${formData.email?.trim() ? `📧 *Email:* ${formData.email.trim()}\n` : ''}🛡️ *Código Seguro de la Sala:* ${roomAccessCode}
🔗 *Enlace Directo de la Sala:*
${roomDirectUrl}
━━━━━━━━━━━━━━━━━━━━━
✅ *Guarda este mensaje:* Contiene tu código de acceso exclusivo y enlace directo para ingresar a la sala y marcar tus cartones en vivo. ¡Muchos éxitos en la partida! 🍀🏆`;

        // Disparar apertura automática de la aplicación nativa de WhatsApp al mismo número
        const cleanDigits = normalizedPhone.replace(/\D/g, '');
        const fullPhoneWithCountry = cleanDigits.length === 10 ? `57${cleanDigits}` : cleanDigits;
        const waUrl = `https://api.whatsapp.com/send?phone=${fullPhoneWithCountry}&text=${encodeURIComponent(accountSummary)}`;

        try {
          window.open(waUrl, '_blank');
        } catch (e) {
          console.warn('Auto open WhatsApp blocked:', e);
        }
        
        const successRoute = tenantPrefix ? `${tenantPrefix}/registration-success` : (currentSlug !== 'bingo-lite' ? `/sala/${currentSlug}/registration-success` : '/registration-success');
        navigate(successRoute, { 
          state: { 
            registrationData: {
              ...formData,
              gameId: gameId || activeGame?.id,
              card_count: finalCards,
              receipt_url: isFreeGame ? 'FREE_GAME' : (isRegisterOnly ? null : result.player?.receipt_url),
              payment_method: finalMethod,
              is_free: isFreeGame,
              active_lottery: activeGame?.active_lottery === true,
              active_draw: activeGame?.active_draw === true,
              roomName,
              roomAccessCode,
              roomDirectUrl,
              accountSummary,
              whatsappSendUrl: waUrl
            } 
          } 
        });
      } else {
        clearReceiptFile();
        setErrorMsg(result.error || 'Error al enviar la solicitud.');
      }
    } catch (error: any) {
      console.error('Error en el proceso de registro:', error);
      clearReceiptFile();
      setErrorMsg(`Error: ${error.message || 'Error de red o del servidor'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex items-center justify-center">
      <div className={`max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border-4 ${isFreeGame ? 'border-emerald-500' : 'border-blue-500'}`}>
        <div className={`${isFreeGame ? 'bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800' : 'bg-blue-600'} p-6 flex flex-col relative overflow-hidden text-white`}>
          {/* Header Background Image */}
          {activeGame?.header_image_url && activeGame.header_image_url !== 'none' && (
            <div 
              className="absolute inset-0 z-0 bg-cover bg-center"
              style={{ 
                backgroundImage: `url(${activeGame.header_image_url})`,
                opacity: activeGame.header_opacity ?? 0.3
              }}
            />
          )}

          <div className="relative z-10 flex items-center gap-4">
            <Link to={tenantPrefix || "/"} className={`p-2 ${isFreeGame ? 'hover:bg-emerald-800/50' : 'hover:bg-blue-700/50'} backdrop-blur-sm rounded-full transition shrink-0`} title="Volver a la sala">
              <HomeIcon size={24} />
            </Link>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-white/20 text-yellow-300 border border-white/20 tracking-wider">
                  🏢 Sala: {tenant.name}
                </span>
                {tenant.access_code && (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                    PIN: {tenant.access_code}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-black tracking-tight drop-shadow-md uppercase">
                {isFreeGame ? '🎁 Cartones Gratis' : isRegisterOnly ? '👤 Registro de Cuenta' : 'Comprar Cartones'}
              </h1>
              {activeGame && (
                <p className={`${isFreeGame ? 'text-emerald-100' : 'text-blue-100'} text-xs font-bold uppercase tracking-wider mt-0.5 drop-shadow-sm`}>
                  Para: {activeGame.name}
                </p>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {hasActiveGame && !isFreeGame && !invitedBy && (
            <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-1.5 border border-slate-200 shadow-inner mb-2">
              <button
                type="button"
                onClick={() => {
                  setIsRegisterOnly(false);
                  setFormData(prev => ({ ...prev, card_count: prev.card_count > 0 ? prev.card_count : 1 }));
                }}
                className={clsx(
                  "flex-1 py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wide transition flex items-center justify-center gap-1.5 cursor-pointer",
                  !isRegisterOnly
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-slate-600 hover:text-slate-900 bg-white/60"
                )}
              >
                <Ticket size={15} /> Comprar Cartones
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsRegisterOnly(true);
                  setFormData(prev => ({ ...prev, card_count: 0 }));
                  clearReceiptFile();
                }}
                className={clsx(
                  "flex-1 py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wide transition flex items-center justify-center gap-1.5 cursor-pointer",
                  isRegisterOnly
                    ? "bg-slate-800 text-white shadow-md"
                    : "text-slate-600 hover:text-slate-900 bg-white/60"
                )}
              >
                <Key size={15} /> Solo Crear Cuenta
              </button>
            </div>
          )}

          {isRegisterOnly && !isFreeGame && !invitedBy && (
            <div className="bg-gradient-to-r from-slate-50 to-blue-50 border-2 border-slate-200 p-4 rounded-2xl space-y-1.5 shadow-xs">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-blue-600 shrink-0" />
                <p className="text-xs font-black text-slate-800 uppercase tracking-tight">Registro de Cuenta Sin Compra</p>
              </div>
              <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                Crearás tu cuenta oficial en la sala sin comprar cartones ahora. Podrás ingresar a tu panel y comprar tus cartones cuando el organizador active el próximo juego.
              </p>
            </div>
          )}
          {isFreeGame && (
            <div className="bg-indigo-50 border-2 border-indigo-200 p-4 rounded-2xl shadow-sm mb-4">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Gift size={20} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-black text-indigo-800 uppercase tracking-widest leading-none">Juego de Práctica 🎁</p>
                  <p className="text-[11px] leading-relaxed text-slate-700 font-bold">
                    Este es un juego gratuito. Los premios obtenidos serán <span className="text-indigo-600 font-black">SALDO PARA TU BILLETERA</span>, el cual podrás usar después para comprar cartones en juegos con premios en efectivo real.
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-indigo-100 flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase tracking-tighter italic justify-center">
                <Clock size={12} /> Próximo sorteo: {activeGame?.start_time ? new Date(activeGame.start_time).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Próximamente'}
              </div>
            </div>
          )}

          {invitedBy && (
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white p-4 rounded-2xl flex items-center gap-3 shadow-md" id="banner-invitacion">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Gift size={20} className="text-yellow-300 animate-bounce" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-yellow-200">¡REGALO ACTIVADO! 🎁</p>
                <p className="text-[11px] font-bold leading-normal">
                  Fuiste invitado por el número <span className="font-extrabold underline">{invitedBy}</span>. ¡Reclama tu cartón de regalo!
                </p>
              </div>
            </div>
          )}

          {isFreeGame ? (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 p-4 rounded-2xl border-2 border-emerald-200 flex justify-between items-center shadow-sm">
              <div>
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Costo por cartón</p>
                <p className="text-xl font-black text-emerald-700 uppercase">¡GRATIS! ($0)</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Premio en Juego</p>
                <p className="text-xl font-black text-green-600">{activeGame?.prize ? formatCurrency(activeGame.prize) : 'Saldo Billetera'}</p>
              </div>
            </div>
          ) : activeGame && (
            <div className="bg-blue-50 p-4 rounded-2xl border-2 border-blue-100 flex justify-between items-center">
              <div>
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Valor por cartón</p>
                <p className="text-xl font-black text-blue-700">{activeGame.card_value ? formatCurrency(activeGame.card_value) : 'Consultar'}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Premio Mayor</p>
                <p className="text-xl font-black text-green-600">{activeGame.prize ? formatCurrency(activeGame.prize) : 'Consultar'}</p>
              </div>
            </div>
          )}

          {/* Banner informativo del envío automático a WhatsApp */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-300 p-3.5 rounded-2xl flex items-center gap-3 shadow-xs">
            <div className="w-9 h-9 rounded-xl bg-[#25D366] text-white flex items-center justify-center shrink-0 shadow-sm">
              <MessageCircle size={18} />
            </div>
            <p className="text-[11px] text-emerald-950 font-bold leading-snug">
              Al finalizar, se abrirá tu aplicación de <strong>WhatsApp</strong> con el resumen de tu cuenta, tu <strong>código seguro de la sala</strong> y tu <strong>enlace directo</strong>.
            </p>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Nombre del jugador *</label>
            <input 
              required 
              type="text" 
              className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-0 outline-none transition"
              placeholder="Ej. Juan Pérez"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Número de WhatsApp (10 dígitos) *</label>
            <input 
              required 
              type="tel" 
              readOnly={!!user}
              className={clsx(
                "w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-0 outline-none transition",
                user && "bg-slate-50 text-slate-500 cursor-not-allowed"
              )}
              placeholder="Ej. 3145261451"
              value={formData.phone}
              onChange={e => setFormData({...formData, phone: e.target.value})}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-bold text-slate-700 flex items-center gap-1.5">
                <Lock size={15} className="text-blue-600" /> Contraseña de Acceso *
              </label>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Requerida</span>
            </div>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                required
                minLength={4}
                className="w-full p-3 pr-11 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-0 outline-none transition"
                placeholder="Crea tu contraseña (mínimo 4 caracteres)"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition p-1"
                title={showPassword ? "Ocultar" : "Mostrar"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1 font-semibold italic">
              Guárdala bien: la usarás para ingresar a la sala y consultar tus cartones en vivo.
            </p>
          </div>

          {/* Campo de Código Seguro de la Sala (Pre-cargado automáticamente) */}
          <div className="bg-emerald-50/70 p-4 rounded-2xl border-2 border-emerald-200 shadow-xs">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-black text-emerald-950 flex items-center gap-1.5">
                <Key size={15} className="text-emerald-700" /> Código de Seguridad de la Sala *
              </label>
              <span className="text-[10px] font-black uppercase text-emerald-800 bg-emerald-200/80 px-2.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                <ShieldCheck size={12} className="text-emerald-700" /> Pre-cargado
              </span>
            </div>
            <div className="relative">
              <input 
                type="text" 
                readOnly
                className="w-full p-3 bg-white border-2 border-emerald-300 rounded-xl font-mono font-black text-emerald-800 text-lg tracking-widest outline-none shadow-inner cursor-default"
                value={formData.room_code || tenant.access_code || 'LITE777'}
              />
            </div>
            <p className="text-[11px] text-emerald-800 font-bold mt-1.5 leading-snug">
              🏢 Código oficial de <strong>{tenant.name || 'la sala'}</strong> pre-establecido para vincular tus cartones y permitir tu ingreso automático.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-bold text-slate-700 flex items-center gap-1.5">
                <Mail size={15} className="text-blue-600" /> Correo Electrónico
              </label>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Opcional</span>
            </div>
            <input 
              type="email" 
              className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-0 outline-none transition"
              placeholder="ejemplo@correo.com"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Ciudad (Opcional)</label>
            <input 
              type="text" 
              className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-0 outline-none transition"
              placeholder="Ej. Bogotá"
              value={formData.city}
              onChange={e => setFormData({...formData, city: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Código de Referido (Opcional)</label>
            <input 
              type="text" 
              className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-0 outline-none transition uppercase"
              placeholder="Si un vendedor te invitó, ingresa su código"
              value={formData.seller_code}
              onChange={e => setFormData({...formData, seller_code: e.target.value})}
            />
          </div>

          {paymentMethod === 'gift' ? (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Cantidad de cartones</label>
              <div className="bg-purple-100 p-4 rounded-2xl border-2 border-purple-300 text-center text-purple-700 font-extrabold flex items-center justify-center gap-2 shadow-sm animate-pulse">
                <Gift size={20} className="text-yellow-600 shrink-0" />
                <span>1 Cartón de Regalo (Gratis)</span>
              </div>
            </div>
          ) : !hasActiveGame ? (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-2xl border-2 border-blue-200 shadow-sm space-y-1.5">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-blue-600 shrink-0" />
                <span className="text-sm font-black text-blue-900 uppercase tracking-tight">Registro General en la Sala</span>
              </div>
              <p className="text-xs text-blue-800 font-medium leading-relaxed">
                No hay un juego activo en este momento. Al completar tu registro tendrás tu cuenta lista; una vez el organizador programe y active el próximo juego, se te cargarán tus <b>2 cartones gratuitos</b> (si el juego es gratis) o podrás comprarlos fácilmente desde tu panel.
              </p>
            </div>
          ) : isFreeGame ? (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Cantidad de cartones</label>
              <div className="bg-emerald-50 p-4 rounded-2xl border-2 border-emerald-200 text-center flex items-center justify-center gap-2 shadow-sm">
                <Gift size={20} className="text-emerald-600 shrink-0" />
                <span className="text-base font-black text-emerald-700 uppercase tracking-tight">2 Cartones Asignados (100% Gratis)</span>
              </div>
            </div>
          ) : isRegisterOnly ? (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Cantidad de cartones</label>
              <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-200 text-center flex items-center justify-center gap-2 shadow-sm">
                <Sparkles size={18} className="text-slate-500 shrink-0" />
                <span className="text-sm font-black text-slate-700 uppercase tracking-tight">0 Cartones (Solo Registro de Cuenta)</span>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Cantidad de cartones</label>
              <div className="flex items-center gap-4">
                <input 
                  required 
                  type="range" 
                  min="1" max="10" 
                  className="flex-1 accent-blue-600"
                  value={formData.card_count}
                  onChange={e => setFormData({...formData, card_count: parseInt(e.target.value)})}
                />
                <span className="text-2xl font-black text-blue-600 w-12 text-center">{formData.card_count}</span>
              </div>
            </div>
          )}

          {/* Payment Method & Proof of Payment (ONLY for paid games with real cost > 0, active game and NOT register only) */}
          {hasActiveGame && !isFreeGame && !isRegisterOnly && cardPriceNumber > 0 && paymentMethod !== 'gift' && paymentMethod !== 'free' && (
            <div className="space-y-3">
              <label className="block text-sm font-bold text-slate-700 mb-1">Método de Pago</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('receipt')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition ${
                    paymentMethod === 'receipt' 
                      ? 'border-blue-500 bg-blue-50 text-blue-700' 
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <CreditCard size={24} />
                  <span className="text-xs font-bold uppercase">Comprobante</span>
                </button>
                <button
                  type="button"
                  disabled={walletBalance <= 0 || !walletActivated}
                  onClick={() => setPaymentMethod('wallet')}
                  className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition ${
                    paymentMethod === 'wallet' 
                      ? 'border-green-500 bg-green-50 text-green-700' 
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  } ${walletBalance <= 0 || !walletActivated ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Wallet size={24} />
                  <span className="text-xs font-bold uppercase text-center">Mi Billetera</span>
                  {walletBalance > 0 && (
                    <span className="text-[10px] font-black text-green-600">
                      {formatCurrency(walletBalance)}
                    </span>
                  )}
                  {walletBalance > 0 && !walletActivated && (
                    <span className="text-[8px] font-bold text-red-500 text-center mt-1">
                      Requiere compra real
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Resumen del Total a Pagar Grande y Destacado con Degradado Verde y Naranja */}
          {!isFreeGame && cardPriceNumber > 0 && paymentMethod !== 'gift' && paymentMethod !== 'free' && (
            <div className="relative overflow-hidden rounded-3xl p-0.5 bg-gradient-to-r from-emerald-500 via-amber-500 to-orange-500 shadow-xl animate-in fade-in duration-300">
              <div className="bg-gradient-to-br from-emerald-50/95 via-amber-50/80 to-orange-50/95 rounded-[22px] p-5 sm:p-6 backdrop-blur-sm space-y-3.5">
                {/* Header tag */}
                <div className="flex items-center justify-between border-b border-orange-200/70 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-3 w-3 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-800">
                      Resumen de Compra
                    </span>
                  </div>
                  <span className="text-xs font-black text-orange-900 bg-orange-100/90 border border-orange-300/80 px-3 py-1 rounded-full shadow-xs">
                    {formData.card_count} {formData.card_count === 1 ? 'Cartón' : 'Cartones'} × {formatCurrency(cardPriceNumber)}
                  </span>
                </div>

                {/* Big Total Price with Green & Orange Two-Tone Gradient */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-1 pt-1">
                  <div>
                    <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-orange-700 block">
                      TOTAL A PAGAR:
                    </span>
                    <span className="text-[11px] text-slate-600 font-bold">
                      {paymentMethod === 'wallet' ? 'Pago inmediato con saldo de tu billetera' : 'Pago por transferencia Nequi'}
                    </span>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight bg-gradient-to-r from-emerald-600 via-teal-600 to-orange-500 bg-clip-text text-transparent drop-shadow-sm font-mono block">
                      {formatCurrency(cardPriceNumber * formData.card_count)}
                    </span>
                  </div>
                </div>

                {/* Specific payment method instructions */}
                {paymentMethod === 'receipt' && (
                  <div className="mt-3 pt-3 border-t border-emerald-200/70 bg-white/80 rounded-2xl p-4 border border-orange-200/60 shadow-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                          Número Nequi oficial para pagar:
                        </span>
                        <span className="text-lg sm:text-xl font-black text-slate-900 tracking-wider font-mono">
                          {activeGame?.nequi_number || '3235304996'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(activeGame?.nequi_number || '3235304996');
                          setCopiedNequi(true);
                          setTimeout(() => setCopiedNequi(false), 2000);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black text-xs transition flex items-center gap-1.5 shadow-md active:scale-95 shrink-0"
                      >
                        {copiedNequi ? <Check size={16} /> : <Copy size={16} />}
                        {copiedNequi ? '¡Copiado!' : 'Copiar Nequi'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                      💡 Transfiere el monto exacto de <strong className="text-orange-700">{formatCurrency(cardPriceNumber * formData.card_count)}</strong> y luego sube la captura con el código QR visible a continuación.
                    </p>
                  </div>
                )}

                {paymentMethod === 'wallet' && (
                  <div className="mt-2 pt-2 border-t border-emerald-200/70 flex items-center justify-between text-xs font-bold text-slate-700">
                    <span>Saldo disponible: {formatCurrency(walletBalance)}</span>
                    <span className="text-emerald-700 font-black">
                      Saldo restante: {formatCurrency(Math.max(0, walletBalance - (cardPriceNumber * formData.card_count)))}
                    </span>
                  </div>
                )}

                <div className="mt-2 pt-2.5 border-t border-emerald-200/60 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-emerald-900 font-bold">
                    <MessageCircle size={15} className="text-[#25D366] shrink-0" />
                    <span className="text-[11px]">¿Dudas? Únete a nuestro WhatsApp oficial:</span>
                  </div>
                  <a
                    href={activeGame?.whatsapp_group_link || 'https://chat.whatsapp.com/CDgs5mXL8HWGJjbJn0VxHk'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 bg-[#25D366] hover:bg-[#1ebc59] text-white font-black text-[10px] rounded-lg transition active:scale-95 shrink-0 uppercase tracking-wider"
                  >
                    Unirme
                  </a>
                </div>
              </div>
            </div>
          )}

          {paymentMethod === 'receipt' && !isFreeGame && cardPriceNumber > 0 && (
            <div className="space-y-3">
              <label className="block text-sm font-bold text-slate-700">
                Comprobante de pago Nequi 
                <span className="font-normal text-xs text-slate-500 ml-1">(con código QR visible)</span>
              </label>

              {file ? (
                <ReceiptScanner 
                  file={file}
                  expectedAmount={cardPriceNumber * formData.card_count}
                  isSubmitting={loading}
                  onClear={clearReceiptFile}
                />
              ) : (
                <div className="relative border-2 border-dashed border-blue-400/80 bg-blue-50/50 hover:bg-blue-50/80 rounded-2xl p-6 text-center transition cursor-pointer group shadow-xs">
                  <input 
                    ref={fileInputRef}
                    required={!isFreeGame && cardPriceNumber > 0 && paymentMethod === 'receipt'} 
                    type="file" 
                    accept="image/*" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    onChange={e => setFile(e.target.files?.[0] || null)}
                  />
                  <div className="flex flex-col items-center gap-2.5 text-slate-600">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition transform">
                      <QrCode size={28} />
                    </div>
                    <div>
                      <span className="font-black text-sm text-slate-800 block">
                        Toca aquí para subir tu comprobante
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        El escáner verificará el código QR oficial de Nequi y los datos impresos
                      </span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold mt-1">
                      <Upload size={12} />
                      JPG, PNG o Captura de pantalla
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-2">
            <button 
              type="submit" 
              disabled={loading}
              className={`w-full py-4 ${isFreeGame || invitedBy ? 'bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-emerald-600/30' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-600/30'} text-white font-black text-lg md:text-xl rounded-2xl shadow-xl transform transition active:scale-95 flex items-center justify-center gap-2.5 disabled:opacity-70 disabled:active:scale-100 uppercase tracking-wider cursor-pointer border border-white/20`}
            >
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  <MessageCircle size={22} className="text-[#25D366] fill-[#25D366] drop-shadow-sm shrink-0" />
                  <span>
                    {invitedBy || paymentMethod === 'gift' 
                      ? "Registrarme y Enviar a WhatsApp" 
                      : isFreeGame 
                        ? "Recibir 2 Cartones Gratis en WhatsApp" 
                        : isRegisterOnly || !hasActiveGame
                          ? "Crear Cuenta y Enviar a WhatsApp"
                          : "Comprar y Enviar a WhatsApp"}
                  </span>
                </>
              )}
            </button>
            <p className="text-[11px] text-center text-slate-500 mt-2 font-medium">
              📲 Al hacer clic se abrirá tu WhatsApp con el resumen de tu cuenta, tu código seguro y tu enlace de la sala.
            </p>
          </div>
        </form>
      </div>

      {/* Modal de Advertencia o Error */}
      {errorMsg && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={handleCloseErrorModal}></div>
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-hidden shadow-2xl relative z-10 animate-in zoom-in-95 duration-200 border-2 border-red-200 flex flex-col">
            <div className="bg-gradient-to-r from-red-600 to-rose-700 p-5 flex items-center justify-between text-white shrink-0 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-xl shrink-0">
                  ⚠️
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight">
                    {isFreeGame || isRegisterOnly || !hasActiveGame || !file ? 'Aviso del Registro' : 'Venta No Aprobada'}
                  </h3>
                  <p className="text-xs text-red-100 font-semibold">
                    {isFreeGame || isRegisterOnly || !hasActiveGame || !file ? 'Registro de Usuario' : 'Auditoría de Comprobante de Pago'}
                  </p>
                </div>
              </div>
              <button 
                onClick={handleCloseErrorModal}
                className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center text-white transition text-sm font-bold"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-slate-800 text-xs sm:text-sm font-medium whitespace-pre-wrap leading-relaxed">
                {errorMsg}
              </div>
              
              {errorMsg.toLowerCase().includes('ya está registrado') || errorMsg.toLowerCase().includes('ya se encuentra registrado') ? (
                <div className="flex flex-col gap-2.5">
                  <button 
                    onClick={() => {
                      handleCloseErrorModal();
                      navigate(tenantPrefix || (cleanTenant !== 'bingo-lite' ? `/sala/${cleanTenant}` : '/'));
                    }}
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-black text-sm uppercase tracking-wider hover:from-emerald-700 hover:to-teal-700 transition shadow-md active:scale-98 flex items-center justify-center gap-2"
                  >
                    <span>Ingresar a la Sala con mi Cuenta</span>
                  </button>
                  <button 
                    onClick={handleCloseErrorModal}
                    className="w-full py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase hover:bg-slate-200 transition"
                  >
                    Corregir número de teléfono
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleCloseErrorModal}
                  className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-black text-sm uppercase tracking-wider hover:from-blue-700 hover:to-indigo-700 transition shadow-md active:scale-98 flex items-center justify-center gap-2"
                >
                  {!(isFreeGame || isRegisterOnly || !hasActiveGame || !file) && <Upload size={16} />}
                  {isFreeGame || isRegisterOnly || !hasActiveGame || !file ? 'Entendido' : 'Entendido, subir nuevo comprobante'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border-4 border-red-500 transform animate-in fade-in zoom-in duration-200">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <span className="text-3xl">⚠️</span>
              </div>
            </div>
            
            <h3 className="text-xl font-black text-center text-slate-800 mb-2 uppercase">
              Advertencia Importante
            </h3>
            
            <p className="text-center text-slate-600 mb-6 font-medium">
              Tu solicitud será aprobada automáticamente, sin embargo, ten en cuenta que <span className="font-bold text-red-600">si el pago no es verificable, si no pagaste, o por falta de consistencia de pruebas del pago, no se te entregará premio alguno</span> en caso de ser ganador.
            </p>
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={processRegistration}
                className="w-full py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition flex items-center justify-center"
              >
                He leído y acepto, ENVIAR
              </button>
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition flex items-center justify-center"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Simulación y Verificación de Escaneo en Tiempo Real: SOLO se abre si hay comprobante adjunto y se compran cartones */}
      <ReceiptScanningModal 
        isOpen={Boolean(
          loading && 
          file && 
          hasActiveGame && 
          !isFreeGame && 
          !isRegisterOnly && 
          !invitedBy && 
          paymentMethod === 'receipt' && 
          formData.card_count > 0 && 
          cardPriceNumber > 0
        )} 
        expectedAmount={cardPriceNumber * (formData.card_count || 1)} 
      />
    </div>
  );
}

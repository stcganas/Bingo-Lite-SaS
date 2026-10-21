import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Sparkles, ShieldCheck, Zap, Users, Trophy, Radio, Wallet, 
  Smartphone, ChevronRight, CheckCircle2, Copy, Check, ExternalLink,
  ArrowRight, Play, Calculator, Layers, Award, Star, MessageCircle, Lock
} from 'lucide-react';
import { apiFetch } from '../utils/api';

export default function SaaSMarketingLanding() {
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdResult, setCreatedResult] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Formulario de nueva sala con administrador independiente
  const [roomForm, setRoomForm] = useState({
    name: '',
    slug: '',
    access_code: '',
    primary_color: '#2563eb',
    contact_phone: '',
    organizer_name: '',
    admin_email: '',
    admin_password: '',
    admin_password_confirm: ''
  });
  const [formError, setFormError] = useState<string | null>(null);

  // Calculadora interactiva
  const [calcCards, setCalcCards] = useState<number>(1000);
  const [calcCardPrice, setCalcCardPrice] = useState<number>(10000); // 10k COP

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const generatedSlug = val
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    setRoomForm(prev => ({
      ...prev,
      name: val,
      slug: generatedSlug,
      // Generar código de acceso sugerido si está vacío
      access_code: prev.access_code || Math.random().toString(36).substring(2, 8).toUpperCase()
    }));
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!roomForm.admin_email || !roomForm.admin_password) {
      setFormError('Debes ingresar el correo y la contraseña para el Administrador de tu sala.');
      return;
    }

    if (roomForm.admin_password.length < 6) {
      setFormError('La contraseña del administrador debe tener al menos 6 caracteres.');
      return;
    }

    if (roomForm.admin_password !== roomForm.admin_password_confirm) {
      setFormError('Las contraseñas de administrador no coinciden.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await apiFetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roomForm.name,
          slug: roomForm.slug,
          access_code: roomForm.access_code,
          primary_color: roomForm.primary_color,
          contact_phone: roomForm.contact_phone,
          organizer_name: roomForm.organizer_name,
          admin_name: roomForm.organizer_name,
          admin_email: roomForm.admin_email,
          admin_password: roomForm.admin_password
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo crear la sala');
      }

      const roomSlug = data.tenant?.slug || roomForm.slug;
      const dynamicUrl = `${window.location.origin}/sala/${roomSlug}`;
      const adminUrl = `${window.location.origin}/sala/${roomSlug}/admin`;
      setCreatedResult({
        ...data,
        url: dynamicUrl,
        adminUrl,
        roomSlug,
        adminEmail: roomForm.admin_email
      });
    } catch (err: any) {
      setFormError(err.message || 'Error al conectar con el servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string, type: 'link' | 'code') => {
    navigator.clipboard.writeText(text);
    if (type === 'link') {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } else {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  const totalPot = calcCards * calcCardPrice;
  const organizerProfit = Math.round(totalPot * 0.35); // 35% margen organizador promedio

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-600 selection:text-white">
      {/* NAVBAR */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-slate-950/80 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/logo.png" 
              alt="Bingo Lite Logo" 
              className="w-12 h-12 rounded-2xl object-cover shadow-lg shadow-blue-500/25 border-2 border-yellow-400/60 hover:scale-105 transition"
            />
            <div>
              <span className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                Bingo Lite <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">SaaS Multi-tenant</span>
              </span>
              <p className="text-[11px] text-slate-400 font-medium hidden sm:block">Plataforma de Salas Virtuales en Vivo</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-300">
            <a href="#modulos" className="hover:text-blue-400 transition">Módulos</a>
            <a href="#capacidad" className="hover:text-blue-400 transition">Capacidad (20k)</a>
            <a href="#calculadora" className="hover:text-blue-400 transition">Calculadora</a>
            <Link to="/sala/demo" className="flex items-center gap-1.5 text-purple-400 hover:text-purple-300 transition font-bold px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30">
              <Sparkles size={14} className="text-purple-400" /> Sala Demo
            </Link>
            <Link to="/sala/bingo-lite" className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition font-bold">
              <Play size={14} className="fill-amber-400" /> Sala Oficial
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-bold shadow-lg shadow-blue-600/25 transition transform active:scale-95 flex items-center gap-2"
            >
              <Sparkles size={16} />
              <span>Crear mi Sala</span>
            </button>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-32">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-blue-600/15 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute top-1/3 right-10 w-[400px] h-[250px] bg-indigo-600/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-blue-400 text-xs font-bold uppercase tracking-wider mb-8 shadow-inner">
            <Zap size={14} className="text-yellow-400" /> Nuevo: Arquitectura para 20.000 Cartones en RAM
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white max-w-4xl mx-auto leading-[1.1] mb-6">
            Crea tu propia <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-300 to-amber-300">Sala de Bingo Virtual</span> en minutos
          </h1>

          <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto font-normal leading-relaxed mb-10">
            La solución SaaS más avanzada de sorteos de bingo en vivo: locución autónoma con Inteligencia Artificial, billetera digital segura, código de acceso exclusivo por sala y resumen automático enviado al WhatsApp del jugador.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-2xl mx-auto mb-16">
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full sm:w-auto px-7 py-4 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-base shadow-xl shadow-blue-500/25 transition transform active:scale-95 flex items-center justify-center gap-2"
            >
              <span>Crear mi Sala</span>
              <ArrowRight size={18} />
            </button>
            <Link
              to="/sala/demo"
              className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-purple-950/80 hover:bg-purple-900/90 text-purple-200 border border-purple-700/60 font-bold text-base transition flex items-center justify-center gap-2 shadow-lg shadow-purple-950/40"
            >
              <Sparkles size={16} className="text-purple-300" />
              <span>Sala Demo (Visitantes)</span>
            </Link>
            <Link
              to="/sala/bingo-lite"
              className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 font-bold text-base transition flex items-center justify-center gap-2"
            >
              <Play size={16} className="text-amber-400 fill-amber-400" />
              <span>Sala Oficial</span>
            </Link>
          </div>

          {/* Badges de Rendimiento */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto pt-8 border-t border-slate-900 text-left">
            <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80">
              <p className="text-2xl sm:text-3xl font-black text-white">20.000+</p>
              <p className="text-xs text-slate-400 font-medium mt-1">Cartones en tiempo real por partida sin caídas</p>
            </div>
            <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80">
              <p className="text-2xl sm:text-3xl font-black text-emerald-400">&lt; 15 ms</p>
              <p className="text-xs text-slate-400 font-medium mt-1">Evaluación instantánea de ganadores en memoria RAM</p>
            </div>
            <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80">
              <p className="text-2xl sm:text-3xl font-black text-amber-400">WhatsApp</p>
              <p className="text-xs text-slate-400 font-medium mt-1">Envío nativo del resumen y código seguro</p>
            </div>
            <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80">
              <p className="text-2xl sm:text-3xl font-black text-blue-400">100% PWA</p>
              <p className="text-xs text-slate-400 font-medium mt-1">Instalable al instante sin pasar por tiendas</p>
            </div>
          </div>
        </div>
      </section>

      {/* MODULOS Y CARACTERISTICAS */}
      <section id="modulos" className="py-20 bg-slate-900/50 border-t border-slate-800/60 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs font-black uppercase tracking-widest text-blue-400 mb-3">Módulos de la Plataforma</h2>
            <h3 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Todo lo que tu organización necesita para operar sorteos exitosos
            </h3>
            <p className="text-slate-400 text-sm sm:text-base mt-4 font-normal">
              Bingo Lite integra el ecosistema completo: desde la locución con inteligencia artificial hasta la gestión de ventas de revendedores.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800 hover:border-blue-500/40 transition group">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-5 group-hover:bg-blue-600 group-hover:text-white transition">
                <Radio size={24} />
              </div>
              <h4 className="text-lg font-bold text-white mb-2">Locutor IA Autónomo & DJ Board</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                Extracción automática de balotas cada 8 segundos con anuncio por voz generado mediante Inteligencia Artificial, música de fondo sincronizada y efectos de sonido en vivo.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800 hover:border-indigo-500/40 transition group">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-5 group-hover:bg-indigo-600 group-hover:text-white transition">
                <Lock size={24} />
              </div>
              <h4 className="text-lg font-bold text-white mb-2">Código de Seguridad por Sala</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                Cada sala tiene su código de acceso exclusivo (PIN). Los jugadores reciben su comprobante con el código de sala y credenciales directamente en su WhatsApp al registrarse.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800 hover:border-emerald-500/40 transition group">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-5 group-hover:bg-emerald-600 group-hover:text-white transition">
                <Trophy size={24} />
              </div>
              <h4 className="text-lg font-bold text-white mb-2">Motor de 20.000 Cartones en RAM</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                Validación atómica de figuras (Cartón lleno, Líneas, Cuatro Esquinas, Letra X) con algoritmos O(1). Detección y congelamiento de ganador sin ningún margen de error humano.
              </p>
            </div>

            {/* Card 4 */}
            <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800 hover:border-amber-500/40 transition group">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-5 group-hover:bg-amber-600 group-hover:text-white transition">
                <Wallet size={24} />
              </div>
              <h4 className="text-lg font-bold text-white mb-2">Billetera Digital Atómica</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                Los jugadores pueden recargar saldo, comprar cartones en segundos y cobrar premios de manera segura con protección anti-duplicidad garantizada.
              </p>
            </div>

            {/* Card 5 */}
            <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800 hover:border-purple-500/40 transition group">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-5 group-hover:bg-purple-600 group-hover:text-white transition">
                <Users size={24} />
              </div>
              <h4 className="text-lg font-bold text-white mb-2">Red de Revendedores & Comisiones</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                Crea promotores con enlaces y códigos propios. Cada promotor tiene su propio panel de ventas, estadísticas en vivo y cálculo automático de comisiones ganadas.
              </p>
            </div>

            {/* Card 6 */}
            <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800 hover:border-cyan-500/40 transition group">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-5 group-hover:bg-cyan-600 group-hover:text-white transition">
                <Smartphone size={24} />
              </div>
              <h4 className="text-lg font-bold text-white mb-2">Landing Propia y Marca Blanca</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                Tu sala en <code className="text-blue-300 font-bold">bingolite.click/sala/tu-sala</code> con tu logotipo, tus colores y tus reglas del juego sin necesidad de hosting adicional.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CALCULADORA DE INGRESOS */}
      <section id="calculadora" className="py-20 border-t border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 p-8 sm:p-12 rounded-3xl border border-slate-800 shadow-2xl">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <span className="text-xs font-black uppercase tracking-widest text-amber-400 flex items-center justify-center gap-1.5 mb-2">
                <Calculator size={14} /> Simulador de Negocio
              </span>
              <h3 className="text-2xl sm:text-3xl font-black text-white">¿Cuánto puedes recaudar en tu sala?</h3>
              <p className="text-slate-400 text-sm mt-2">Ajusta los cartones y el valor para estimar la recaudación bruta y la ganancia esperada.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-center text-sm font-bold text-slate-300 mb-2">
                    <span>Cartones a vender por partida:</span>
                    <span className="text-blue-400 font-black text-lg">{calcCards.toLocaleString()} cartones</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="10000"
                    step="100"
                    value={calcCards}
                    onChange={e => setCalcCards(Number(e.target.value))}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <div className="flex justify-between text-[11px] text-slate-500 font-bold mt-1">
                    <span>100</span>
                    <span>5.000</span>
                    <span>10.000</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center text-sm font-bold text-slate-300 mb-2">
                    <span>Valor por cartón:</span>
                    <span className="text-emerald-400 font-black text-lg">${calcCardPrice.toLocaleString()} COP</span>
                  </div>
                  <input
                    type="range"
                    min="2000"
                    max="50000"
                    step="1000"
                    value={calcCardPrice}
                    onChange={e => setCalcCardPrice(Number(e.target.value))}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                  <div className="flex justify-between text-[11px] text-slate-500 font-bold mt-1">
                    <span>$2.000</span>
                    <span>$25.000</span>
                    <span>$50.000</span>
                  </div>
                </div>
              </div>

              {/* Resultado */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 flex flex-col justify-center space-y-4 text-center">
                <div>
                  <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Recaudación Bruta por Sorteo</p>
                  <p className="text-3xl sm:text-4xl font-black text-white mt-1">
                    ${totalPot.toLocaleString()} <span className="text-xs text-slate-400">COP</span>
                  </p>
                </div>
                <div className="pt-4 border-t border-slate-800">
                  <p className="text-xs text-amber-400 uppercase font-black tracking-wider">Margen Neto Estimado del Organizador (35%)</p>
                  <p className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1">
                    ${organizerProfit.toLocaleString()} <span className="text-xs text-slate-400">COP</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">*Después de destinar el 65% a bolsa de premios y comisiones de revendedores.</p>
                </div>
              </div>
            </div>

            <div className="text-center mt-10">
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm shadow-lg shadow-blue-600/30 transition transform active:scale-95 inline-flex items-center gap-2"
              >
                <span>Comenzar con mi Sala</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 border-t border-slate-900 bg-slate-950 text-slate-500 text-xs text-center">
        <div className="max-w-7xl mx-auto px-4 space-y-4">
          <p className="font-bold text-slate-400">
            Bingo Lite &copy; {new Date().getFullYear()} — Plataforma de Bingo Virtual Multi-tenant. Todos los derechos reservados.
          </p>
          <div className="flex justify-center items-center flex-wrap gap-4 sm:gap-6 font-medium">
            <Link to="/sala/demo" className="text-purple-400 hover:text-purple-300 font-bold transition">Sala Demo (Visitantes)</Link>
            <Link to="/sala/bingo-lite" className="text-blue-400 hover:text-blue-300 font-bold transition">Sala Oficial (Bingo Lite)</Link>
            <Link to="/admin/login" className="hover:text-slate-300 transition">Acceso Administrador</Link>
            <Link to="/seller" className="hover:text-slate-300 transition">Portal Revendedores</Link>
            <span className="text-slate-800 hidden sm:inline">•</span>
            <Link to="/superadmin" className="text-indigo-400 hover:text-indigo-300 font-bold transition inline-flex items-center gap-1.5 bg-indigo-950/60 border border-indigo-900/80 px-3 py-1 rounded-full">
              <Lock size={12} /> Super Admin
            </Link>
          </div>
        </div>
      </footer>

      {/* MODAL: CREAR SALA DE BINGO */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-left shadow-2xl relative my-8">
            {createdResult ? (
              // RESULTADO DE SALA CREADA
              <div className="space-y-6 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={36} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white">¡Tu Sala está Lista!</h3>
                  <p className="text-xs text-slate-400 mt-1">Sala y administrador independiente creados con aislamiento total de datos.</p>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-4 text-left">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Enlace para Jugadores:</label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        readOnly
                        value={createdResult.url}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-blue-400 font-mono select-all"
                      />
                      <button
                        onClick={() => copyToClipboard(createdResult.url, 'link')}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition shrink-0"
                        title="Copiar Enlace"
                      >
                        {copiedLink ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Código Seguro de Acceso (PIN):</label>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-xl font-black text-amber-400 tracking-wider bg-slate-900 px-4 py-1.5 rounded-xl border border-slate-800">
                        {createdResult.access_code}
                      </span>
                      <button
                        onClick={() => copyToClipboard(createdResult.access_code, 'code')}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition shrink-0"
                        title="Copiar Código"
                      >
                        {copiedCode ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 font-semibold">Tus jugadores requerirán este código para ingresar.</p>
                  </div>

                  <div className="pt-3 border-t border-slate-900">
                    <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Lock size={12} />
                      <span>Panel Exclusivo de Administrador:</span>
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        readOnly
                        value={createdResult.adminUrl}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-amber-300 font-mono select-all"
                      />
                      <button
                        onClick={() => copyToClipboard(createdResult.adminUrl, 'link')}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition shrink-0"
                        title="Copiar Enlace Admin"
                      >
                        {copiedLink ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Usuario Admin: <span className="text-slate-200 font-bold">{createdResult.adminEmail}</span> (Acceso restringido únicamente a esta sala).
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Link
                    to={`/sala/${createdResult.roomSlug || createdResult.tenant?.slug || roomForm.slug}/admin`}
                    className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/20 transition text-center flex items-center justify-center gap-2"
                  >
                    <span>Ir a mi Panel Admin</span>
                    <ExternalLink size={16} />
                  </Link>
                  <Link
                    to={`/sala/${createdResult.roomSlug || createdResult.tenant?.slug || roomForm.slug}`}
                    className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm shadow-lg shadow-blue-600/30 transition text-center flex items-center justify-center gap-2"
                  >
                    <span>Ver Sala</span>
                  </Link>
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setCreatedResult(null);
                    }}
                    className="px-5 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              // FORMULARIO DE CREACIÓN
              <form onSubmit={handleCreateRoom} className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-black text-white">Crear Nueva Sala de Bingo</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Configura tu sala y tu usuario de administrador independiente.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="text-slate-500 hover:text-slate-300 font-bold text-lg"
                  >
                    ✕
                  </button>
                </div>

                {formError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-bold">
                    {formError}
                  </div>
                )}

                {/* SECCIÓN 1: DATOS DE LA SALA */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Nombre de tu Organización o Sala *
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="Ej. Bingo Los Ganadores"
                      value={roomForm.name}
                      onChange={handleNameChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm focus:border-blue-500 outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Enlace de tu sala (URL)
                    </label>
                    <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-300">
                      <span className="text-slate-500">{typeof window !== 'undefined' ? `${window.location.host}/sala/` : 'bingolite.click/sala/'}</span>
                      <input
                        required
                        type="text"
                        placeholder="mi-sala"
                        value={roomForm.slug}
                        onChange={e => setRoomForm({...roomForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')})}
                        className="bg-transparent text-blue-400 font-bold outline-none flex-1 ml-0.5"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Código Seguro de Sala (PIN)
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. ORO777"
                        value={roomForm.access_code}
                        onChange={e => setRoomForm({...roomForm, access_code: e.target.value.toUpperCase()})}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-amber-400 font-mono font-bold text-sm focus:border-amber-500 outline-none transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Color de Marca
                      </label>
                      <div className="flex items-center gap-3 bg-slate-950 border border-slate-800 rounded-xl p-2">
                        <input
                          type="color"
                          value={roomForm.primary_color}
                          onChange={e => setRoomForm({...roomForm, primary_color: e.target.value})}
                          className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0"
                        />
                        <span className="text-xs font-mono text-slate-300">{roomForm.primary_color}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECCIÓN 2: DATOS DEL ADMINISTRADOR */}
                <div className="pt-3 border-t border-slate-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Administrador Independiente
                    </span>
                    <span className="text-[10px] text-slate-500">Credenciales exclusivas para esta sala</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Nombre del Organizador
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Carlos Mendoza"
                        value={roomForm.organizer_name}
                        onChange={e => setRoomForm({...roomForm, organizer_name: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-xs focus:border-amber-500 outline-none transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Teléfono / WhatsApp
                      </label>
                      <input
                        type="tel"
                        placeholder="Ej. 3001234567"
                        value={roomForm.contact_phone}
                        onChange={e => setRoomForm({...roomForm, contact_phone: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-xs focus:border-amber-500 outline-none transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Correo Electrónico de Administrador *
                    </label>
                    <input
                      required
                      type="email"
                      placeholder="admin@misala.com"
                      value={roomForm.admin_email}
                      onChange={e => setRoomForm({...roomForm, admin_email: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-xs focus:border-amber-500 outline-none transition"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Contraseña de Admin *
                      </label>
                      <input
                        required
                        type="password"
                        placeholder="Mínimo 6 caracteres"
                        value={roomForm.admin_password}
                        onChange={e => setRoomForm({...roomForm, admin_password: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-xs focus:border-amber-500 outline-none transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Confirmar Contraseña *
                      </label>
                      <input
                        required
                        type="password"
                        placeholder="Repite la contraseña"
                        value={roomForm.admin_password_confirm}
                        onChange={e => setRoomForm({...roomForm, admin_password_confirm: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-xs focus:border-amber-500 outline-none transition"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-sm shadow-lg shadow-blue-600/30 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <span>Creando sala y credenciales...</span>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        <span>Publicar mi Sala</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-5 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

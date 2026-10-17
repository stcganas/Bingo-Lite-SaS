import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Home, ArrowLeft, Phone, User, Key, MessageCircle, Bell, Gift, Trophy, Star, ChevronRight, Zap, BellRing, BookOpen, X, Sparkles, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { promptPushPermission } from '../lib/onesignal';
import toast from 'react-hot-toast';

export default function DynamicsInfo() {
  const navigate = useNavigate();
  const [showNoticeModal, setShowNoticeModal] = useState(true);

  const handleActivateNotifications = async () => {
    try {
      const granted = await promptPushPermission();
      if (granted) {
        toast.success('¡Notificaciones activadas con éxito! 🔔');
      } else {
        toast.error('No se pudieron activar las notificaciones. Verifica los permisos de tu navegador.');
      }
    } catch (error) {
      toast.error('Error al intentar activar las notificaciones.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      {/* Header */}
      <div className="bg-indigo-600 text-white p-4 sticky top-0 z-50 shadow-lg">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-lg font-black uppercase tracking-widest">Dinámica del Juego</h1>
          <div className="w-10" /> {/* Spacer */}
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-8">
        {/* Welcome Banner */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-slate-100 text-center space-y-4"
        >
          <div className="text-4xl">🎉🏠</div>
          <h2 className="text-2xl font-black text-slate-900 leading-tight uppercase tracking-tight">
            ¡BIENVENIDOS A BINGO LITE – ENTRETENIMIENTO DESDE CASA!
          </h2>
          <p className="text-slate-600 font-bold leading-relaxed">
            🙌 ¡Bienvenidos a todos nuestros participantes! Nos alegra muchísimo tenerlos con nosotros en esta experiencia llena de diversión, emoción, entretenimiento y grandes oportunidades de ganar. 🥳🎯💰
          </p>
        </motion.div>

        {/* Official App */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
              <Zap size={20} />
            </div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">📲 APLICACIÓN OFICIAL – BINGO LITE</h3>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-100 space-y-4">
            <p className="text-slate-600 font-medium italic">
              Aquí desarrollaremos nuestras dinámicas y actividades de Entretenimiento desde Casa 🏠🎉.
            </p>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Ingresa a la plataforma oficial:</p>
              <a 
                href="https://bingolite.click" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-indigo-600 font-black text-lg underline break-all"
              >
                👉 https://bingolite.click
              </a>
            </div>
          </div>
        </section>

        {/* How to Register */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
              <User size={20} />
            </div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">📱 ¿CÓMO REGISTRARTE?</h3>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-100 space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-black shrink-0">1</div>
              <p className="text-slate-700 font-bold">Ingresa a Bingo Lite y busca la opción <span className="text-blue-600 uppercase">“INGRESAR”</span>.</p>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-black shrink-0">2</div>
              <p className="text-slate-700 font-bold">Digita tu número de teléfono 📱.</p>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-black shrink-0">3</div>
              <p className="text-slate-700 font-bold">Si aún no eres usuario, serás dirigido automáticamente al formulario de registro.</p>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-black shrink-0">4</div>
              <div className="space-y-2">
                <p className="text-slate-700 font-bold text-lg uppercase tracking-tight">Completa tus datos:</p>
                <ul className="space-y-2 text-slate-600 font-bold list-disc pl-4">
                  <li>👤 Nombre completo</li>
                  <li>📱 Número de teléfono</li>
                  <li>🔐 Contraseña para proteger tu cuenta</li>
                </ul>
              </div>
            </div>
            <div className="bg-amber-50 border-2 border-amber-200 p-4 rounded-2xl flex items-start gap-3">
              <div className="p-2 bg-amber-200 rounded-xl text-amber-700">
                <Key size={20} />
              </div>
              <p className="text-amber-800 font-black text-xs uppercase leading-relaxed">
                ⚠️ IMPORTANTE: Guarda muy bien tu contraseña y no la olvides. 🔐
              </p>
            </div>
          </div>
        </section>

        {/* Join the Group */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
              <MessageCircle size={20} />
            </div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">👥 ¡ÚNETE AL GRUPO!</h3>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-100 space-y-4 text-center">
            <p className="text-slate-700 font-bold text-lg">
              Si todavía no haces parte de nuestro grupo de WhatsApp, ¡únete! 📲💬
            </p>
            <p className="text-slate-600 font-medium">
              Es muy importante porque por este medio estaremos compartiendo información sobre:
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: '🎉', label: 'Eventos' },
                { icon: '🎲', label: 'Juegos' },
                { icon: '🏆', label: 'Premios' },
                { icon: '💰', label: 'Recargas' },
                { icon: '⏰', label: 'Inicio' },
                { icon: '📢', label: 'Noticias' }
              ].map((item, i) => (
                <div key={i} className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col items-center justify-center gap-1">
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{item.label}</span>
                </div>
              ))}
            </div>
            <a 
              href="https://chat.whatsapp.com/CDgs5mXL8HWGJjbJn0VxHk" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-center justify-center items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all transform active:scale-95 uppercase tracking-wider"
            >
              <MessageCircle size={20} /> ¡Unirme Ahora!
            </a>
          </div>
        </section>

        {/* Notifications */}
        <section className="bg-gradient-to-r from-purple-600 to-indigo-700 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden text-center space-y-4">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
          <div className="relative z-10 inline-flex p-4 bg-white/20 backdrop-blur-md rounded-2xl border border-white/20 mb-2">
            <Bell size={32} className="animate-ring" />
          </div>
          <h3 className="text-2xl font-black uppercase tracking-tight relative z-10">
            🔔 SUSCRÍBETE Y ACTIVA LAS NOTIFICACIONES
          </h3>
          <p className="text-indigo-100 font-bold text-sm relative z-10 leading-relaxed">
            Así podrás enterarte a tiempo de cada evento, juego y oportunidad que tengamos disponible. 🚀🔥
          </p>

          <div className="relative z-10 pt-2">
            <button 
              onClick={handleActivateNotifications}
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-indigo-600 rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-indigo-50 transition-all transform active:scale-95 text-xs"
            >
              <BellRing size={18} className="animate-pulse" /> Activar Notificaciones Ahora
            </button>
          </div>
        </section>

        {/* Gift Cards */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-pink-100 text-pink-600 rounded-xl flex items-center justify-center">
              <Gift size={20} />
            </div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">🎁 ¡TUS CARTONES DE CORTESÍA!</h3>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-100 space-y-4">
            <div className="bg-pink-50 p-4 rounded-2xl border border-pink-100 text-pink-900 font-black text-center uppercase tracking-tight">
              🎉 ¡Tenemos algo especial para ti!
            </div>
            <p className="text-slate-700 font-bold leading-relaxed">
              Si ya realizaste tu registro y reclamaste tus 2 cartones gratuitos, ahora puedes regalar tus 4 cartones de cortesía adicionales 🎁🎁🎁🎁.
            </p>
            <div className="flex items-start gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="p-2 bg-indigo-600 text-white rounded-lg">
                <MessageCircle size={18} />
              </div>
              <p className="text-slate-600 font-bold text-sm leading-relaxed">
                Puedes enviarlos por WhatsApp a tus amigos, familiares o personas cercanas para que ellos también puedan participar. Busca el botón morado que dice <span className="text-purple-600 uppercase">Regalar</span> con un icono de regalo en la parte de arriba de tu panel de juego o la cajita de regalos que se encuentra en la parte izquierda inferior de la aplicación, allí puedes encontrar la opción para enviar los cartones de regalos.
              </p>
            </div>
            <p className="text-center text-slate-500 font-black uppercase text-[10px] tracking-[0.2em] pt-2">
              👨‍👩‍👧‍👦 Invítalos a ser parte de la familia Bingo Lite – Entretenimiento desde Casa. 🏠❤️
            </p>
          </div>
        </section>

        {/* Game Info */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 text-yellow-600 rounded-xl flex items-center justify-center shrink-0">
              <Trophy size={20} />
            </div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
              🏆💰 INFORMACIÓN DEL JUEGO • FIGURAS O PATRONES EN JUEGO
            </h3>
          </div>

          <div className="bg-amber-50 border-2 border-amber-200/80 p-5 rounded-3xl space-y-2 shadow-sm">
            <p className="text-slate-700 font-bold text-sm leading-relaxed">
              Las figuras y premios saldrán de forma aleatoria. Las figuras que se vayan completando en el juego se irán detectando automáticamente; esté muy pendiente a su cartón que le avisará cuando ya tenga Bingo para que le dé lo más rápido posible al botón <span className="text-emerald-700 font-extrabold underline uppercase">Cantar Bingo</span>, ¡ya que otra persona puede ganarle de mano! ⚡🎯
            </p>
          </div>

          <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl space-y-6 relative overflow-hidden">
            <div className="absolute bottom-0 right-0 w-48 h-48 bg-yellow-500/10 rounded-full blur-3xl -mb-20 -mr-10"></div>
            
            <div className="space-y-4">
              {[
                { label: 'Primera figura', value: '$10.000' },
                { label: 'Segunda figura', value: '$15.000' },
                { label: 'Tercera figura', value: '$25.000' },
                { label: 'Cartón lleno', value: '$50.000', featured: true }
              ].map((prize, i) => (
                <div key={i} className={clsx(
                  "flex items-center justify-between p-4 rounded-2xl border transition-all",
                  prize.featured 
                    ? "bg-yellow-500 border-yellow-400 text-yellow-950 scale-105 shadow-xl" 
                    : "bg-white/5 border-white/10 text-white"
                )}>
                  <span className="font-black uppercase tracking-widest text-xs">{prize.label}</span>
                  <span className="text-2xl font-black">{prize.value}</span>
                </div>
              ))}
            </div>

            <div className="text-center pt-4">
              <p className="text-yellow-400 font-black italic">
                🔥 ¡Prepárate para disfrutar, participar y vivir la emoción del Bingo desde la comodidad de tu casa!
              </p>
            </div>
          </div>
        </section>

        {/* Footer info */}
        <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-slate-100 text-center space-y-6">
          <div className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-full text-xs font-black uppercase tracking-[0.2em] shadow-lg animate-pulse">
            📅 PRÓXIMO JUEGO: DOMINGO 11 DE OCTUBRE
          </div>
          
          <p className="text-slate-600 font-bold leading-relaxed">
            📲 Regístrate, activa tus notificaciones, invita a tus amigos y no te pierdas ninguna de nuestras dinámicas.
          </p>

          <div className="pt-4 border-t border-slate-100 space-y-1">
            <h4 className="text-2xl font-black text-indigo-600 uppercase tracking-tighter italic">🎉 BINGO LITE</h4>
            <p className="text-slate-400 font-black text-[10px] uppercase tracking-[0.3em]">🏠 Entretenimiento desde Casa</p>
            <div className="flex justify-center items-center gap-2 pt-2 text-slate-300">
              <Star size={12} className="fill-current" />
              <Star size={12} className="fill-current" />
              <Star size={12} className="fill-current" />
            </div>
            <p className="text-xs font-black text-slate-800 uppercase tracking-widest pt-2">
              💛 Comparte • Participa • Disfruta • Gana 🏆
            </p>
          </div>
        </div>

        {/* CTA Button */}
        <button 
          onClick={() => navigate('/register')}
          className="w-full py-5 bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 text-yellow-950 font-black text-xl rounded-3xl shadow-xl shadow-yellow-500/20 transform transition active:scale-[0.98] flex items-center justify-center gap-3 border-b-4 border-yellow-600 uppercase tracking-wider"
        >
          ¡Quiero Registrarme Ya! 🚀
        </button>
      </div>

      {/* Auto Welcome Notice Modal */}
      <AnimatePresence>
        {showNoticeModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNoticeModal(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 30 }}
              transition={{ type: 'spring', damping: 20, stiffness: 200 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 z-10"
            >
              <button 
                onClick={() => setShowNoticeModal(false)}
                className="absolute top-4 right-4 z-20 p-2.5 bg-white/20 hover:bg-white/40 text-white rounded-full transition-all duration-200 backdrop-blur-md border border-white/20 active:scale-95"
                title="Cerrar"
              >
                <X size={18} className="stroke-[3]" />
              </button>

              <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700 p-8 text-center text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                <div className="relative z-10 inline-flex items-center justify-center w-20 h-20 bg-white/20 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl mb-4">
                  <BookOpen size={40} className="text-yellow-300 animate-pulse" />
                </div>
                <h3 className="text-2xl font-black leading-tight tracking-tight uppercase italic">
                  ¡LECTURA RECOMENDADA! 📖
                </h3>
                <p className="text-xs font-bold text-indigo-100 uppercase tracking-widest mt-1">Guía Oficial de Bingo Lite</p>
              </div>

              <div className="p-6 sm:p-8 space-y-5 text-center">
                <p className="text-slate-700 font-bold text-sm sm:text-base leading-relaxed">
                  Te recomendamos <span className="text-indigo-600 font-extrabold underline decoration-indigo-300">leer muy cuidadosamente toda la información</span> de esta página para entender mejor la dinámica del juego, el registro, los cartones de cortesía y cómo ganar.
                </p>

                <div className="bg-amber-50 border-2 border-amber-200/80 p-4 rounded-2xl text-left flex items-start gap-3">
                  <div className="p-2 bg-amber-100 text-amber-700 rounded-xl shrink-0 mt-0.5">
                    <Sparkles size={18} />
                  </div>
                  <p className="text-xs text-amber-900 font-bold leading-relaxed">
                    <strong>💡 Tip Importante:</strong> Estar bien informado te ayudará a reclamar a tiempo tus cartones gratis y cantar Bingo sin contratiempos.
                  </p>
                </div>

                <button
                  onClick={() => setShowNoticeModal(false)}
                  className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black text-base uppercase tracking-wider rounded-2xl shadow-xl shadow-indigo-500/20 transform transition active:scale-95 flex items-center justify-center gap-2 border-b-4 border-indigo-800"
                >
                  <CheckCircle2 size={20} /> ¡Entendido, Empezar a Leer!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes ring {
          0%, 100% { transform: rotate(0); }
          10%, 30%, 50%, 70%, 90% { transform: rotate(10deg); }
          20%, 40%, 60%, 80% { transform: rotate(-10deg); }
        }
        .animate-ring {
          animation: ring 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

function clsx(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}

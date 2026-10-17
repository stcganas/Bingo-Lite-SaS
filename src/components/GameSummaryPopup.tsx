import React from 'react';
import { Trophy, X, Award, Star, Zap, Wallet, Info } from 'lucide-react';
import { formatCurrency } from '../utils/format';
import { motion, AnimatePresence } from 'motion/react';

interface GameSummaryPopupProps {
  winners: {
    player_name: string;
    prize: string;
  }[];
  finalNote: string;
  onClose: () => void;
}

export default function GameSummaryPopup({ winners, finalNote, onClose }: GameSummaryPopupProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-md shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] max-w-2xl w-full flex flex-col relative overflow-hidden border-2 border-slate-200 my-auto"
      >
        {/* Premium Header Decoration */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-br from-indigo-650 via-purple-650 to-pink-650 opacity-[0.06]" />
        
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 bg-slate-100 text-slate-500 p-2.5 rounded-sm hover:bg-slate-200 hover:text-slate-800 transition-all z-20 active:scale-95 border border-slate-250"
        >
          <X size={20} />
        </button>
        
        <div className="px-8 pt-10 pb-6 text-center relative z-10">
          <div className="inline-flex items-center justify-center p-3.5 bg-yellow-400 rounded-sm shadow-md mb-4 group">
            <Trophy size={40} className="text-white group-hover:scale-110 transition-transform duration-500" />
          </div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight leading-none mb-2">¡Juego Concluido!</h2>
          <p className="text-slate-500 font-extrabold uppercase tracking-[0.25em] text-[10px]">Resultados Oficiales y Reglamento</p>
        </div>
        
        <div className="px-8 pb-8 space-y-6 overflow-y-auto max-h-[55vh] custom-scrollbar relative z-10">
          {/* Winners Section */}
          <div>
            <h3 className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
              <Star size={14} className="text-yellow-500" /> Ganadores del Juego
            </h3>
            <div className="space-y-2.5">
              {winners.length === 0 ? (
                <p className="text-center py-6 text-slate-400 font-bold italic border border-dashed border-slate-200 rounded-sm">
                  No se registraron ganadores en esta partida.
                </p>
              ) : (
                winners.map((winner, index) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    key={index}
                    className="w-full bg-slate-50 p-4 rounded-sm border border-slate-200 hover:border-blue-300 hover:bg-blue-50/20 transition-all"
                  >
                    <div className="grid grid-cols-12 gap-3 items-center">
                      {/* Left: Position & Winner Info (7 Cols) */}
                      <div className="col-span-7 flex items-center gap-3 min-w-0">
                        <div className={clsx(
                          "w-10 h-10 flex items-center justify-center font-black rounded-sm text-sm shadow-sm shrink-0",
                          index === 0 ? "bg-yellow-400 text-slate-900 border border-yellow-500" : 
                          index === 1 ? "bg-slate-300 text-slate-700 border border-slate-400" :
                          index === 2 ? "bg-amber-600 text-white border border-amber-700" :
                          "bg-slate-200 text-slate-600 border border-slate-300"
                        )}>
                          #{index + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="font-extrabold text-slate-900 text-base uppercase leading-snug truncate whitespace-nowrap overflow-hidden">
                            {winner.player_name}
                          </p>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mt-0.5">
                            Podio de Ganadores
                          </p>
                        </div>
                      </div>

                      {/* Right: Prize (5 Cols) */}
                      <div className="col-span-5 text-right flex flex-col justify-center border-l border-slate-200 pl-3">
                        <p className="text-xl font-black text-emerald-600 leading-none">
                          {formatCurrency(winner.prize)}
                        </p>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1.5">
                          Premio Obtenido
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>

          {/* Rules and Security Regulations Card */}
          <div className="bg-purple-50 p-5 rounded-sm border border-purple-200">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-purple-650 rounded-sm text-white shrink-0 mt-0.5">
                <Info size={18} className="text-yellow-300 animate-pulse" />
              </div>
              <div className="space-y-2">
                <h4 className="text-purple-900 font-black uppercase tracking-wider text-xs leading-none">
                  Reglamento de Seguridad (Obligatorio) 🔒
                </h4>
                <p className="text-[10px] text-purple-750 font-bold leading-normal">
                  Estas reglas garantizan la transparencia, seguridad y continuidad del juego para todos los participantes:
                </p>
                <ul className="text-slate-700 text-[11px] font-bold space-y-2 mt-1 leading-normal list-none pl-0">
                  <li className="flex items-start gap-1.5 leading-relaxed">
                    <span className="text-purple-600 font-black select-none">•</span>
                    <span>
                      <strong className="text-purple-950 font-extrabold uppercase text-[9px] tracking-wide block">1. Activación de Billetera:</strong> Para poder usar el saldo de tu billetera en un nuevo juego, primero debes haber comprado al menos <strong className="text-purple-900 font-extrabold underline">un (1) cartón con dinero real</strong> (enviando tu comprobante de pago).
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5 leading-relaxed">
                    <span className="text-purple-600 font-black select-none">•</span>
                    <span>
                      <strong className="text-purple-950 font-extrabold uppercase text-[9px] tracking-wide block">2. Regalar a Amigos:</strong> La opción para obsequiar cartones gratis a tus conocidos se habilitará únicamente si has adquirido previamente un mínimo de <strong className="text-purple-900 font-extrabold underline">dos (2) cartones</strong> en el juego activo.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Important Notice & Info Section */}
          <div className="space-y-3">
            <div className="bg-emerald-50 p-5 rounded-sm border border-emerald-200 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-125 transition-transform">
                <Zap size={48} className="text-emerald-600" />
              </div>
              <h4 className="text-emerald-800 font-black text-xs mb-1 flex items-center gap-1.5 uppercase tracking-wider leading-none">
                <Zap size={14} /> ¡Juegos Gratuitos Disponibles!
              </h4>
              <p className="text-emerald-700 font-bold text-xs leading-relaxed">
                Únete a las rondas gratuitas y recibe <strong className="text-emerald-950">2 cartones de cortesía</strong>. 
                Los premios ganados se pagan como <strong className="text-emerald-950">saldo para tu billetera</strong>, ideal para jugar futuras partidas de pago.
              </p>
            </div>

            {finalNote && (
              <div className="bg-slate-900 text-white p-5 rounded-sm text-center shadow-lg border border-slate-850">
                <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-[8px] mb-1.5 flex items-center justify-center gap-1.5">
                  <Info size={10} className="text-blue-400" /> Nota de la Administración
                </p>
                <p className="text-base font-bold leading-tight italic">"{finalNote}"</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 bg-slate-50 border-t border-slate-200 text-center relative">
          <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-[9px] mb-3">Siguiente Ronda Programada</p>
          <button 
            onClick={onClose}
            className="w-full py-3.5 bg-blue-600 text-white font-black rounded-sm hover:bg-blue-700 transition-all shadow-md active:scale-[0.98] uppercase tracking-widest text-xs border border-blue-700"
          >
            Aceptar y Continuar
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Helper function for conditional classes
function clsx(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}

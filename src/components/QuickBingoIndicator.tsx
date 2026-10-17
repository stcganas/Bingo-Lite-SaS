import React, { useState, useEffect } from 'react';
import { Zap, Ticket, ArrowRight, Radio } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { formatCurrency } from '../utils/format';

interface QuickBingoIndicatorProps {
  onBuyCard?: () => void;
}

export default function QuickBingoIndicator({ onBuyCard }: QuickBingoIndicatorProps) {
  const [activeGame, setActiveGame] = useState<any>(null);

  useEffect(() => {
    const checkActiveGame = async () => {
      try {
        const res = await apiFetch('/api/game');
        if (res.ok) {
          const game = await res.json();
          if (game && (game.status === 'playing' || game.status === 'paused')) {
            setActiveGame(game);
          } else {
            setActiveGame(null);
          }
        }
      } catch (e) {
        // ignored
      }
    };
    checkActiveGame();
    const interval = setInterval(checkActiveGame, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!activeGame) return null;

  return (
    <div className="bg-gradient-to-r from-red-600 via-rose-600 to-pink-600 rounded-3xl p-5 text-white shadow-xl border border-red-400/30 relative overflow-hidden animate-pulse">
      <div className="absolute top-0 right-0 -mr-6 -mt-6 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
      <div className="relative z-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
            <Radio size={20} className="text-yellow-300 animate-spin" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-[10px] font-black uppercase tracking-wider mb-1">
              <span className="w-2 h-2 rounded-full bg-yellow-300 animate-ping"></span>
              Juego en Curso
            </div>
            <h4 className="font-black text-base leading-tight uppercase">
              {activeGame.name || 'Bingo en Vivo'}
            </h4>
            <p className="text-xs text-rose-100 font-bold">
              Premio: {formatCurrency(activeGame.prize || 0)}
            </p>
          </div>
        </div>

        {onBuyCard && (
          <button
            onClick={onBuyCard}
            className="px-4 py-2.5 bg-yellow-400 hover:bg-yellow-300 text-yellow-950 rounded-2xl font-black text-xs uppercase tracking-wider shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 shrink-0"
          >
            <Ticket size={16} /> Entrar <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

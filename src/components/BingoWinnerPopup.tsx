import React, { useState, useEffect } from 'react';
import { Trophy, X, MapPin } from 'lucide-react';
import clsx from 'clsx';
import { formatCurrency } from '../utils/format';
import { getSafePatternGrid, getSafeCardGrid } from '../utils/bingo';

interface BingoWinnerPopupProps {
  winner?: {
    player_name: string;
    player_city?: string;
    card_number: string;
    pattern_name: string;
    prize: string;
    grid: any[][];
    marked_cells: { r: number; c: number }[];
    pattern_grid?: boolean[][];
  };
  winners?: {
    player_name: string;
    player_city?: string;
    card_number: string;
    grid: any[][];
    marked_cells: { r: number; c: number }[];
    pattern_grid?: boolean[][];
  }[];
  prize?: string;
  pattern_name?: string;
  pattern_grid?: boolean[][];
  patterns?: any[];
  onClose: () => void;
}

export default function BingoWinnerPopup({ winner, winners, prize, pattern_name, pattern_grid: pGridInput, patterns, onClose }: BingoWinnerPopupProps) {
  const [countdown, setCountdown] = useState(10);
  
  // Normalize winners to an array
  const allWinners = winners || (winner ? [winner] : []);
  const firstWinner = allWinners[0];
  const displayPatternName = pattern_name || winner?.pattern_name || '';
  const displayPrize = prize || winner?.prize || '';

  useEffect(() => {
    if (countdown <= 0) {
      onClose();
      return;
    }
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown, onClose]);

  if (allWinners.length === 0) return null;

  const pattern = patterns?.find(p => p.name === displayPatternName);
  const rawPatternGrid = pGridInput || firstWinner?.pattern_grid || pattern?.grid;
  const safePatternGrid = rawPatternGrid ? getSafePatternGrid(rawPatternGrid) : null;

  const isPatternCell = (r: number, c: number, winnerObj?: any) => {
    if (r === 2 && c === 2) return false;
    const wPatternGrid = winnerObj?.pattern_grid ? getSafePatternGrid(winnerObj.pattern_grid) : safePatternGrid;
    return wPatternGrid && wPatternGrid[r] && wPatternGrid[r][c];
  };

  const isMarked = (r: number, c: number, winnerObj: any) => {
    if (r === 2 && c === 2) return true; // FREE space
    if (isPatternCell(r, c, winnerObj)) return true;
    return winnerObj.marked_cells?.some((cell: any) => cell.r === r && cell.c === c);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className={clsx(
        "bg-gradient-to-br from-yellow-400 to-yellow-600 p-1 rounded-3xl shadow-2xl w-full flex flex-col relative transform scale-100 animate-in zoom-in-95 duration-500",
        allWinners.length > 1 ? "max-w-4xl" : "max-w-md"
      )}>
        <div className="bg-white rounded-[22px] p-6 sm:p-8 text-center flex-1 overflow-y-auto custom-scrollbar flex flex-col items-center relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 bg-slate-100 text-slate-500 p-2 rounded-full hover:bg-slate-200 hover:text-slate-800 transition z-10"
          >
            <X size={20} />
          </button>
          
          <div className="w-20 h-20 sm:w-24 sm:h-24 bg-yellow-100 text-yellow-500 rounded-full flex items-center justify-center mb-4 sm:mb-6 shadow-inner shrink-0">
            <Trophy size={40} className="animate-bounce sm:w-12 sm:h-12" />
          </div>
          
          <h2 className="text-3xl sm:text-4xl font-black text-slate-800 mb-2 uppercase tracking-tight">
            <span>¡BINGO!</span>
          </h2>
          
          <div className="bg-yellow-50 px-4 py-3 rounded-xl border border-yellow-200 mb-6 w-full shrink-0">
            <p className="text-yellow-800 font-bold text-base sm:text-lg mb-1 flex items-center justify-center gap-2">
              {pattern?.is_rematch && <span className="bg-orange-500 text-white text-[10px] uppercase px-2 py-0.5 rounded-full tracking-wider">Revancha</span>}
              <span>Figura: {displayPatternName}</span>
            </p>
            <p className="text-yellow-600 font-black text-xl sm:text-2xl">
              <span>Premio Total: {formatCurrency(displayPrize)}</span>
            </p>
            {allWinners.length > 1 && (
              <p className="text-emerald-600 font-extrabold text-sm mt-1 bg-emerald-50 py-1 px-3 rounded-lg border border-emerald-200">
                <span>✨ ¡Premio compartido 50/50 en partes iguales! ({allWinners.length} ganadores)</span>
              </p>
            )}
          </div>

          <div className={clsx(
            "grid gap-6 w-full mb-6",
            allWinners.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          )}>
            {allWinners.map((w, idx) => (
              <div key={`${w.card_number}-${idx}`} className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 flex flex-col items-center">
                <p className="text-lg font-bold text-blue-600 mb-1 truncate w-full px-2">
                  <span>{w.player_name}</span>
                </p>
                {w.player_city && (
                  <div className="flex items-center text-slate-500 text-xs font-medium mb-3">
                    <MapPin size={12} className="mr-1" />
                    <span>{w.player_city}</span>
                  </div>
                )}
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  <span>Cartón #{w.card_number}</span>
                </p>
                
                <div className="grid grid-cols-5 gap-1 w-full max-w-[150px]">
                  {getSafeCardGrid(w.grid).map((row, r) => (
                    <React.Fragment key={r}>
                      {row.map((cell, c) => (
                        <div 
                          key={`${r}-${c}`}
                          className={clsx(
                            "aspect-square flex items-center justify-center text-[9px] font-bold rounded-sm border transition-all",
                            isPatternCell(r, c, w)
                              ? "bg-yellow-400 text-slate-900 border-yellow-500 shadow-lg animate-pulse ring-2 ring-yellow-300 font-black scale-105 z-10"
                              : isMarked(r, c, w) 
                                ? "bg-blue-600 text-white border-blue-700 shadow-sm" 
                                : "bg-white text-slate-400 border-slate-200 opacity-50"
                          )}
                        >
                          <span>{cell === 'FREE' ? '★' : cell}</span>
                        </div>
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          <div className="w-full py-4 bg-slate-100 text-slate-700 font-bold rounded-xl mb-4 shrink-0">
            <p className="text-base sm:text-lg flex items-center justify-center gap-1">
              <span>El juego continuará en</span>
              <span className="text-blue-600 text-xl sm:text-2xl font-black">{countdown}</span>
              <span>s</span>
            </p>
          </div>

          <button 
            onClick={onClose}
            className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition shadow-lg shrink-0 cursor-pointer"
          >
            <span>Continuar Ahora</span>
          </button>
        </div>
      </div>
    </div>
  );
}

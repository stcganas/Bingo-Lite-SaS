import React from 'react';
import clsx from 'clsx';
import { Trophy, CheckCircle2, PlayCircle, DollarSign } from 'lucide-react';
import { formatCurrency } from '../utils/format';
import { getSafePatternGrid } from '../utils/bingo';

interface Pattern {
  game_pattern_id: number;
  pattern_id: number;
  name: string;
  grid: boolean[][];
  prize: string;
  winner_player_id: number | null;
  winner_name: string | null;
  winner_card_number: string | number | null;
  won_at: string | null;
  is_rematch?: boolean;
}

interface PatternRowProps {
  patterns: Pattern[];
  detectedPatternIds?: Set<number>;
}

export default function PatternRow({ patterns, detectedPatternIds = new Set() }: PatternRowProps) {
  if (!patterns || patterns.length === 0) return null;

  const hasAnyWon = patterns.some(p => p.winner_player_id);

  return (
    <div className="w-full overflow-x-auto pb-4 mb-6 scrollbar-hide">
      <div className="flex gap-4 min-w-max px-1 pt-1.5 pb-1.5">
        {patterns.map((pattern) => {
          const isWinner = !!pattern.winner_player_id;
          const isDetected = detectedPatternIds.has(pattern.game_pattern_id) && !isWinner;
          
          return (
            <div 
              key={pattern.game_pattern_id}
              className={clsx(
                "flex flex-col p-3 rounded-2xl border-2 transition-all duration-500 w-48 relative overflow-hidden",
                isWinner 
                  ? "bg-emerald-600 border-yellow-400 shadow-[0_0_25px_rgba(16,185,129,0.5)] scale-[1.05] ring-4 ring-yellow-400/40 z-10" 
                  : isDetected
                    ? "bg-amber-400 border-yellow-200 shadow-lg scale-105 z-10 animate-pulse"
                    : pattern.is_rematch 
                      ? "bg-orange-50 border-orange-200 shadow-md hover:border-orange-300" 
                      : "bg-white border-blue-100 shadow-md hover:border-blue-300"
              )}
            >
              {(isWinner || isDetected) && (
                <div className={clsx(
                  "absolute inset-0 pointer-events-none animate-pulse",
                  isWinner ? "bg-gradient-to-br from-yellow-300/10 via-emerald-400/20 to-transparent" : "bg-gradient-to-br from-yellow-200/20 via-amber-400/10 to-transparent"
                )} />
              )}
              
              {/* Top Badge */}
              <div className="flex items-center justify-between mb-2">
                <span className={clsx(
                  "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1",
                  isWinner 
                    ? "bg-yellow-400 text-yellow-950 shadow-[0_2px_10px_rgba(234,179,8,0.4)]" 
                    : isDetected
                      ? "bg-yellow-300 text-amber-900 shadow-[0_2px_10px_rgba(251,191,36,0.5)]"
                      : pattern.is_rematch ? "bg-orange-200 text-orange-800" : "bg-emerald-100 text-emerald-700"
                )}>
                  {isWinner ? (
                    <>
                      <Trophy size={10} className="text-yellow-950" />
                      <span>GANADO</span>
                    </>
                  ) : isDetected ? (
                    <>
                      <CheckCircle2 size={10} className="text-amber-950 animate-bounce" />
                      <span>¡DETECTADO!</span>
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                      <span>EN JUEGO</span>
                    </>
                  )}
                </span>
                {pattern.is_rematch && !isWinner && !isDetected ? (
                  <span className="bg-orange-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter">
                    Revancha
                  </span>
                ) : null}
                {(isWinner || isDetected) && (
                  <Trophy size={14} className={clsx(
                    "drop-shadow-[0_0_8px_rgba(234,179,8,0.8)] animate-bounce",
                    isWinner ? "text-yellow-300" : "text-yellow-100"
                  )} />
                )}
              </div>

              <div className="flex gap-3 items-center">
                {/* Mini Grid */}
                <div className={clsx(
                  "grid grid-cols-5 gap-0.5 w-12 h-12 p-0.5 rounded-md shrink-0 transition-colors shadow-inner",
                  isWinner ? "bg-emerald-700/50" : isDetected ? "bg-amber-600/50" : "bg-slate-100"
                )}>
                  {getSafePatternGrid(pattern.grid).map((row, r) => (
                    <React.Fragment key={r}>
                      {row.map((active, c) => (
                        <div 
                          key={`${r}-${c}`}
                          className={clsx(
                            "w-full h-full rounded-[1px] transition-colors",
                            active 
                              ? (isWinner ? "bg-yellow-300 shadow-[0_0_5px_rgba(234,179,8,0.8)]" : isDetected ? "bg-white" : "bg-blue-600") 
                              : (isWinner ? "bg-emerald-800/40" : isDetected ? "bg-amber-700/40" : "bg-white")
                          )}
                        />
                      ))}
                    </React.Fragment>
                  ))}
                </div>

                <div className="flex flex-col min-w-0">
                  <h4 className={clsx(
                    "text-xs font-black truncate uppercase tracking-tight",
                    (isWinner || isDetected) ? "text-white" : "text-slate-800"
                  )}>
                    <span>{pattern.name}</span>
                  </h4>
                  <div className={clsx(
                    "flex items-center gap-1",
                    (isWinner || isDetected) ? "text-emerald-100" : "text-slate-500"
                  )}>
                    <DollarSign size={10} className={isWinner ? "text-yellow-300" : isDetected ? "text-yellow-200" : "text-emerald-600"} />
                    <span className="text-[10px] font-black truncate">{formatCurrency(pattern.prize)}</span>
                  </div>
                </div>
              </div>

              {isWinner && (
                <div className="mt-2 pt-2 border-t border-white/20">
                  <p className="text-[8px] font-black text-yellow-300 uppercase tracking-widest mb-1 opacity-90">
                    <span>Ganador:</span>
                  </p>
                  <div className="flex items-center gap-2 bg-white/10 p-2 rounded-xl border border-white/10">
                    <div className="w-6 h-6 rounded-full bg-yellow-400 flex items-center justify-center shrink-0 shadow-lg">
                      <Trophy size={12} className="text-yellow-950" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black text-white truncate leading-tight uppercase tracking-tight">
                        <span>{pattern.winner_name || 'Desconocido'}</span>
                        {pattern.winner_card_number && (
                          <span className="ml-1.5 px-1.5 py-0.5 bg-yellow-400 text-yellow-950 text-[9px] rounded-md shadow-sm">
                            #{pattern.winner_card_number}
                          </span>
                        )}
                      </p>
                      {pattern.won_at && (
                        <p className="text-[7px] text-white/60 font-medium">
                          <span>{new Date(pattern.won_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {isDetected && (
                <div className="mt-2 pt-2 border-t border-white/20">
                  <p className="text-[8px] font-black text-yellow-200 uppercase tracking-widest leading-tight">
                    <span>¡PATRÓN COMPLETADO!</span>
                    <span className="text-[7px] text-white opacity-90 block mt-0.5">PRESIONA CANTAR BINGO</span>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

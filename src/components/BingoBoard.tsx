import React from 'react';
import clsx from 'clsx';

interface BingoBoardProps {
  drawnBalls: number[];
  compact?: boolean;
}

export default function BingoBoard({ drawnBalls, compact = false }: BingoBoardProps) {
  const columns = [
    { label: 'B', color: 'bg-blue-600', range: [1, 15] },
    { label: 'I', color: 'bg-red-500', range: [16, 30] },
    { label: 'N', color: 'bg-yellow-500', range: [31, 45] },
    { label: 'G', color: 'bg-green-500', range: [46, 60] },
    { label: 'O', color: 'bg-purple-600', range: [61, 75] },
  ];

  return (
    <div className="w-full overflow-x-auto pb-2 scrollbar-hide">
      <div className="min-w-[320px] bg-white rounded-3xl p-4 md:p-6 border-4 border-slate-100 shadow-xl">
        <div className="grid grid-cols-5 gap-2 md:gap-4">
          {columns.map((col) => (
            <div key={col.label} className="flex flex-col gap-2">
              <div className={clsx(
                "aspect-square flex items-center justify-center text-white rounded-2xl font-black text-xl md:text-3xl shadow-lg mb-2 transform -rotate-3",
                col.color
              )}>
                {col.label}
              </div>
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: 15 }, (_, i) => col.range[0] + i).map((num) => {
                  const isDrawn = drawnBalls.includes(num);
                  return (
                    <div
                      key={num}
                      className={clsx(
                        "aspect-square flex items-center justify-center rounded-full font-black transition-all border-2",
                        compact ? "text-[10px] w-7 h-7" : "text-xs md:text-base w-9 h-9 md:w-12 md:h-12",
                        isDrawn
                          ? "bg-slate-800 text-white border-slate-900 shadow-md scale-110 z-10 ring-4 ring-blue-500/20"
                          : "bg-slate-50 text-slate-300 border-slate-100"
                      )}
                    >
                      {num}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

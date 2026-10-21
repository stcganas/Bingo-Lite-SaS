import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

export default function EditGameModal({ isOpen, onClose, game, onUpdate }: { isOpen: boolean, onClose: () => void, game: any, onUpdate: (data: any) => void }) {
  const [data, setData] = React.useState<any>(game || {});

  React.useEffect(() => {
    if (game) {
      // Formatear start_time para input datetime-local (YYYY-MM-DDTHH:mm)
      let formattedDate = '';
      if (game.start_time) {
        try {
          const d = new Date(game.start_time);
          if (!isNaN(d.getTime())) {
            const pad = (n: number) => n.toString().padStart(2, '0');
            formattedDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          }
        } catch {}
      }
      setData({
        ...game,
        start_time: formattedDate || game.start_time || '',
        type: game.type || (game.is_free ? 'free' : 'paid'),
        prize_type: game.prize_type || 'wallet'
      });
    } else {
      setData({});
    }
  }, [game]);

  if (!isOpen || !game) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!data.name?.trim()) return;
    
    // Normalizar start_time a formato ISO completo
    let isoStartTime = data.start_time;
    if (data.start_time) {
      try {
        isoStartTime = new Date(data.start_time).toISOString();
      } catch {}
    }

    onUpdate({
      ...data,
      name: data.name.trim(),
      start_time: isoStartTime,
      card_value: data.type === 'free' ? 0 : data.card_value,
      prize: data.prize
    });
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
      >
        <div className="bg-white rounded-3xl p-6 shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b pb-3 mb-4">
            <h3 className="text-lg font-black text-slate-800">Editar Juego: {game?.name || `#${game.id}`}</h3>
            <span className="text-xs px-2.5 py-1 bg-blue-100 text-blue-700 font-bold rounded-lg uppercase">
              ID: {game.id}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase mb-1">Nombre del Juego</label>
              <input 
                required
                type="text" 
                value={data?.name || ''} 
                onChange={e => setData({...data, name: e.target.value})} 
                className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 font-bold text-slate-800 outline-none" 
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase mb-1">Fecha y Hora</label>
                <input 
                  type="datetime-local" 
                  value={data?.start_time || ''} 
                  onChange={e => setData({...data, start_time: e.target.value})} 
                  className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 font-bold text-slate-800 outline-none text-xs" 
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase mb-1">Tipo de Juego</label>
                <select 
                  value={data?.type || 'paid'} 
                  onChange={e => setData({...data, type: e.target.value, card_value: e.target.value === 'free' ? '0' : data.card_value})} 
                  className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 font-bold text-slate-800 outline-none"
                >
                  <option value="paid">Juego de Pago</option>
                  <option value="free">Juego Gratis</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data?.type !== 'free' && (
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">Valor Cartón (COP)</label>
                  <input 
                    required={data?.type !== 'free'}
                    type="text" 
                    value={data?.card_value || ''} 
                    onChange={e => setData({...data, card_value: e.target.value})} 
                    className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 font-bold text-slate-800 outline-none" 
                    placeholder="Ej: 5000"
                  />
                </div>
              )}

              <div className={data?.type === 'free' ? 'sm:col-span-2' : ''}>
                <label className="block text-xs font-black text-slate-700 uppercase mb-1">Premios a repartir (COP)</label>
                <input 
                  required
                  type="text" 
                  value={data?.prize || ''} 
                  onChange={e => setData({...data, prize: e.target.value})} 
                  className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 font-bold text-slate-800 outline-none" 
                  placeholder="Ej: 100000"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 uppercase mb-1">Tipo de Premio</label>
              <select 
                value={data?.prize_type || 'wallet'} 
                onChange={e => setData({...data, prize_type: e.target.value})} 
                className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 font-bold text-slate-800 outline-none"
              >
                <option value="wallet">Saldo para Billetera</option>
                <option value="cash">Premio en Efectivo</option>
              </select>
            </div>

            <div className="flex gap-3 pt-4 border-t border-slate-100">
              <button 
                type="button" 
                onClick={onClose} 
                className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-slate-700 transition"
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition"
              >
                Guardar Cambios
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

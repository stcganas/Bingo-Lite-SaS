import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

export default function EditGameModal({ isOpen, onClose, game, onUpdate }: { isOpen: boolean, onClose: () => void, game: any, onUpdate: (data: any) => void }) {
  const [data, setData] = React.useState(game || {});

  React.useEffect(() => {
    setData(game || {});
  }, [game]);

  if (!isOpen || !game) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
      >
        <div className="bg-white rounded-3xl p-6 shadow-2xl w-full max-w-md">
          <h3 className="text-lg font-black text-slate-800 mb-4">Editar Juego: {game?.name || ''}</h3>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (data) onUpdate(data);
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700">Nombre</label>
              <input type="text" value={data?.name || ''} onChange={e => setData({...data, name: e.target.value})} className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700">Valor Cartón</label>
              <input type="text" value={data?.card_value || ''} onChange={e => setData({...data, card_value: e.target.value})} className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700">Premio</label>
              <input type="text" value={data?.prize || ''} onChange={e => setData({...data, prize: e.target.value})} className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
            </div>
            <div className="flex gap-2 mt-6">
              <button type="button" onClick={onClose} className="flex-1 px-4 py-3 bg-slate-100 rounded-xl font-bold text-slate-700">Cancelar</button>
              <button type="submit" className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold">Guardar</button>
            </div>
          </form>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

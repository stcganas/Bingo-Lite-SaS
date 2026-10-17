import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/api';

export default function GameWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [game, setGame] = useState({ name: '', price: 10000, prize: 500000, start_time: '' });

  const handleSave = async () => {
    try {
      const res = await apiFetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...game,
          status: 'scheduled',
          drawn_balls: [],
        }),
      });
      if (res.ok) {
        toast.success('Juego creado');
        onClose();
      } else {
        toast.error('Error al crear juego');
      }
    } catch (err) {
      toast.error('Error al crear juego');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6">Asistente de Juego (Paso {step}/2)</h2>
        
        {step === 1 && (
          <div className="space-y-4">
            <input type="text" placeholder="Nombre del Juego" className="w-full p-3 border rounded-xl" value={game.name} onChange={e => setGame({...game, name: e.target.value})} />
            <input type="datetime-local" className="w-full p-3 border rounded-xl" value={game.start_time} onChange={e => setGame({...game, start_time: e.target.value})} />
            <button onClick={() => setStep(2)} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2">
              Siguiente <ArrowRight size={20} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <input type="number" placeholder="Precio Cartón" className="w-full p-3 border rounded-xl" value={game.price} onChange={e => setGame({...game, price: Number(e.target.value)})} />
            <input type="number" placeholder="Premio" className="w-full p-3 border rounded-xl" value={game.prize} onChange={e => setGame({...game, prize: Number(e.target.value)})} />
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="flex-1 py-3 bg-slate-200 font-bold rounded-xl flex items-center justify-center gap-2">
                <ArrowLeft size={20} /> Atrás
              </button>
              <button onClick={handleSave} className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl flex items-center justify-center gap-2">
                <Save size={20} /> Guardar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

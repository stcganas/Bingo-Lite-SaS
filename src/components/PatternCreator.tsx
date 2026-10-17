import React, { useState } from 'react';
import { Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/api';

export default function PatternCreator({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [grid, setGrid] = useState<boolean[][]>(Array(5).fill(Array(5).fill(false)));

  const toggleCell = (r: number, c: number) => {
    const newGrid = grid.map((row, rowIndex) =>
      row.map((cell, colIndex) => (rowIndex === r && colIndex === c ? !cell : cell))
    );
    setGrid(newGrid);
  };

  const handleSave = async () => {
    if (!name) {
      toast.error('Nombre requerido');
      return;
    }
    try {
      const res = await apiFetch('/api/patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, grid }),
      });
      if (res.ok) {
        toast.success('Patrón guardado');
        onClose();
      } else {
        toast.error('Error al guardar patrón');
      }
    } catch (err) {
      toast.error('Error al guardar patrón');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-6 rounded-3xl shadow-xl w-full max-w-sm">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Crear Patrón</h2>
          <button onClick={onClose}><X /></button>
        </div>
        <input 
          type="text" 
          placeholder="Nombre del patrón" 
          className="w-full p-3 border rounded-xl mb-4"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <div className="grid grid-cols-5 gap-1 mb-6">
          {grid.map((row, r) => row.map((active, c) => (
            <div 
              key={`${r}-${c}`}
              onClick={() => toggleCell(r, c)}
              className={`w-full aspect-square rounded cursor-pointer ${active ? 'bg-blue-600' : 'bg-slate-200'}`}
            />
          )))}
        </div>
        <button onClick={handleSave} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl">Guardar</button>
      </div>
    </div>
  );
}

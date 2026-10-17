import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import { Users, Plus, Edit2, Trash2, X, Save, Search } from 'lucide-react';
import toast from 'react-hot-toast';

export interface Seller {
  id: string;
  name: string;
  phone: string;
  email: string;
  code: string;
  commission_percentage: number;
}

export default function AdminSellers() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    commission_percentage: 10
  });

  const fetchSellers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/sellers');
      const data = await res.json();
      if (data.success) {
        setSellers(data.sellers || []);
      }
    } catch (err) {
      toast.error("Error cargando revendedores");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSellers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editId) {
        const res = await apiFetch(`/api/admin/sellers/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Revendedor actualizado");
          setSellers(sellers.map(s => s.id === editId ? data.seller : s));
          setShowForm(false);
          setEditId(null);
          setFormData({ name: '', phone: '', email: '', commission_percentage: 10 });
        } else {
          toast.error(data.error);
        }
      } else {
        const res = await apiFetch('/api/admin/sellers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Revendedor creado");
          setSellers([data.seller, ...sellers]);
          setShowForm(false);
          setFormData({ name: '', phone: '', email: '', commission_percentage: 10 });
        } else {
          toast.error(data.error);
        }
      }
    } catch (err) {
      toast.error("Error al guardar revendedor");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este revendedor?')) return;
    try {
      const res = await apiFetch(`/api/admin/sellers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setSellers(sellers.filter(s => s.id !== id));
        toast.success("Revendedor eliminado");
      } else {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error("Error al eliminar");
    }
  };

  const openEdit = (seller: Seller) => {
    setEditId(seller.id);
    setFormData({
      name: seller.name,
      phone: seller.phone,
      email: seller.email || '',
      commission_percentage: seller.commission_percentage
    });
    setShowForm(true);
  };

  return (
    <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6 border-b pb-4">
        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
          <Users size={24} className="text-emerald-500" /> Revendedores
        </h2>
        <button 
          onClick={() => {
            setEditId(null);
            setFormData({ name: '', phone: '', email: '', commission_percentage: 10 });
            setShowForm(true);
          }}
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition"
        >
          <Plus size={18} /> Nuevo Revendedor
        </button>
      </div>

      {showForm && (
        <div className="mb-8 bg-slate-50 p-6 rounded-2xl border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-black text-lg">{editId ? 'Editar Revendedor' : 'Crear Revendedor'}</h3>
            <button onClick={() => setShowForm(false)} className="p-1 hover:bg-slate-200 rounded-lg">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre</label>
              <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">WhatsApp (Usuario)</label>
              <input required type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Correo Electrónico</label>
              <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Comisión (%)</label>
              <input required type="number" min="0" max="100" value={formData.commission_percentage} onChange={e => setFormData({...formData, commission_percentage: Number(e.target.value)})} className="w-full p-2 border rounded-lg" />
            </div>
            <div className="md:col-span-2 mt-2">
              <button type="submit" className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700">
                <Save size={18} /> {editId ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10">Cargando...</div>
      ) : sellers.length === 0 ? (
        <div className="text-center py-10 text-slate-500">No hay revendedores registrados</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-600 text-xs uppercase tracking-wider">
                <th className="p-3 rounded-tl-xl">Nombre</th>
                <th className="p-3">WhatsApp</th>
                <th className="p-3">Correo</th>
                <th className="p-3">Código</th>
                <th className="p-3">Comisión</th>
                <th className="p-3 text-right rounded-tr-xl">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sellers.map((s, i) => (
                <tr key={s.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className="p-3 font-bold text-slate-800">{s.name}</td>
                  <td className="p-3">{s.phone}</td>
                  <td className="p-3">{s.email}</td>
                  <td className="p-3 font-mono text-blue-600 font-bold">{s.code}</td>
                  <td className="p-3 font-black text-emerald-600">{s.commission_percentage}%</td>
                  <td className="p-3 flex justify-end gap-2">
                    <button onClick={() => openEdit(s)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(s.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

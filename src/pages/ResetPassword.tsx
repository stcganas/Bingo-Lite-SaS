import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { success: resSuccess, error: resError } = await updatePassword(password);
      if (resSuccess) {
        setSuccess(true);
        toast.success('Contraseña actualizada correctamente');
        setTimeout(() => navigate('/admin/login'), 3000);
      } else {
        setError(resError || 'Error al actualizar la contraseña');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border-4 border-slate-800"
        >
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={48} />
          </div>
          <h1 className="text-2xl font-black text-slate-800 mb-4 uppercase">¡Contraseña Actualizada!</h1>
          <p className="text-slate-600 mb-8 font-bold">
            Tu contraseña ha sido restablecida con éxito. Serás redirigido al login en unos segundos...
          </p>
          <Link 
            to="/admin/login" 
            className="block w-full py-4 bg-slate-800 hover:bg-slate-900 text-white font-black text-xl rounded-2xl shadow-lg transition"
          >
            IR AL LOGIN
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border-4 border-slate-800">
        <div className="bg-slate-800 p-6 text-white text-center">
          <Lock size={48} className="mx-auto mb-4 text-yellow-400" />
          <h1 className="text-2xl font-black tracking-tight uppercase">Nueva Contraseña</h1>
          <p className="text-slate-400 text-sm font-bold mt-2">Ingresa tu nueva contraseña</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {error && (
            <div className="bg-red-100 text-red-700 p-3 rounded-xl text-sm font-bold text-center">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Nueva Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input 
                required 
                type="password" 
                minLength={6}
                className="w-full p-3 pl-10 border-2 border-slate-200 rounded-xl focus:border-slate-800 focus:ring-0 outline-none transition font-bold"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Confirmar Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input 
                required 
                type="password" 
                className="w-full p-3 pl-10 border-2 border-slate-200 rounded-xl focus:border-slate-800 focus:ring-0 outline-none transition font-bold"
                placeholder="Repite la contraseña"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white font-black text-xl rounded-2xl shadow-lg transform transition active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {loading ? <Loader2 className="animate-spin" /> : "ACTUALIZAR CONTRASEÑA"}
          </button>
        </form>
      </div>
    </div>
  );
}

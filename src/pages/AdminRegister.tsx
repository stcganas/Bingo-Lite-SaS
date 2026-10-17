import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, Loader2, Mail, ShieldCheck, Home as HomeIcon } from 'lucide-react';
import { useAuth } from '../AuthContext';

export default function AdminRegister() {
  const navigate = useNavigate();
  const { registerAdmin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { success: regSuccess, error: regError } = await registerAdmin(email, password);
      if (regSuccess) {
        setSuccess(true);
      } else {
        setError(regError || 'Error al registrarse');
      }
    } catch (err) {
      setError('Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100 relative">
        <Link 
          to="/" 
          className="absolute top-6 left-6 flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold transition bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200"
        >
          <HomeIcon size={20} />
          <span>Inicio</span>
        </Link>
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border-4 border-slate-800 p-8 text-center">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldCheck size={48} />
          </div>
          <h1 className="text-2xl font-black text-slate-800 mb-4 uppercase">¡Registro Exitoso!</h1>
          <p className="text-slate-600 mb-8">
            Hemos enviado un enlace de verificación a <strong>{email}</strong>. 
            Por favor, revisa tu correo y haz clic en el enlace para activar tu cuenta de administrador.
          </p>
          <Link 
            to="/admin/login" 
            className="block w-full py-4 bg-slate-800 hover:bg-slate-900 text-white font-black text-xl rounded-2xl shadow-lg transition"
          >
            VOLVER AL LOGIN
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100 relative">
      <Link 
        to="/" 
        className="absolute top-6 left-6 flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold transition bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200"
      >
        <HomeIcon size={20} />
        <span>Inicio</span>
      </Link>
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border-4 border-slate-800">
        <div className="bg-slate-800 p-6 text-white text-center">
          <UserPlus size={48} className="mx-auto mb-4 text-blue-400" />
          <h1 className="text-2xl font-black tracking-tight uppercase">Registro Administrador</h1>
        </div>

        <form onSubmit={handleRegister} className="p-8 space-y-6">
          {error && (
            <div className="bg-red-100 text-red-700 p-3 rounded-xl text-sm font-bold text-center">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Correo Electrónico</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input 
                required 
                type="email" 
                className="w-full p-3 pl-10 border-2 border-slate-200 rounded-xl focus:border-slate-800 focus:ring-0 outline-none transition"
                placeholder="admin@ejemplo.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Contraseña</label>
            <input 
              required 
              type="password" 
              className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-slate-800 focus:ring-0 outline-none transition"
              placeholder="Mínimo 6 caracteres"
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Confirmar Contraseña</label>
            <input 
              required 
              type="password" 
              className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-slate-800 focus:ring-0 outline-none transition"
              placeholder="Repite tu contraseña"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white font-black text-xl rounded-2xl shadow-lg transform transition active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70 disabled:active:scale-100"
          >
            {loading ? <Loader2 className="animate-spin" /> : "REGISTRARSE"}
          </button>

          <div className="text-center space-y-4">
            <p className="text-slate-500 text-sm">
              ¿Ya tienes cuenta?{' '}
              <Link to="/admin/login" className="text-slate-800 font-bold hover:underline">
                Inicia sesión aquí
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

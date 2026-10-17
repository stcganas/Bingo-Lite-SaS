import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Loader2, Mail, Home as HomeIcon } from 'lucide-react';
import { useAuth } from '../AuthContext';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { loginAdmin, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (user && user.role === 'admin') {
      navigate('/admin');
    } else if (user && user.role === 'seller') {
      navigate('/seller');
    }
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { success, error: loginError } = await loginAdmin(email, password);
      if (success) {
        // Redirection will be handled by useEffect when user state updates
      } else {
        const lowerErr = (loginError || '').toLowerCase();
        if ((email.toLowerCase() === 'comamosexpress@gmail.com' || email.toLowerCase() === 'stcganas@gmail.com') && (lowerErr.includes('invalid login credentials') || lowerErr.includes('not found') || lowerErr.includes('invalid_credentials'))) {
          setError('Credenciales no encontradas. Si es tu primera vez, por favor REGÍSTRATE con este correo para activar tus permisos de Super Admin.');
        } else if (lowerErr.includes('invalid login credentials') || lowerErr.includes('invalid_credentials') || lowerErr.includes('email not confirmed')) {
          setError('Correo o contraseña incorrectos. Por favor verifica tus datos.');
        } else if (lowerErr.includes('rate limit') || lowerErr.includes('too many requests')) {
          setError('Demasiados intentos fallidos. Por favor espera unos minutos antes de intentar de nuevo.');
        } else if (lowerErr.includes('invalid api key') || lowerErr.includes('api key')) {
          setError('Error de conexión temporal con el servidor de autenticación. Por favor reintenta.');
        } else {
          setError(loginError || 'Correo o contraseña incorrectos.');
        }
      }
    } catch (err) {
      setError('Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

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
          <Lock size={48} className="mx-auto mb-4 text-yellow-400" />
          <h1 className="text-2xl font-black tracking-tight uppercase">Acceso Administrador</h1>
        </div>

        <form onSubmit={handleLogin} className="p-8 space-y-6">
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
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-bold text-slate-700">Contraseña</label>
              <Link to="/admin/forgot-password" className="text-xs font-bold text-blue-600 hover:underline">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <input 
              required 
              type="password" 
              className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-slate-800 focus:ring-0 outline-none transition"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white font-black text-xl rounded-2xl shadow-lg transform transition active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70 disabled:active:scale-100"
          >
            {loading ? <Loader2 className="animate-spin" /> : "INICIAR SESIÓN"}
          </button>

          <div className="text-center space-y-4">
            <p className="text-slate-500 text-sm">
              ¿No tienes cuenta?{' '}
              <Link to="/admin/register" className="text-slate-800 font-bold hover:underline">
                Regístrate aquí
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

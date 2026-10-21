import React, { useState } from 'react';
import { useNavigate, Link, useParams, useSearchParams } from 'react-router-dom';
import { Lock, Loader2, Mail, Home as HomeIcon, ShieldAlert } from 'lucide-react';
import { useAuth } from '../AuthContext';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams] = useSearchParams();
  const { loginAdmin, loginTenantAdmin, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    searchParams.get('error') === 'unauthorized_room' 
      ? 'Tus credenciales de administrador no pertenecen a esta sala.' 
      : ''
  );

  React.useEffect(() => {
    if (user && user.role === 'admin') {
      if (slug) {
        // Si el usuario es de esta sala o es Super Admin, ir al admin de la sala
        if (user.isSuperAdmin || (user.tenant_id || '').toLowerCase() === slug.toLowerCase()) {
          navigate(`/sala/${slug}/admin`);
        }
      } else {
        if (user.isSuperAdmin) {
          navigate('/superadmin');
        } else if (user.tenant_id) {
          navigate(`/sala/${user.tenant_id}/admin`);
        }
      }
    } else if (user && user.role === 'seller') {
      navigate('/seller');
    }
  }, [user, navigate, slug]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // 1. Intentar autenticar contra el backend de salas/tenants
      const tenantRes = await loginTenantAdmin(email, password, slug);
      if (tenantRes.success && tenantRes.user) {
        if (slug) {
          navigate(`/sala/${slug}/admin`);
        } else if (tenantRes.user.isSuperAdmin) {
          navigate('/superadmin');
        } else if (tenantRes.user.tenant_id && tenantRes.user.tenant_id !== 'global') {
          navigate(`/sala/${tenantRes.user.tenant_id}/admin`);
        } else {
          navigate('/admin');
        }
        return;
      }

      // 2. Si no especificó sala y el correo es de Super Admin, intentar loginAdmin con Supabase
      if (!slug) {
        const cleanEmail = email.trim().toLowerCase();
        if (cleanEmail === 'comamosexpress@gmail.com' || cleanEmail === 'stcganas@gmail.com') {
          const { success: legacySuccess, error: legacyError } = await loginAdmin(email, password);
          if (legacySuccess) {
            navigate('/superadmin');
            return;
          }
          setError(legacyError || 'Contraseña de Super Administrador incorrecta.');
          return;
        }
      }

      // Si hubo error específico de tenant, mostrarlo
      const loginError = tenantRes.error || 'Credenciales de administrador incorrectas.';
      const lowerErr = loginError.toLowerCase();
      if (lowerErr.includes('otra sala') || lowerErr.includes('no pertenece')) {
        setError('Acceso denegado: Este usuario de administrador pertenece a otra sala y no tiene permiso aquí.');
      } else if (lowerErr.includes('invalid login credentials') || lowerErr.includes('invalid_credentials') || lowerErr.includes('contraseña')) {
        setError('Correo o contraseña de administrador incorrectos.');
      } else {
        setError(loginError);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al iniciar sesión como administrador.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900 text-slate-100 relative">
      <Link 
        to={slug ? `/sala/${slug}` : "/"} 
        className="absolute top-6 left-6 flex items-center gap-2 text-slate-300 hover:text-white font-bold transition bg-slate-800 px-4 py-2 rounded-xl shadow-sm border border-slate-700"
      >
        <HomeIcon size={20} />
        <span>{slug ? `Volver a Sala` : `Inicio`}</span>
      </Link>

      <div className="max-w-md w-full bg-slate-950 rounded-3xl shadow-2xl overflow-hidden border border-slate-800">
        <div className="bg-slate-900 p-6 text-white text-center border-b border-slate-800">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-3">
            <Lock size={32} />
          </div>
          <h1 className="text-xl font-black tracking-tight uppercase">
            {slug ? `Admin de Sala: ${slug}` : 'Acceso Administrador'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {slug 
              ? 'Panel de control exclusivo e independiente para esta sala' 
              : 'Gestión y control de salas de bingo'}
          </p>
        </div>

        <form onSubmit={handleLogin} className="p-8 space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3.5 rounded-xl text-xs font-bold flex items-center gap-2.5">
              <ShieldAlert size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              Correo Electrónico del Administrador
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input 
                required 
                type="email" 
                className="w-full bg-slate-900 p-3 pl-10 border border-slate-800 rounded-xl text-white text-sm focus:border-amber-500 focus:ring-0 outline-none transition"
                placeholder="admin@ejemplo.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Contraseña
              </label>
              {!slug && (
                <Link to="/admin/forgot-password" className="text-xs font-bold text-amber-400 hover:underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              )}
            </div>
            <input 
              required 
              type="password" 
              className="w-full bg-slate-900 p-3 border border-slate-800 rounded-xl text-white text-sm focus:border-amber-500 focus:ring-0 outline-none transition"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-base rounded-2xl shadow-lg shadow-amber-500/20 transform transition active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin text-slate-950" /> : "INICIAR SESIÓN ADMIN"}
          </button>

          {!slug && (
            <div className="text-center space-y-2 pt-2 border-t border-slate-900">
              <p className="text-slate-400 text-xs">
                ¿Aún no tienes sala propia?{' '}
                <Link to="/" className="text-amber-400 font-bold hover:underline">
                  Crear una nueva sala
                </Link>
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

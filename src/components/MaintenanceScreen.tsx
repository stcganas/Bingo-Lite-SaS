import React, { useState } from 'react';
import { Wrench, ShieldAlert, RefreshCw, Lock, UserCheck, Shield } from 'lucide-react';
import { useAuth } from '../AuthContext';
import toast from 'react-hot-toast';
import { useNavigate, useLocation } from 'react-router-dom';

interface MaintenanceScreenProps {
  message?: string;
  onRetry?: () => void;
}

export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({ message, onRetry }) => {
  const { loginPlayer } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPlayerLogin, setShowPlayerLogin] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Detectar el slug de la sala actual para redirigir al admin correcto
  const roomMatch = location.pathname.match(/\/sala\/([a-zA-Z0-9_-]+)/i);
  const currentRoomSlug = roomMatch ? roomMatch[1].toLowerCase() : null;
  const adminLoginPath = currentRoomSlug ? `/sala/${currentRoomSlug}/admin/login` : '/admin/login';

  const handleAuthorizedPlayerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await loginPlayer('3145261451', password);
      toast.success('¡Acceso autorizado concedido!');
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Contraseña incorrecta o error de acceso');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white/10 backdrop-blur-2xl border border-white/20 p-8 sm:p-12 rounded-3xl shadow-2xl max-w-lg w-full text-center text-white space-y-6 my-auto">
        <div className="w-24 h-24 bg-amber-500/20 border-2 border-amber-400/50 rounded-full flex items-center justify-center mx-auto shadow-lg animate-pulse">
          <Wrench className="w-12 h-12 text-amber-400 animate-bounce" />
        </div>

        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 bg-amber-500/20 border border-amber-500/30 px-4 py-1.5 rounded-full text-amber-300 text-xs font-black uppercase tracking-wider">
            <ShieldAlert size={14} /> Sala en Actualización
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            Sala en Mantenimiento
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed font-medium">
            {message || 'Esta sala de bingo se encuentra en mantenimiento y actualizaciones. Vuelve pronto.'}
          </p>
        </div>

        {/* Access controls for Admin & Authorized Player */}
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => navigate(adminLoginPath)}

              className="py-3 px-4 bg-slate-800/80 hover:bg-slate-700 border border-slate-600/50 hover:border-amber-400/50 text-slate-200 hover:text-white font-bold rounded-2xl shadow-md transition flex items-center justify-center gap-2 text-xs cursor-pointer"
            >
              <Shield size={16} className="text-amber-400" /> Acceso Administrador
            </button>
            <button
              onClick={() => setShowPlayerLogin(!showPlayerLogin)}
              className="py-3 px-4 bg-slate-800/80 hover:bg-slate-700 border border-slate-600/50 hover:border-amber-400/50 text-slate-200 hover:text-white font-bold rounded-2xl shadow-md transition flex items-center justify-center gap-2 text-xs cursor-pointer"
            >
              <UserCheck size={16} className="text-emerald-400" /> Jugador de Pruebas
            </button>
          </div>

          {showPlayerLogin && (
            <form onSubmit={handleAuthorizedPlayerLogin} className="bg-black/40 border border-emerald-500/30 p-4 rounded-2xl space-y-3 text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <UserCheck size={14} /> Jugador Autorizado: <span className="font-mono">••••••1451</span>
                </span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">Autorizado</span>
              </div>
              <div>
                <input
                  type="password"
                  placeholder="Contraseña de acceso"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs shadow transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Lock size={14} /> {loading ? 'Ingresando...' : 'Iniciar Sesión (3145261451)'}
              </button>
            </form>
          )}
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3.5 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black rounded-2xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer border border-blue-400/30 text-xs sm:text-sm"
          >
            <RefreshCw size={16} className="animate-spin-slow" /> Verificar Actualización
          </button>
        </div>

        <p className="text-xs text-slate-400 font-medium pt-1">
          Gracias por tu paciencia y apoyo constante. 🚀
        </p>
      </div>
    </div>
  );
};

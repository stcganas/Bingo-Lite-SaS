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
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900 text-slate-100 relative">
      <Link 
        to="/" 
        className="absolute top-6 left-6 flex items-center gap-2 text-slate-300 hover:text-white font-bold transition bg-slate-800 px-4 py-2 rounded-xl shadow-sm border border-slate-700"
      >
        <HomeIcon size={20} />
        <span>Inicio</span>
      </Link>
      <div className="max-w-md w-full bg-slate-950 rounded-3xl shadow-2xl overflow-hidden border border-slate-800 p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-4">
          <ShieldCheck size={36} />
        </div>
        <h1 className="text-xl font-black text-white mb-2 uppercase">Registro Administrativo</h1>
        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
          Por motivos de seguridad y aislamiento multi-tenant, cada organizador configura su administrador propio al crear su sala de bingo.
        </p>
        <div className="space-y-3">
          <Link 
            to="/" 
            className="block w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-sm rounded-xl shadow-lg transition"
          >
            CREAR MI SALA DE BINGO
          </Link>
          <Link 
            to="/admin/login" 
            className="block w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm rounded-xl transition"
          >
            VOLVER AL LOGIN
          </Link>
        </div>
      </div>
    </div>
  );
}

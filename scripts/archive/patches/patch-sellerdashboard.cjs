const fs = require('fs');
let code = fs.readFileSync('src/pages/SellerDashboard.tsx', 'utf8');

code = code.replace(/import \{ useNavigate \} from 'react-router-dom';/, `import { useNavigate } from 'react-router-dom';\nimport { useAuth } from '../AuthContext';\nimport { supabase } from '../lib/supabase';`);

code = code.replace(/const \[seller, setSeller\] = useState<any>\(null\);\n  const \[stats, setStats\] = useState<any>\(\{ players: \[\], totalCommissions: 0 \}\);\n  const \[loading, setLoading\] = useState\(true\);\n  const navigate = useNavigate\(\);/, `const { user } = useAuth();
  const [seller, setSeller] = useState<any>(null);
  const [stats, setStats] = useState<any>({ players: [], totalCommissions: 0 });
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const navigate = useNavigate();`);

code = code.replace(/useEffect\(\(\) => \{[\s\S]*?\}, \[navigate\]\);/, `useEffect(() => {
    if (user && user.role === 'seller') {
      fetchSellerData(user.uid);
    } else {
      navigate('/admin/login');
    }
  }, [user, navigate]);

  const fetchSellerData = async (uid: string) => {
    try {
      const { data, error } = await supabase.from('sellers').select('*').eq('id', uid).single();
      if (error) throw error;
      setSeller(data);
      setNewEmail(data.email || '');
      fetchStats(data.code);
    } catch (err) {
      toast.error('Error cargando datos del vendedor');
      setLoading(false);
    }
  };`);

code = code.replace(/const fetchStats = async \(code: string\) => \{/, `const fetchStats = async (code: string) => {`);

code = code.replace(/if \(data\.seller\) \{[\s\S]*?setSeller\(data\.seller\);\n          localStorage\.setItem\('seller_session', JSON\.stringify\(data\.seller\)\);\n        \}/, `if (data.seller) {
          setSeller(data.seller);
        }`);

code = code.replace(/const logout = \(\) => \{[\s\S]*?navigate\('\/seller\/login'\);\n  \};/, `const logout = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  const handleUpdateCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      const res = await apiFetch('/api/sellers/update-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Credenciales actualizadas correctamente");
        setShowSettings(false);
        setNewPassword('');
        setSeller({ ...seller, email: newEmail });
      } else {
        toast.error(data.error || "Error al actualizar");
      }
    } catch (err) {
      toast.error("Error al actualizar credenciales");
    } finally {
      setIsUpdating(false);
    }
  };`);

code = code.replace(/<button onClick=\{logout\} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-red-400 transition">\s*<LogOut size=\{20\} \/>\s*<\/button>/, `<div className="flex items-center gap-2">
            <button onClick={() => setShowSettings(true)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-bold transition">Ajustes</button>
            <button onClick={logout} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-red-400 transition">
              <LogOut size={20} />
            </button>
          </div>`);

code = code.replace(/<\/main>\n    <\/div>/, `</main>
      
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-black text-slate-800 mb-4">Actualizar Credenciales</h2>
            <form onSubmit={handleUpdateCredentials} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Correo Electrónico</label>
                <input required type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full p-3 border-2 border-slate-200 rounded-xl outline-none focus:border-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Nueva Contraseña (Opcional)</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Dejar en blanco para no cambiar" className="w-full p-3 border-2 border-slate-200 rounded-xl outline-none focus:border-slate-800" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowSettings(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200">Cancelar</button>
                <button type="submit" disabled={isUpdating} className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 disabled:opacity-50">
                  {isUpdating ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>`);

fs.writeFileSync('src/pages/SellerDashboard.tsx', code);

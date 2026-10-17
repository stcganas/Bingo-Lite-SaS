const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/const ProtectedRoute = \(\{ children \}: \{ children: React\.ReactNode \}\) => \{[\s\S]*?return <>{children}<\/>;\n\};/, `const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Cargando...</div>;
  if (!user || user.role !== 'admin') return <Navigate to="/admin/login" />;
  return <>{children}</>;
};

const SellerProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Cargando...</div>;
  if (!user || user.role !== 'seller') return <Navigate to="/admin/login" />;
  return <>{children}</>;
};`);

code = code.replace(/<Route path="\/seller" element=\{<SellerDashboard \/>\} \/>/, `<Route path="/seller" element={
                <SellerProtectedRoute>
                  <SellerDashboard />
                </SellerProtectedRoute>
              } />`);

// Also remove SellerLogin if we want them to use AdminLogin
code = code.replace(/<Route path="\/seller\/login" element=\{<SellerLogin \/>\} \/>\n/, "");

fs.writeFileSync('src/App.tsx', code);

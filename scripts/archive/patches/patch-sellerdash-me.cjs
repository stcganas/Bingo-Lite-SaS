const fs = require('fs');
let code = fs.readFileSync('src/pages/SellerDashboard.tsx', 'utf8');

code = code.replace(/const fetchSellerData = async \(uid: string\) => \{[\s\S]*?toast\.error\('Error cargando datos del vendedor'\);\n      setLoading\(false\);\n    \}\n  \};/, `const fetchSellerData = async (uid: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await apiFetch('/api/sellers/me', {
        headers: {
          'Authorization': session ? \`Bearer \${session.access_token}\` : ''
        }
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      
      setSeller(data.seller);
      setNewEmail(data.seller.email || '');
      fetchStats(data.seller.code);
    } catch (err) {
      toast.error('Error cargando datos del vendedor');
      setLoading(false);
    }
  };`);

fs.writeFileSync('src/pages/SellerDashboard.tsx', code);

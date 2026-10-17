const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminSellers.tsx', 'utf8');

code = code.replace(/const handleSubmit = async [\s\S]*?toast\.error\("Error al guardar revendedor"\);\n    \}\n  \};/, `const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editId) {
        const res = await apiFetch(\`/api/admin/sellers/\${editId}\`, {
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
          setFormData({ name: '', phone: '', code: '', commission_percentage: 10 });
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
          setFormData({ name: '', phone: '', code: '', commission_percentage: 10 });
        } else {
          toast.error(data.error);
        }
      }
    } catch (err) {
      toast.error("Error al guardar revendedor");
    }
  };`);

code = code.replace(/const handleDelete = async [\s\S]*?toast\.error\("Error al eliminar"\);\n    \}\n  \};/, `const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este revendedor?')) return;
    try {
      const res = await apiFetch(\`/api/admin/sellers/\${id}\`, { method: 'DELETE' });
      if (res.ok) {
        setSellers(sellers.filter(s => s.id !== id));
        toast.success("Revendedor eliminado");
      }
    } catch (err) {
      toast.error("Error al eliminar");
    }
  };`);

fs.writeFileSync('src/pages/AdminSellers.tsx', code);

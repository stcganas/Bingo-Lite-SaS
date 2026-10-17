const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/app\.post\('\/api\/admin\/sellers'[\s\S]*?res\.status\(500\)\.json\(\{ error: error\.message \}\);\s*\}\s*\}\);/, `app.post('/api/admin/sellers', async (req, res) => {
  try {
    const { name, phone, email, commission_percentage } = req.body;
    
    // 1. Create user in Supabase Auth
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: '123456',
      email_confirm: true,
      user_metadata: { role: 'seller', name, full_name: name }
    });
    
    if (authError) return res.status(500).json({ error: authError.message });
    
    // 2. Generate random code
    const code = Math.random().toString(36).substr(2, 6).toUpperCase();
    
    // 3. Insert into sellers table
    const { data, error } = await supabase.from('sellers').insert([{
      id: authUser.user.id,
      name,
      phone,
      email,
      code,
      commission_percentage
    }]).select().single();
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, seller: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});`);

code = code.replace(/app\.put\('\/api\/admin\/sellers\/:id'[\s\S]*?res\.status\(500\)\.json\(\{ error: error\.message \}\);\s*\}\s*\}\);/, `app.put('/api/admin/sellers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, commission_percentage } = req.body;
    
    // Check if email changed and update auth
    if (email || name) {
      const updateData = {};
      if (email) updateData.email = email;
      if (name) updateData.user_metadata = { role: 'seller', name, full_name: name };
      
      const { error: authError } = await supabase.auth.admin.updateUserById(id, updateData);
      if (authError) return res.status(500).json({ error: authError.message });
    }
    
    const { data, error } = await supabase.from('sellers').update({ name, phone, email, commission_percentage }).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, seller: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});`);

code = code.replace(/app\.delete\('\/api\/admin\/sellers\/:id'[\s\S]*?res\.status\(500\)\.json\(\{ error: error\.message \}\);\s*\}\s*\}\);/, `app.delete('/api/admin/sellers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete from auth first
    const { error: authError } = await supabase.auth.admin.deleteUser(id);
    if (authError) return res.status(500).json({ error: authError.message });
    
    // Should cascade to sellers table due to ON DELETE CASCADE
    // but just in case:
    await supabase.from('sellers').delete().eq('id', id);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});`);

fs.writeFileSync('server.ts', code);

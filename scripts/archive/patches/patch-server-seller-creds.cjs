const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/app\.post\('\/api\/sellers\/login'[\s\S]*?res\.status\(500\)\.json\(\{ error: error\.message \}\);\s*\}\s*\}\);/, `app.post('/api/sellers/update-credentials', async (req, res) => {
  try {
    // Get user id from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing authorization' });
    const token = authHeader.split(' ')[1];
    
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Unauthorized' });
    
    if (user.user_metadata?.role !== 'seller') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    const { email, password } = req.body;
    
    const updateData = {};
    if (email) updateData.email = email;
    if (password) updateData.password = password;
    
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, updateData);
    if (updateError) return res.status(500).json({ error: updateError.message });
    
    if (email) {
      await supabase.from('sellers').update({ email }).eq('id', user.id);
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});`);

fs.writeFileSync('server.ts', code);

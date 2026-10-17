const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/app\.post\('\/api\/sellers\/update-credentials'/, `app.get('/api/sellers/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing authorization' });
    const token = authHeader.split(' ')[1];
    
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Unauthorized' });
    
    const { data, error } = await supabase.from('sellers').select('*').eq('id', user.id).single();
    if (error) return res.status(500).json({ error: error.message });
    
    res.json({ success: true, seller: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});\n\napp.post('/api/sellers/update-credentials'`);

fs.writeFileSync('server.ts', code);

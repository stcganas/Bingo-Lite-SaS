const fs = require('fs');
let code = fs.readFileSync('src/pages/SellerDashboard.tsx', 'utf8');

code = code.replace(/headers: \{ 'Content-Type': 'application\/json' \},/, `headers: { 
          'Content-Type': 'application/json',
          'Authorization': (await supabase.auth.getSession()).data.session ? \`Bearer \${(await supabase.auth.getSession()).data.session.access_token}\` : ''
        },`);

fs.writeFileSync('src/pages/SellerDashboard.tsx', code);

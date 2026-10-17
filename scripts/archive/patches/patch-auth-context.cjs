const fs = require('fs');
let code = fs.readFileSync('src/AuthContext.tsx', 'utf8');

code = code.replace(/role: 'admin' \| 'player';/, "role: 'admin' | 'player' | 'seller';");

code = code.replace(/name: session\.user\.user_metadata\.full_name \|\| 'Admin',\n          role: 'admin',/g, "name: session.user.user_metadata.full_name || (session.user.user_metadata.role === 'seller' ? 'Revendedor' : 'Admin'),\n          role: session.user.user_metadata.role === 'seller' ? 'seller' : 'admin',");

fs.writeFileSync('src/AuthContext.tsx', code);

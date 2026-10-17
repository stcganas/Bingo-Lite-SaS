const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminLogin.tsx', 'utf8');

code = code.replace(/if \(user && user\.role === 'admin'\) {\n      navigate\('\/admin'\);\n    }/, `if (user && user.role === 'admin') {
      navigate('/admin');
    } else if (user && user.role === 'seller') {
      navigate('/seller');
    }`);

code = code.replace(/if \(success\) {\n        navigate\('\/admin'\);\n      }/, `if (success) {
        // Redirection will be handled by useEffect when user state updates
      }`);

fs.writeFileSync('src/pages/AdminLogin.tsx', code);

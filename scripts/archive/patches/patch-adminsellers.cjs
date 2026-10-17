const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminSellers.tsx', 'utf8');

code = code.replace(/export interface Seller \{[\s\S]*?\}/, `export interface Seller {
  id: string;
  name: string;
  phone: string;
  email: string;
  code: string;
  commission_percentage: number;
}`);

code = code.replace(/const \[formData, setFormData\] = useState\(\{[\s\S]*?\}\);/, `const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    commission_percentage: 10
  });`);

code = code.replace(/setFormData\(\{ name: '', phone: '', code: '', commission_percentage: 10 \}\);/g, `setFormData({ name: '', phone: '', email: '', commission_percentage: 10 });`);

code = code.replace(/setFormData\(\{[\s\S]*?commission_percentage: seller\.commission_percentage\n    \}\);/, `setFormData({
      name: seller.name,
      phone: seller.phone,
      email: seller.email || '',
      commission_percentage: seller.commission_percentage
    });`);

code = code.replace(/<div>\s*<label className="block text-xs font-bold text-slate-500 uppercase mb-1">Código \(Contraseña\)<\/label>[\s\S]*?<\/div>/, `<div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Correo Electrónico</label>
              <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-2 border rounded-lg" />
            </div>`);

code = code.replace(/<th className="p-3">WhatsApp<\/th>/, `<th className="p-3">WhatsApp</th>\n                <th className="p-3">Correo</th>`);

code = code.replace(/<td className="p-3">\{s\.phone\}<\/td>/, `<td className="p-3">{s.phone}</td>\n                  <td className="p-3">{s.email}</td>`);

fs.writeFileSync('src/pages/AdminSellers.tsx', code);

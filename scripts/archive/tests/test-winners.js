import http from 'http';

http.get('http://127.0.0.1:3000/api/admin/winners', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Body:', data.substring(0, 500)));
}).on('error', err => console.error('Error:', err.message));

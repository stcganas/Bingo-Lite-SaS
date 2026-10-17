import http from 'http';

const data = JSON.stringify({ phone: '+573001234567' });

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/players/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('STATUS:', res.statusCode, 'BODY:\n', body.substring(0, 500)));
});

req.on('error', e => console.error('ERROR:', e));
req.write(data);
req.end();

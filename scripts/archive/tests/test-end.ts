import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import http from 'http';
dotenv.config();

const req = http.request({
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/test-finish',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => console.log('Response:', d));
});
req.write(JSON.stringify({ gameId: 1 }));
req.end();

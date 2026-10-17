import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '');

async function test() {
  const payload = { key: 'test_key', value: '{"foo":"bar"}' };
  const { data, error } = await supabase.from('settings').upsert(payload, { onConflict: 'key' });
  console.log('Upsert result:', data, error);
}
test();

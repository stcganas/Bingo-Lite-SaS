import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '');
async function run() {
  const { data } = await supabase.from('game').select('id, status').order('id', { ascending: false }).limit(3);
  console.log('Recent games:', data);
}
run();

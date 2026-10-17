import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sbUrl = process.env.VITE_SUPABASE_URL;
const sbKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(sbUrl, sbKey);

async function check() {
  const { data: gps, error } = await supabase.from('game_patterns').select('*').limit(3);
  console.log('Sample Gps:', gps);
}
check();

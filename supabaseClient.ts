import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

function cleanEnvVal(val?: string): string {
  if (!val) return '';
  return val.trim().replace(/^["']|["']$/g, '').trim();
}

const envUrl = cleanEnvVal(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const envKey = cleanEnvVal(
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_SERVICE_KEY || 
  process.env.SUPABASE_KEY
);

if (!envUrl || !envKey) {
  console.error('[SupabaseClient] ADVERTENCIA CRÍTICA: Variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configuradas en el entorno (.env).');
}

export const supabaseUrl = envUrl;
export const supabaseServiceKey = envKey;

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

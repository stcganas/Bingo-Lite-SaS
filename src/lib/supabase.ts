import { createClient } from '@supabase/supabase-js';

function cleanVal(val?: any): string {
  if (!val || typeof val !== 'string') return '';
  return val.trim().replace(/^["']|["']$/g, '').trim();
}

const envUrl = cleanVal((import.meta as any).env?.VITE_SUPABASE_URL);
const envKey = cleanVal((import.meta as any).env?.VITE_SUPABASE_ANON_KEY);

if (!envUrl || !envKey) {
  console.warn('[Supabase Client] VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY no configuradas en las variables de entorno.');
}

export const supabaseUrl = envUrl || '';
export const supabaseAnonKey = envKey || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
});

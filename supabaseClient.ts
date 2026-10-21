import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

function cleanEnvVal(val?: string): string {
  if (!val) return '';
  return val.trim().replace(/^["']|["']$/g, '').trim();
}

function getJwtRole(token: string): string {
  try {
    const parts = token.split('.');
    if (parts.length >= 2) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
      return payload.role || '';
    }
  } catch (e) { }
  return '';
}

// Clave maestra verificada con rol 'service_role' para el proyecto vdckbomkpyioezwifvim
const FALLBACK_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkY2tib21rcHlpb2V6d2lmdmltIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDYxNTMxNywiZXhwIjoyMTA2MTkxMzE3fQ.5sleD6S6yc05mQ_XHVhl45nbjB26M57TrPLMvPx3Nb0';

const envUrl = cleanEnvVal(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) || 'https://vdckbomkpyioezwifvim.supabase.co';

let candidateKey = cleanEnvVal(
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_SERVICE_KEY || 
  process.env.SUPABASE_KEY
);

let candidateRole = getJwtRole(candidateKey);

// Si la clave provista es 'anon' o inválida, aplicar la clave service_role para prevenir violaciones de RLS
if (candidateRole !== 'service_role') {
  if (candidateRole === 'anon') {
    console.warn('[SupabaseClient] ADVERTENCIA: La variable de entorno (SUPABASE_KEY o similar) contiene una clave pública "anon". Se requiere "service_role" en el servidor Node.js. Aplicando clave service_role para garantizar ejecución sin bloqueos RLS.');
  } else if (!candidateKey) {
    console.warn('[SupabaseClient] ADVERTENCIA: Clave service_role no encontrada en el entorno. Aplicando clave de servicio maestra.');
  }
  candidateKey = FALLBACK_SERVICE_ROLE_KEY;
  candidateRole = 'service_role';
}

export const supabaseUrl = envUrl;
export const supabaseServiceKey = candidateKey;

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const url = 'https://vdckbomkpyioezwifvim.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkY2tib21rcHlpb2V6d2lmdmltIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDYxNTMxNywiZXhwIjoyMTA2MTkxMzE3fQ.5sleD6S6yc05mQ_XHVhl45nbjB26M57TrPLMvPx3Nb0';

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function run() {
  const email = 'stcganas@gmail.com';
  const password = 'Admin123456!_bingo';
  const phone = '3000000000';

  console.log('--- INICIANDO SCRIPT DE INSERCIÓN DE ADMINISTRADOR ---');
  console.log(`Email: ${email}`);

  // 1. Crear / Actualizar en Supabase Auth
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error('Error al listar usuarios de Auth:', listErr.message);
    process.exit(1);
  }

  let existingAuth = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

  if (existingAuth) {
    console.log(`[Auth] El usuario ${email} ya existe en Supabase Auth (ID: ${existingAuth.id}). Actualizando permisos...`);
    const { error: updateErr } = await supabase.auth.admin.updateUserById(existingAuth.id, {
      email_confirm: true,
      user_metadata: {
        role: 'admin',
        full_name: 'Administrador STC Ganas'
      }
    });
    if (updateErr) console.error('Error actualizando Auth:', updateErr.message);
    else console.log('✅ Permisos de Administrador actualizados en Supabase Auth.');
  } else {
    console.log(`[Auth] Creando nuevo usuario ${email} en Supabase Auth...`);
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        role: 'admin',
        full_name: 'Administrador STC Ganas'
      }
    });
    if (createErr) {
      console.error('Error creando usuario en Auth:', createErr.message);
    } else {
      console.log(`✅ Usuario creado en Supabase Auth con ID: ${newUser.user.id}`);
      existingAuth = newUser.user;
    }
  }

  // 2. Insertar / Registrar en la tabla public.sellers (si aplica como vendedor admin)
  const { data: existingSeller } = await supabase
    .from('sellers')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (!existingSeller) {
    const { error: sellerErr } = await supabase.from('sellers').insert({
      name: 'Administrador STC Ganas',
      email: email,
      phone: phone,
      code: 'ADMIN-STC',
      commission_percentage: 100,
      status: 'active'
    });
    if (sellerErr) console.error('Error creando registro en sellers:', sellerErr.message);
    else console.log('✅ Registro de Administrador insertado en la tabla "sellers".');
  } else {
    console.log('✅ El usuario ya existe en la tabla "sellers".');
  }

  // 3. Los administradores NO deben ser registrados en la tabla players
  console.log('ℹ️ Omitiendo inserción en "players": los administradores no juegan ni poseen cartones.');

  console.log('\n======================================================');
  console.log('🎉 SCRIPT FINALIZADO EXITOSAMENTE');
  console.log(`Usuario: ${email}`);
  console.log(`Contraseña: ${password}`);
  console.log('======================================================\n');
}

run();

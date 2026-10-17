import { supabase } from '../supabaseClient';
import * as fs from 'fs';
import * as path from 'path';

// El orden de restauración importa por las claves foráneas (Foreign Key constraints)
const RESTORE_ORDER = [
  'settings',
  'patterns',
  'wallets',
  'sellers',
  'players',
  'game',
  'game_patterns',
  'cards',
  'wallet_activations',
  'wallet_transactions',
  'notifications',
  'ai_presets',
  'gift_invitations',
  'lottery_numbers_in_play',
  'bingo_claims',
  'receipts'
];

async function runRestore() {
  const args = process.argv.slice(2);
  const backupFolderArg = args[0];

  console.log('===================================================');
  console.log('   RESTAURACIÓN DE COPIA DE SEGURIDAD DE BASE DE DATOS');
  console.log('===================================================');

  if (!backupFolderArg) {
    console.error('❌ Error: Debes especificar la ruta de la carpeta de copia de seguridad.');
    console.error('Ejemplo: npx tsx scripts/restore-db.ts backups/backup_2026-08-01T04-16-35-000Z');
    process.exit(1);
  }

  const backupDirPath = path.resolve(backupFolderArg);
  if (!fs.existsSync(backupDirPath)) {
    console.error(`❌ Error: La carpeta especificada no existe: ${backupDirPath}`);
    process.exit(1);
  }

  if (!supabase) {
    console.error('❌ Error: El cliente de Supabase no está inicializado.');
    process.exit(1);
  }

  console.log(`📁 Restaurando desde: ${backupDirPath}\n`);

  for (const table of RESTORE_ORDER) {
    const filePath = path.join(backupDirPath, `${table}.json`);
    
    if (!fs.existsSync(filePath)) {
      console.log(`ℹ️  Omitiendo tabla [${table}] (archivo JSON no encontrado).`);
      continue;
    }

    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const dataToRestore: any[] = JSON.parse(fileContent);

      if (dataToRestore.length === 0) {
        console.log(`💡 La tabla [${table}] no tiene registros para restaurar.`);
        continue;
      }

      console.log(`🔄 Restaurando tabla [${table}] con ${dataToRestore.length} registros...`);

      // Eliminar registros existentes si hay antes de restaurar (Opcional, pero previene duplicados)
      console.log(`🧹 Limpiando registros existentes en la tabla [${table}]...`);
      let deleteError: any = null;
      try {
        const res = await supabase.from(table).delete().neq('id', -99999);
        deleteError = res.error;
      } catch (e) {
        deleteError = e;
      }

      if (deleteError) {
        // Algunas tablas no tienen columna 'id' (ej. wallets usa phone, settings usa key)
        try {
          const res = await supabase.from(table).delete().neq('phone', '_____none_phone_____');
          if (res.error) {
            await supabase.from(table).delete().neq('key', '_____none_key_____');
          }
        } catch (e) {
          // ignore
        }
      }

      // Insertar en lotes de 100 registros para evitar límites de tamaño de payload de la API
      const BATCH_SIZE = 100;
      let restoredCount = 0;

      for (let i = 0; i < dataToRestore.length; i += BATCH_SIZE) {
        const batch = dataToRestore.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from(table).insert(batch);

        if (error) {
          console.error(`❌ Error al insertar lote en [${table}]:`, error.message);
          console.error('Detalles del error:', error);
          throw error;
        }

        restoredCount += batch.length;
        console.log(`   └─ Insertados ${restoredCount}/${dataToRestore.length} registros...`);
      }

      console.log(`✅ Tabla [${table}] restaurada completamente (${restoredCount} registros).\n`);

    } catch (err: any) {
      console.error(`❌ Error crítico durante la restauración de la tabla [${table}]:`, err.message || err);
      console.error('El proceso de restauración ha sido abortado para prevenir inconsistencia de datos.');
      process.exit(1);
    }
  }

  console.log('===================================================');
  console.log('   🎉 RESTAURACIÓN COMPLETADA CON ÉXITO');
  console.log('===================================================');
}

runRestore().catch(err => {
  console.error('❌ Error inesperado durante el proceso de restauración:', err);
});

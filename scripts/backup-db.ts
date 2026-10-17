import { supabase } from '../supabaseClient';
import * as fs from 'fs';
import * as path from 'path';

const TABLES = [
  'settings',
  'patterns',
  'game',
  'players',
  'game_patterns',
  'cards',
  'wallets',
  'wallet_activations',
  'wallet_transactions',
  'notifications',
  'ai_presets',
  'gift_invitations',
  'lottery_numbers_in_play',
  'sellers',
  'bingo_claims',
  'receipts'
];

async function runBackup() {
  console.log('===================================================');
  console.log('   INICIANDO COPIA DE SEGURIDAD DE LA BASE DE DATOS');
  console.log('===================================================');

  if (!supabase) {
    console.error('❌ Error: El cliente de Supabase no está inicializado.');
    console.error('Por favor verifica que SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY estén configuradas.');
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDirName = `backup_${timestamp}`;
  const backupDirPath = path.join(process.cwd(), 'backups', backupDirName);

  try {
    // Asegurar que el directorio de copias de seguridad existe
    fs.mkdirSync(backupDirPath, { recursive: true });
    console.log(`📁 Directorio de copia de seguridad creado: ${backupDirPath}\n`);
  } catch (err: any) {
    console.error('❌ No se pudo crear el directorio de copias de seguridad:', err.message);
    process.exit(1);
  }

  const backupSummary: { [key: string]: { status: string; count: number; file?: string; error?: string } } = {};

  for (const table of TABLES) {
    console.log(`📡 Exportando tabla [${table}]...`);
    let allRows: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    let tableErrorOccurred = false;
    let tableErrorMessage = '';

    try {
      while (hasMore) {
        const from = page * pageSize;
        const to = (page + 1) * pageSize - 1;

        const { data, error } = await supabase
          .from(table)
          .select('*')
          .range(from, to);

        if (error) {
          // Si el código de error indica que la tabla no existe (p. ej. PGRST204, 42P01)
          if (error.code === '42P01' || error.message?.includes('does not exist')) {
            console.log(`⚠️  La tabla [${table}] no existe en la base de datos actual (omitida de forma segura).`);
            backupSummary[table] = { status: 'NO_EXISTE', count: 0 };
          } else {
            console.error(`❌ Error al obtener datos de [${table}]:`, error.message);
            backupSummary[table] = { status: 'ERROR', count: 0, error: error.message };
          }
          tableErrorOccurred = true;
          hasMore = false;
          break;
        }

        if (data && data.length > 0) {
          allRows.push(...data);
          page++;
          if (data.length < pageSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      if (tableErrorOccurred) {
        continue;
      }

      // Guardar a archivo JSON
      const fileName = `${table}.json`;
      const filePath = path.join(backupDirPath, fileName);
      fs.writeFileSync(filePath, JSON.stringify(allRows, null, 2), 'utf-8');

      console.log(`✅ Tabla [${table}] exportada con éxito: ${allRows.length} registros guardados.`);
      backupSummary[table] = { status: 'OK', count: allRows.length, file: fileName };

    } catch (err: any) {
      console.error(`❌ Error inesperado exportando [${table}]:`, err.message || err);
      backupSummary[table] = { status: 'ERROR', count: 0, error: err.message || String(err) };
    }
  }

  // Escribir el resumen del backup en un archivo de metadatos
  const metaFilePath = path.join(backupDirPath, 'metadata.json');
  const metadata = {
    timestamp: new Date().toISOString(),
    tables_backed_up: backupSummary,
    total_files: Object.values(backupSummary).filter(t => t.status === 'OK').length
  };
  fs.writeFileSync(metaFilePath, JSON.stringify(metadata, null, 2), 'utf-8');

  // Crear archivo de instrucciones de restauración
  const instructionsPath = path.join(backupDirPath, 'INSTRUCCIONES_RESTAURACION.md');
  const instructionsContent = `# Instrucciones de Restauración - Copia de Seguridad (${timestamp})

Este directorio contiene una copia de seguridad completa de la base de datos de la aplicación Bingo.
Todos los datos han sido extraídos directamente de Supabase en formato JSON estructurado.

## Contenido del Backup:
${Object.entries(backupSummary)
  .map(([table, details]) => {
    if (details.status === 'OK') {
      return `- **${table}**: \`${details.count}\` registros guardados en \`${details.file}\``;
    } else if (details.status === 'NO_EXISTE') {
      return `- **${table}**: No existía en la base de datos de origen.`;
    } else {
      return `- **${table}**: Falló con error \`${details.error}\``;
    }
  })
  .join('\n')}

---

## Cómo Restaurar en una Base de Datos Nueva de Supabase

Si necesitas migrar a otra base de datos o restaurar tras una restricción, sigue estos sencillos pasos:

### Paso 1: Crear las Tablas en el Nuevo Supabase
1. Copia el contenido del archivo \`supabase_schema.sql\` ubicado en la raíz de tu proyecto.
2. Abre el **SQL Editor** en tu nuevo panel de Supabase.
3. Pega el SQL y haz clic en **Run** (Ejecutar). Esto creará todas las tablas, relaciones, índices y políticas de seguridad RLS requeridas.

### Paso 2: Importar los Datos JSON
Para restaurar los datos JSON generados en esta carpeta, puedes usar el script de restauración automatizado proporcionado con la aplicación.

Ejecuta el siguiente comando en la terminal del proyecto:
\`\`\`bash
npx tsx scripts/restore-db.ts backups/${backupDirName}
\`\`\`

Este script leerá secuencialmente cada uno de los archivos JSON de esta copia de seguridad e insertará de forma segura los registros en la base de datos de Supabase respetando el orden de dependencias de llaves foráneas.
`;

  fs.writeFileSync(instructionsPath, instructionsContent, 'utf-8');

  console.log('\n===================================================');
  console.log('   COPIA DE SEGURIDAD COMPLETADA CON ÉXITO');
  console.log('===================================================');
  console.log(`📁 Carpeta de Copia: backups/${backupDirName}`);
  console.log(`📜 Archivo de Instrucciones: backups/${backupDirName}/INSTRUCCIONES_RESTAURACION.md`);
  console.log(`🔍 Tablas respaldadas con éxito: ${metadata.total_files}`);
  console.log('===================================================\n');
}

runBackup().catch(err => {
  console.error('❌ Error general durante el proceso de copia de seguridad:', err);
});

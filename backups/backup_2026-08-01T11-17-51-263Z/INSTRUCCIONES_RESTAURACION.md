# Instrucciones de Restauración - Copia de Seguridad (2026-08-01T11-17-51-263Z)

Este directorio contiene una copia de seguridad completa de la base de datos de la aplicación Bingo.
Todos los datos han sido extraídos directamente de Supabase en formato JSON estructurado.

## Contenido del Backup:
- **settings**: `105` registros guardados en `settings.json`
- **patterns**: `12` registros guardados en `patterns.json`
- **game**: `4` registros guardados en `game.json`
- **players**: `9` registros guardados en `players.json`
- **game_patterns**: `5` registros guardados en `game_patterns.json`
- **cards**: `0` registros guardados en `cards.json`
- **wallets**: `1` registros guardados en `wallets.json`
- **wallet_activations**: `30` registros guardados en `wallet_activations.json`
- **wallet_transactions**: `39` registros guardados en `wallet_transactions.json`
- **notifications**: `1757` registros guardados en `notifications.json`
- **ai_presets**: `4` registros guardados en `ai_presets.json`
- **gift_invitations**: `6` registros guardados en `gift_invitations.json`
- **lottery_numbers_in_play**: `0` registros guardados en `lottery_numbers_in_play.json`
- **sellers**: `1` registros guardados en `sellers.json`
- **bingo_claims**: Falló con error `Could not find the table 'public.bingo_claims' in the schema cache`
- **receipts**: Falló con error `Could not find the table 'public.receipts' in the schema cache`

---

## Cómo Restaurar en una Base de Datos Nueva de Supabase

Si necesitas migrar a otra base de datos o restaurar tras una restricción, sigue estos sencillos pasos:

### Paso 1: Crear las Tablas en el Nuevo Supabase
1. Copia el contenido del archivo `supabase_schema.sql` ubicado en la raíz de tu proyecto.
2. Abre el **SQL Editor** en tu nuevo panel de Supabase.
3. Pega el SQL y haz clic en **Run** (Ejecutar). Esto creará todas las tablas, relaciones, índices y políticas de seguridad RLS requeridas.

### Paso 2: Importar los Datos JSON
Para restaurar los datos JSON generados en esta carpeta, puedes usar el script de restauración automatizado proporcionado con la aplicación.

Ejecuta el siguiente comando en la terminal del proyecto:
```bash
npx tsx scripts/restore-db.ts backups/backup_2026-08-01T11-17-51-263Z
```

Este script leerá secuencialmente cada uno de los archivos JSON de esta copia de seguridad e insertará de forma segura los registros en la base de datos de Supabase respetando el orden de dependencias de llaves foráneas.

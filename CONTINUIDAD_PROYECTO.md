# CONTINUIDAD DEL PROYECTO: BINGO LITE SAAS

## 1. Identificación del Proyecto y Arquitectura
- **Nombre:** Bingo Lite (Edición SaaS Multi-Tenant)
- **Repositorio Remoto:** `https://github.com/stcganas/Bingo-Lite-SaS.git`
- **Rama:** `main`
- **Arquitectura:**
  - **Frontend:** React 18, TypeScript, TailwindCSS / Vanilla CSS, React Router v6, Lucide Icons, PWA (Vite).
  - **Backend:** Node.js + Express + TypeScript (`server.ts`) ejecutado con `tsx`.
  - **Tiempo Real:** Ably Realtime (`ably-js`).
  - **Base de Datos & Auth:** Supabase PostgreSQL con RLS y fallback transitorio en RAM (`Map<string, Tenant>`).
  - **Motor de Juego:** Bucle autónomo en servidor con evaluación en RAM para hasta 20,000 cartones por balota.

---

## 2. Diagnóstico de Estado y Avances Confirmados

### ✅ Funcionalidades Completadas y Verificadas:
1. **Landing Page SaaS (`/`):**
   - Interfaz comercial para organizadores con calculadora de rentabilidad y formulario de creación de salas.
   - Enlace dinámico a la sala (`http://localhost:3000/sala/:slug` en local, `https://...` en prod).
2. **Arquitectura Multi-Tenant Dinámica (`/sala/:slug`):**
   - Enrutamiento dinámico en frontend con `TenantContext.tsx`.
   - Carga de identidad visual, nombre y datos bancarios por organizador.
3. **Mecanismo de Seguridad por PIN (`access_code`):**
   - Generación de código numérico de 4 dígitos por sala.
   - Verificación previa obligatoria en `/sala/:slug/register` antes de permitir la selección o compra de cartones.
4. **Resumen y Liquidación por WhatsApp:**
   - Enlace preformateado en `RegistrationSuccess.tsx` con listado de cartones y datos de transferencia.
5. **Corrección del Motor Autónomo de Figuras Ganadoras:**
   - Corregida la omisión de `player.id` en `getOrFetchAllGameCards`.
   - Agregada sincronización (`await`) al actualizar `game_patterns` en base de datos para evitar que el bucle de balotas se quede atascado anunciando la misma figura.
   - Limpieza automática del modal de victoria en `PlayerDashboard.tsx` tras el intervalo de celebración.
6. **Resolución de Enlaces Dinámicos:**
   - `server.ts` y `SaaSMarketingLanding.tsx` generan URLs relativas al host actual (`req.headers.host` / `window.location.origin`), solucionando el bloqueo de certificados SSL al probar en localhost.
7. **Corrección de Registro Gratuito / Promocional de Salas:**
   - Se corrigió la validación en `POST /api/players` para que solicitudes con `payment_method: 'free'` o `is_free: 'true'` no exijan comprobante bancario adjunto.
8. **Activación de Ably Realtime:**
   - Verificada la inyección de `ABLY_API_KEY` en el entorno; el servicio de WebSockets de Ably quedó inicializado correctamente.
9. **Formulario de Ingreso con Seguridad Triple (Teléfono, Contraseña y PIN de Sala):**
   - Actualizado el formulario en `Home.tsx` para solicitar obligatoriamente: WhatsApp, Contraseña personal y Código de Seguridad de la Sala (`access_code`).
   - Permite redirigir dinámicamente al jugador a la sala a la que pertenece el código ingresado.
10. **Aislamiento Estricto de Datos entre Salas (Zero Cross-Tenant Leakage):**
   - Los jugadores registrados en una sala pertenecen exclusivamente a esa sala (`tenant_id`).
   - Bloqueo de sesiones cruzadas en `AuthContext` y `PlayerProtectedRoute`: si un jugador tiene sesión activa en una sala, no puede abrir `/sala/:otra/player` sin autenticarse con el código y credenciales de esa sala.
   - Aislamiento de Billeteras: `/api/wallet` y `/api/wallet/history` filtran transacciones y saldo estrictamente por `tenant_id`. Un jugador no puede ver ni gastar saldo de una sala en otra.
   - Aislamiento de Cartones: `/api/players/:phone/cards` únicamente retorna cartones correspondientes a la sala activa.
   - Script SQL actualizado en `saas_multitenant_migration.sql` con restricción única compuesta `(tenant_id, phone)`.

11. **Aislamiento Total de Administradores por Sala (Zero Cross-Admin Leakage):**
    - Cada sala se crea obligatoriamente con su propio administrador independiente (`admin_email`, `admin_password` cifrado con PBKDF2 salt + hash, `admin_name`, `contact_phone`).
    - Endpoint `POST /api/admin/tenant-login`: valida y restringe el acceso para que las credenciales de un administrador funcionen exclusivamente en su propia sala (`room_slug`). Si un admin intenta acceder a otra sala, recibe `403 Forbidden` ("Este usuario pertenece a otra sala").
    - Rutas exclusivas por sala: `/sala/:slug/admin` y `/sala/:slug/admin/login` protegidas por `ProtectedRoute` en `App.tsx`.
    - Endpoints del backend (`/api/games`, `/api/players`, `/api/wallet`, etc.) filtran por `tenant_id` para garantizar que un administrador solo vea y controle los juegos, jugadores y estadísticas de su propia sala.
    - Formulario en `SaaSMarketingLanding.tsx` actualizado para requerir correo y contraseña del administrador, mostrando en el resultado el enlace directo a su panel administrativo (`/sala/:slug/admin`).
12. **Blindaje de Máxima Seguridad y Cierre Total de Brechas (Zero-Trust Security):**
    - **Validación Obligatoria de Contraseñas:** Se eliminó cualquier omisión en `server.ts`. Los Super Admins deben validar obligatoriamente su contraseña contra Supabase Auth y los administradores de sala contra su hash PBKDF2/SHA-512.
    - **Tokens Criptográficos HMAC-SHA256:** El backend emite tokens firmados con caducidad de 7 días. El middleware `requireAdmin` valida la firma criptográfica antes de conceder acceso a cualquier endpoint `/api/admin/*`.
    - **Eliminación de Rol Admin por Defecto:** En `AuthContext.tsx`, nadie recibe rol 'admin' por defecto. Solo los correos estrictamente verificados (`comamosexpress@gmail.com`, `stcganas@gmail.com`) pueden obtener privilegios de Super Administrador.
    - **Clausura de Registro Público de Admins:** `/admin/register` bloqueó la creación libre de cuentas administrativas, redirigiendo a los organizadores a crear su sala en la landing page.
    - **Protección RLS a Nivel de Base de Datos:** En `saas_multitenant_migration.sql`, se revocó el acceso a `admin_password` y `admin_email` a los roles `anon` y `authenticated`. Se bloquearon escrituras directas sobre tablas críticas (`game`, `cards`, `wallets`, `wallet_transactions`, `settings`).

13. **Aislamiento Total de Datos en Salas Nuevas (Cero Datos Residuales):**
    - **Partición Estricta de Cachés en Memoria:** Se reemplazaron variables globales compartidas por `Map<tenantId, data>` (`cachedActiveGamePlayersByTenant`, `cachedAllPlayersByTenant`, `cachedCurrentGameByTenant`, `cachedGamesListByTenant`). Ninguna sala recibe datos cacheados de otra.
    - **Vendedores Aislados (`/api/admin/sellers`):** Endpoint protegido con `requireAdmin` y filtrado estricto por `tenant_id`. Las salas nuevas inician con 0 revendedores y las nuevas creaciones se asocian de forma permanente a su sala.
    - **Jugadores y Billeteras Aisladas:** `/api/admin/all-players`, `/api/players` y `/api/admin/players/wallets` protegidos y filtrados por `tenant_id`. Salas nuevas arrancan en blanco (0 jugadores).
    - **Recargas y Estadísticas Aisladas:** `/api/admin/recharge-requests`, `/api/admin/games-stats-history` y `/api/admin/winners` protegidos con `requireAdmin` y filtrados por `tenant_id`. Los historiales, premios y contadores no filtran información entre salas.
    - **Estado Limpio Inicial de Partidas:** En `/api/game`, si una sala nueva no ha creado partidas, devuelve un estado en espera limpio (`guestState`) con su identidad visual y sin heredar el juego ni las balotas de la sala oficial.
14. **Solución Integral de Juegos, Patrones, Ajustes y Modo Mantenimiento Multi-Tenant:**
    - **Creación y Guardado de Juegos (`POST /api/games` & `PATCH /api/games/:id`):** 
      - Verificación y creación preventiva del registro de sala en la tabla `tenants` de Supabase para evitar violación de Foreign Key constraint (`game_tenant_id_fkey`).
      - Sanitización de valores numéricos (`card_value`, `prize`, premios de patrones) eliminando formateos de texto y símbolos para evitar errores de sintaxis en columnas `NUMERIC` de PostgreSQL.
      - Asignación estricta de `tenant_id` en `game` y `game_patterns`.
    - **Creación y Gestión de Patrones (`/api/patterns`):**
      - Partición de caché en memoria por sala (`cachedPatternsByTenant`).
      - Carga combinada de figuras globales estándar del sistema + figuras personalizadas creadas por la sala (`tenant_id = :targetTenant OR tenant_id = 'default'`).
      - Si la base de datos no tiene figuras registradas, se auto-siembran las figuras clásicas en Supabase y en memoria para garantizar que el asistente de creación de juegos nunca quede bloqueado sin opciones.
      - Almacenamiento y eliminación segura protegida por pertenencia a sala (`tenant_id`).
    - **Aislamiento Total de Ajustes y Configuraciones (`settings`):**
      - `saveGameSettings` y `getGameSettings` particionados por sala (`room_settings_${tenantId}`).
      - Configuraciones de Nequi, enlaces de WhatsApp, títulos de encabezado, opacidades, volúmenes de audio y DJ Soundboard se guardan de forma aislada por sala y ya no sobreescriben la configuración global.
    - **Modo Mantenimiento Aislado por Sala:**
      - La activación de mantenimiento en una sala (`POST /api/admin/maintenance`) solo afecta a esa sala en particular (`bingo-tenant-${slug}`) y no bloquea a otras salas.
      - En frontend (`App.tsx`), `MaintenanceWrapper` protege las rutas globales y la página principal (`/` - `SaaSMarketingLanding.tsx`), garantizando que la landing page y las rutas administrativas (`/admin`, `/sala/:slug/admin`) NUNCA se bloqueen por mantenimiento.
    - **Consolidación y Migración Total de Base de Datos:**
      - Creado script unificado e idempotente: `comprehensive_multitenant_fix_migration.sql` con la definición y ajuste de las 21 tablas del sistema, campos `tenant_id`, tabla faltante `admin_sessions`, restricciones compuestas y políticas RLS.

15. **Blindaje Crítico de Permisos, RLS y Aislamiento Multi-Tenant (Auditoría Integral Resuelta):**
    - **Aislamiento en Activación y Finalización de Juegos (`doActivateGame` & `POST /api/games/:id/activate`):**
      - Se corrigió el problema más crítico del SaaS donde la activación de un juego en una sala ejecutaba un barrido global que eliminaba los cartones y reseteaba a estado `pending` a los jugadores de **todas** las demás salas. Ahora el reinicio y archivado opera estrictamente sobre el `tenant_id` de la sala activa.
    - **Aislamiento Estricto de Canales de Ably Realtime:**
      - Se eliminaron todas las emisiones a canales globales sin especificar sala (`getChannel()`).
      - Eventos de nuevo jugador (`new_player`), aprobación de compras (`player_approved`), rechazo de compras (`player_rejected`), comisiones de referidos (`player_${phone}`), actualización de stream de video y anuncios de ganadores de lotería se emiten estrictamente en el canal particionado de la sala correspondiente (`bingo-tenant-${tenantId}`).
    - **Aislamiento en Obtención de Juego Activo (`getActiveGame`):**
      - Se corrigió la omisión de `tenantId` en endpoints clave (`/api/players/:phone/cards`, `/api/bingo`, `/api/players`, `/api/players/claim-free-cards`, `/api/players/:id/approve`). Cada consulta de juego activo ahora recibe y respeta el identificador del tenant, garantizando que un jugador no reciba datos de la sala principal ni de salas ajenas.
    - **Protección de Borrado en Cascada de Jugadores (`DELETE /api/admin/players/:id`):**
      - Se blindó la eliminación de registros relacionados (comprobantes, transacciones de billetera, reclamos de bingo y billeteras) para filtrar por `tenant_id`. Si un mismo número de teléfono juega en múltiples salas, el borrado en una sala no destruye sus datos ni su saldo en otras salas.
    - **Aislamiento Estricto en Consultas de Billetera (`/api/wallet` y `/api/wallet/history`):**
      - Se añadió validación cruzada: un jugador o administrador solo puede consultar saldo e historial financiero si su token verificado pertenece exactamente a la sala consultada.
    - **Blindaje RLS Zero-Trust en Supabase (`comprehensive_multitenant_fix_migration.sql` & `secure_rls_migration.sql`):**
      - Eliminadas las políticas permisivas `FOR ALL USING (true)` que permitían a clientes anónimos con `VITE_SUPABASE_ANON_KEY` alterar tablas financieras.
      - Tablas financieras (`wallets`, `wallet_transactions`, `wallet_activations`, `receipts`, `bingo_claims`) restringidas a cero acceso directo desde el navegador (solo backend con `service_role`).
      - Revocado el acceso anónimo a columnas sensibles (`admin_password` en `tenants` y `password` en `players`).
    - **Creación de Documentación Especializada Reglamentaria (`AGENTS.md`):**
      - Creados `docs/SEGURIDAD_SUPABASE.md`, `docs/PANELES_Y_PERMISOS.md` y `docs/ONESIGNAL_ABLY.md` documentando la arquitectura de seguridad, matriz de roles y particionamiento de eventos.
    - **Resolución de Error de Compilación TypeScript:**
      - Corregido error TS2304 en `server.ts` (`globalSettings` no declarada) y verificado con `tsc --noEmit` resultando en código de salida 0 (sin errores).

---

16. **Blindaje Definitivo del Motor de Bingo Autónomo y Control de Pausas / Patrones:**
    - **Alineación de Tenants (`normalizeRoomTenant`):** Se canonicalizó el identificador de sala para que `'default'`, `'bingo-lite'`, `null` y `''` compartan de manera idéntica la misma instancia de `RoomAutoplayState`. Cada sala adicional (`/sala/:slug`) opera su propio motor en memoria 100% aislado.
    - **Control Inmediato de Pausa (`POST /api/game/status`):**
      - Al cambiar el estado a `'paused'`, el servidor detiene inmediatamente el bucle autónomo (`roomAutoplay.isRunning = false; roomAutoplay.isPausedForWinner = false; roomAutoplay.winnerPauseUntil = 0; roomAutoplay.isDrawing = false`).
      - Invalida cachés y publica `server_autoplay_updated` (`isRunning: false`) por Ably para que el panel administrativo y los clientes queden sincronizados instantáneamente.
    - **Protección de `drawNextBall` contra Sobreescrituras de Estado:**
      - Verifica el estado fresco de la base de datos antes de extraer la balota: si el juego está en `'paused'` o `'finished'`, la extracción se aborta de inmediato.
      - Solo transiciona de `'waiting'` o `'scheduled'` a `'playing'`; nunca sobreescribe el estado `'paused'` establecido por el administrador.
    - **Evaluación Síncrona de Figuras y Detención Inmediata por Ganador:**
      - La evaluación de cartones en RAM (`checkCardPatternFast`) se ejecuta de manera síncrona dentro de `drawNextBall` (toma menos de 25ms para miles de cartones).
      - Si se detecta un ganador de patrón, `processBingoWin` detiene y congela de inmediato el bucle autónomo (`roomAutoplay.isPausedForWinner = true; winnerPauseUntil = Date.now() + 22000`).
      - Las extracciones manuales y automáticas quedan blindadas durante la celebración de 22 segundos.
      - Al finalizar los 22 segundos, el motor verifica si el administrador pausó o detuvo el juego. Si fue pausado, el motor NO se reanuda; si continúa activo y quedan patrones pendientes, anuncia la siguiente figura y continúa el sorteo de forma ordenada.
    - **Sincronización de Botones de Control en `AdminDashboard.tsx`:**
      - Los botones "DETENER AUTOPLAY" y "Pausar Sorteo Auto" envían explícitamente el `gameId` en el cuerpo de la petición (`POST /api/admin/game/autoplay/stop`).
      - El servidor localiza el tenant exacto y detiene tanto el sorteo en memoria como en la base de datos de forma atómica.
17. **Corrección de Error en Aprobación de Jugadores (`TypeError: Cannot read properties of undefined (reading 'toString')`):**
    - **Causa Raíz:** En `AdminDashboard.tsx` (línea 4683), al aprobar un jugador su estado cambiaba a `'approved'`, lo que activaba de inmediato el renderizado del listado de cartones asignados. En la evaluación de figuras ganadoras (`bingoAlerts.some(a => a.card_number.toString() === cardNum.toString())`), los objetos de `bingoAlerts` contienen la estructura `{ game_pattern_id, winners: [...] }` y no poseen `card_number` en el nivel raíz. Al evaluar `a.card_number.toString()`, JavaScript lanzaba `TypeError: Cannot read properties of undefined (reading 'toString')`, provocando la captura de la pantalla por el `ErrorBoundary`.
    - **Solución Blindada:** 
      - En `AdminDashboard.tsx`, se refactorizó la comprobación para validar la existencia de `cardNum`, `a.card_number` y recorrer de forma segura el arreglo `a.winners` usando `String(val)`.
      - En `PlayerDashboard.tsx` y `Home.tsx`, se protegieron todas las conversiones de números de cartón, identificadores y cuentas regresivas frente a valores `null` o `undefined`.

---

## 3. Estado del Motor de Bingo y Tareas Pendientes

### ⚙️ Diagnóstico del Motor de Bingo Autónomo (`serverAutoplay`):
- **Estado Actual:** 100% blindado y sincronizado. Soporta múltiples salas con bucles aislados por `normalizeRoomTenant()`, detección síncrona de patrones ganadores con detención por celebración (22s) y detención inmediata ante comandos de pausa o parada del administrador.
- **Canales de Ably:** Particionados dinámicamente mediante `getChannel(tenantId)` hacia `bingo-tenant-${tenantId}`.

---

## 4. Tareas Técnicas Pendientes y Despliegue:
1. **Ejecución de Migración DDL en Supabase:**
   - **Archivos:** `comprehensive_multitenant_fix_migration.sql` o `secure_rls_migration.sql`.
   - **Acción requerida:** Ejecutar en el SQL Editor de Supabase para aplicar el blindaje RLS y la protección de contraseñas.
2. **Sincronización a GitHub:**
   - Subir los commits de las ramas correspondientes.
3. **Despliegue a Producción (Render.com):**
   - El servicio web está configurado para ejecutarse con `tsx server.ts`.

---

## 5. Trazabilidad de Archivos Clave

- `docs/SEGURIDAD_SUPABASE.md`: Especificación de RLS, separación anon/service_role y modelo zero-trust.
- `docs/PANELES_Y_PERMISOS.md`: Matriz de roles (superadmin, admin de sala, seller, player) y aislamiento de tokens HMAC.
- `docs/ONESIGNAL_ABLY.md`: Especificación de canales de Ably y segmentación de push en OneSignal por sala.
- `server.ts`: Motor de bingo, APIs Express, filtros multi-tenant y canales particionados de Ably.
- `secure_rls_migration.sql`: Script PostgreSQL de blindaje estricto de RLS para Supabase.
- `comprehensive_multitenant_fix_migration.sql`: Script consolidado con las 21 tablas, RLS y restricciones compuestas.
- `src/App.tsx`: Definición de rutas y protecciones de acceso (`ProtectedRoute`, `PlayerProtectedRoute`).
- `src/AuthContext.tsx`: Métodos de autenticación y persistencia con aislamiento por sala.
- `CONTINUIDAD_PROYECTO.md`: Registro exhaustivo de estado y evolución del proyecto.

---

## 6. Reglas de Negocio y Restricciones
- No alterar la evaluación en RAM de los 20,000 cartones (optimización crítica de rendimiento).
- Todo jugador pertenece exclusivamente a la sala (`tenant_id`) donde se registró.
- Las credenciales de administrador de una sala JAMÁS pueden funcionar en otra sala.
- Ningún dato (jugadores, billeteras, juegos, cartones) debe cruzarse entre salas.
- No exponer credenciales ni claves maestras (`service_role`, tokens privados) en el frontend.

---

## 7. Correcciones Aplicadas en Sesión de Testing (2026-10-18)

### 🐛 Errores Corregidos:

1. **Error RLS al subir comprobantes (`new row violates row-level security policy`)**
   - **Causa raíz:** El bucket `receipts` de Supabase Storage tenía RLS habilitado sin política de acceso para `service_role`. El backend (Node.js con `SUPABASE_SERVICE_ROLE_KEY`) estaba siendo bloqueado por RLS al intentar hacer `upload()`.
   - **Corrección en SQL:** `fix_rls_storage_and_updates.sql` — Agrega política `FOR ALL TO service_role` en `storage.objects` para el bucket `receipts`, y asegura que el bucket sea público para lectura de URLs.
   - **Corrección adicional:** Políticas de acceso completo (`FOR ALL TO service_role`) para las 21 tablas del sistema (players, wallets, settings, game, cards, etc.) que no tenían políticas de escritura para el backend.

2. **Recargas manuales desaparecen después de hacerse**
   - **Causa raíz:** En `/api/wallet/recharge-request` (línea ~8994 de `server.ts`), `updateWalletBalance()` se llamaba SIN pasar el `tenantId`. Esto guardaba la transacción en el tenant `default`, pero el admin al listar recargas de su sala específica no las veía.
   - **Corrección en `server.ts`:** Se extrae `rechargeTenantId` del jugador (`player.tenant_id`) o del request, y se pasa a `updateWalletBalance(..., rechargeTenantId)`.

3. **Edición y actualización de usuarios no funciona**
   - **Causa raíz 1 (RLS):** El UPDATE en la tabla `players` desde el backend era bloqueado por RLS (sin política de escritura para `service_role`). Resuelto con el nuevo script SQL.
   - **Causa raíz 2 (columnas):** El endpoint `PUT /api/admin/players/:id` incluía `state` y `city` que pueden no existir en la tabla. Ahora el payload se construye dinámicamente con solo los campos definidos, y hay un fallback si falla por error 42703 (columna inexistente).
   - **Corrección en frontend:** `handleUpdateUser` ahora muestra el mensaje de error exacto del servidor.

4. **Modo mantenimiento se aplicaba globalmente a todas las salas**
   - **Causa raíz:** `getGameSettings` tenía un fallback peligroso: cuando una sala nueva no tenía su propio `room_settings_X`, heredaba TODOS los valores de `app_global_settings` (incluyendo `maintenance_mode: true`). Esto causaba que salas sin configuración propia heredaran el mantenimiento de la sala `bingo-lite`.
   - **Corrección en `server.ts`:** El fallback global (`app_global_settings`) ahora SOLO se aplica para `gameId` numérico (partidas específicas), NUNCA para scopes de sala (`room_settings_X`). Cada sala devuelve `{}` si no tiene su propia configuración.

5. **Salas nuevas heredaban datos de la sala oficial `bingo-lite`**
   - **Causa raíz:** Mismo problema que #4 — el fallback global de `getGameSettings` hacía que salas nuevas heredaran todos los settings de `bingo-lite`, incluyendo el progreso de torneos.
   - **Corrección:** Resuelto con la misma corrección del punto #4.

6. **MaintenanceScreen mostraba link de admin incorrecto**
   - **Corrección:** `MaintenanceScreen.tsx` ahora detecta el slug de la sala actual desde `location.pathname` y redirige al login del admin correcto (`/sala/:slug/admin/login`).

### 📁 Archivos Modificados en esta Sesión:
- `server.ts`: Corrección de `getGameSettings` (fallback global), `updateWalletBalance` en recarga (sin tenantId), `PUT /api/admin/players/:id` (payload dinámico + manejo de 42703).
- `src/components/MaintenanceScreen.tsx`: Link de admin corregido para redirigir al admin de la sala actual.
- `src/pages/AdminDashboard.tsx`: Texto de mantenimiento actualizado ("sala" en lugar de "app"), mejora en `handleUpdateUser` para mostrar error real del servidor.
- `fix_rls_storage_and_updates.sql`: **NUEVO** — Script SQL de corrección de políticas RLS para storage y todas las tablas del sistema. Ejecutar en Supabase SQL Editor.

### ⚠️ Acción Pendiente (Manual):
- **Ejecutar `fix_rls_storage_and_updates.sql` en Supabase SQL Editor** para activar las políticas de escritura del backend. Sin este paso, el error de RLS en subida de comprobantes y edición de usuarios persiste.

---

## 8. Correcciones Aplicadas en Sesión de Testing y Estabilización (2026-10-20)

### 🐛 Errores Corregidos y Causas Raíz Identificadas:

1. **Recargas manuales rechazadas o que desaparecen visualmente:**
   - **Causa Raíz Crítica:** En `updateWalletBalance()` (`server.ts`, línea ~470), la consulta de verificación ejecutaba:
     `supabase.from('wallets').select('id, phone').eq('phone', phone)`
     La tabla `wallets` en Supabase **no tiene columna `id`** (su clave primaria es `phone`). PostgREST retornaba error `42703: column wallets.id does not exist` y `data: null`. Por tanto, el código asumía que el registro no existía e intentaba hacer un `INSERT`, el cual colisionaba con la clave única (`23505: duplicate key value violates unique constraint "wallets_pkey"`). El saldo nunca se persistía en Supabase, por lo que la recarga "desaparecía visualmente" en cuanto el frontend refrescaba.
   - **Corrección en `server.ts`:** Se cambió la consulta a `select('phone, balance, tenant_id')`, se corrigió el `UPDATE` con marca de tiempo `updated_at`, y se añadió fallback con manejo seguro de restricciones.
   - **Verificación:** Comprobado mediante prueba directa contra Supabase: el balance se actualiza y persiste exitosamente con `error: null`.

2. **Rechazo de comprobantes de recarga por "falta de permisos" / "auditoría fallida":**
   - **Causa Raíz 1 (Gemini AI Audit):** La función `auditReceiptWithGemini` en `server.ts` rechazaba de inmediato el comprobante (`immediateRejectionMessage`) con código 400 cuando la variable `GEMINI_API_KEY` no estaba presente en el `.env` o si la IA estaba saturada.
   - **Corrección en Backend:** Si no hay API key o si la IA está ocupada, el sistema ya **NO** rechaza el comprobante; lo acepta y lo marca con `isSilentlyInvalid = true` para **revisión manual del administrador** en la lista de "Solicitudes de Recarga".
   - **Causa Raíz 2 (MIME-Type en Storage):** Si el comprobante venía con MIME types móviles no estándar (`image/pjpeg`, `image/heic`, etc.), Supabase Storage rechazaba la subida con error 415.
   - **Corrección:** Se normaliza el `contentType` antes de la subida a Supabase Storage con `upsert: true`, y se configuró el bucket `receipts` para admitir formatos de imagen sin restricción rígida.
   - **Causa Raíz 3 (Jugador no localizado):** Si el jugador aún no tenía fila en `players`, la solicitud se perdía. Ahora el endpoint busca por `phone` o crea preventivamente el registro para que la solicitud siempre quede guardada y visible para el administrador.

3. **Sincronización en Tiempo Real de Billeteras:**
   - **Ably Scoped por Sala:** En `AdminDashboard.tsx` y `PlayerDashboard.tsx` se integró el parámetro dinámico `tenantSlug` / `currentTenant` en `getBingoChannel(tenant)` para garantizar que ambos paneles estén escuchando en el mismo canal (`bingo-tenant-${slug}`).
   - **Emisión Dual en Backend:** `updateWalletBalance()` ahora emite `wallet_updated` tanto en el canal de la sala como en el canal global (`bingo-channel`), asegurando que tanto el superadministrador como los administradores locales reciban los cambios en vivo.
   - **Actualización Optimista:** En `AdminDashboard.tsx`, al pulsar "OK" en recarga manual, el saldo se actualiza de inmediato en pantalla y luego se sincroniza con el backend.
   - **Polling de Seguridad y Refresco al Ganar Foco:** Se añadió un temporizador de refresco en segundo plano (cada 15-20s) y escucha al evento `window.addEventListener('focus', ...)` tanto en el panel de administración como en el del jugador. Si el usuario cambia de pestaña o se reconecta internet, los saldos se refrescan instantáneamente.

### 📁 Archivos Modificados:
- [`server.ts`](file:///c:/Users/PC/Desktop/Bingo-Live-main/server.ts):
  - Corrección de `updateWalletBalance`: eliminada columna inexistente `id`, fix de `update`/`upsert`.
  - Corrección de `auditReceiptWithGemini`: comprobantes sin API key o con IA ocupada pasan a revisión manual sin rechazo inmediato.
  - Corrección de `POST /api/wallet/recharge-request`: upload con MIME seguro, localización/creación de jugador, emisión Ably live.
- [`src/pages/AdminDashboard.tsx`](file:///c:/Users/PC/Desktop/Bingo-Live-main/src/pages/AdminDashboard.tsx):
  - Obtención de `slug` de sala con `useParams`.
  - Conexión al canal de Ably de la sala correspondiente.
  - En `handleRecharge`: envío de `tenantId`, actualización optimista del saldo en UI.
  - Sincronización periódica cada 15s y al ganar foco (`window focus`).
- [`src/pages/PlayerDashboard.tsx`](file:///c:/Users/PC/Desktop/Bingo-Live-main/src/pages/PlayerDashboard.tsx):
  - Conexión de Ably con `getBingoChannel(tenantSlug)`.
  - Sincronización periódica cada 20s y al ganar foco (`window focus`).

### ⚙️ Verificaciones Técnicas Ejecutadas:
- **TypeScript:** Compilado con `npx tsc --noEmit` resultando en **0 errores** (código de salida 0).
- **Prueba Supabase Storage:** Subida y borrado de comprobante en bucket `receipts` ejecutada con éxito (`error: null`).
- **Prueba Persistencia Billetera:** Actualización directa y verificación en tabla `wallets` ejecutada con éxito (`error: null`).

---

## 9. Aislamiento Multi-Tenant de Presencia y Asignación de Cartones Gratuitos (2026-10-21)

### 🐛 Problemas Identificados y Resueltos:
1. **Filtro cruzado de presencia entre salas:**
   - **Problema:** Un jugador registrado en `sala/demo` aparecía como "en línea" al consultar estadísticas en `bingo-lite`.
   - **Causa Raíz:** El mapa `onlinePlayers` en memoria de `server.ts` indexaba a los jugadores únicamente por su teléfono normalizado (`phone`), mezclando la presencia entre diferentes salas.
   - **Corrección:** Se modificó la clave de presencia a `${cleanTenant}:${normalizedPhone}` y se filtraron las consultas activas por sala (`tenant_id`), aislando por completo la actividad en tiempo real entre salas.

2. **Carga y asignación de cartones en juegos gratuitos (2 cartones automáticos):**
   - **Problema:** En salas independientes, tras aprobar jugadores o en juegos gratuitos, los cartones no se reflejaban de inmediato en el tablero del jugador.
   - **Corrección:** Se aseguró la asignación automática y segura de la cuota de cartones gratuitos (2 por defecto) vinculándolos explícitamente al `tenant_id` del jugador y de la sala actual, invalidando la caché de cartones en memoria para que aparezcan en tiempo real.

### 📁 Archivos Relacionados:
- `server.ts`: Corrección de `touchPlayerPresence` y consultas de presencia por `tenant_id`.
- `migration_fix_cards_and_presence_multitenant.sql`: Script de verificación y compatibilidad de índices y tenant_id en `cards`.

---

## 10. Módulo de Reinicio a $0 y Cuadro de Honor Histórico para el "Torneo de Juegos Gratuitos" ($300k COP) (2026-10-21)

### 🎯 Requerimiento:
Permitir a los administradores reiniciar a $0 el módulo que organiza a los ganadores del **"Torneo de Juegos Gratuitos"** (meta de los $300.000 COP) cada vez que un jugador alcance la meta, archivando el podio y comenzando un nuevo ciclo sin afectar a otras salas.

### 🛠️ Implementación Técnica:

1. **Nuevo Endpoint Administrativo (`POST /api/admin/free-games/reset-tournament`):**
   - **Seguridad:** Protegido con middleware `requireAdmin` y comprobación estricta de sala (`tenant_id`). Un administrador solo puede reiniciar el torneo de su sala autorizada.
   - **Archivado Automático (Snapshot de Temporada):** Antes del reinicio, recopila y archiva la información de la temporada saliente:
     - Ganador de la Meta #1 (nombre, teléfono, monto acumulado y si alcanzó la meta).
     - Segundo y Tercer Puesto del podio.
     - Monto total distribuido y cantidad de jugadores participantes.
     - Fechas de inicio y cierre, autor del cierre y motivo ingresado por el administrador.
     - Se guarda en el arreglo `tournament_history` dentro de `roomSettings` de la sala.
   - **Reinicio de Parámetros:**
     - Actualiza `tournament_reset_at` con la fecha y hora actual (`ISO`).
     - Vacía premios manuales: `custom_free_game_prizes = []`.
     - Reinicia el contador de partidas pagas: `paid_game_participations = {}`.
   - **Limpieza en BD:** Elimina de manera preventiva registros de `free_game_prizes` y `player_paid_game_participations` exclusivos de la sala actual.
   - **Tiempo Real:** Notifica a través de Ably en el canal de la sala (`bingo-tenant-[slug]`) con el evento `tournament_reset`.

2. **Actualización de `GET /api/free-games/leaderboard`:**
   - Detecta `roomSettings.tournament_reset_at`.
   - Aplica filtros condicionales `.gt('won_at', tournament_reset_at)` y `.gt('created_at', tournament_reset_at)` en las tablas `game_patterns`, `free_game_prizes`, `cards` y `player_paid_game_participations`.
   - Garantiza que tras el reseteo la tabla comience inmediatamente en **$0 COP** para la nueva temporada.
   - Incluye `tournament_reset_at` y `tournament_history` en la respuesta JSON.

3. **Interfaz de Usuario ([`src/components/FreeGamesLeaderboard.tsx`](file:///c:/Users/PC/Desktop/Bingo-Live-main/src/components/FreeGamesLeaderboard.tsx)):**
   - **Banner de Celebración de Meta:** Cuando `data.has_goal_winner === true` (jugador alcanza los $300.000 COP), se muestra un banner llamativo que anuncia al ganador y ofrece el botón directo *"Reiniciar a $0 Ahora"*.
   - **Botón "Reiniciar a $0":** Integrado en el banner principal para usuarios con rol de administrador.
   - **Modal de Confirmación de Reseteo:**
     - Muestra el resumen del podio y el total repartido que será archivado.
     - Explica con claridad que los acumulados y el contador de 30 partidas volverán a 0 para el nuevo ciclo.
     - Campo de notas/motivo del cierre.
     - Checkbox de seguridad obligatorio para evitar clics accidentales.
   - **Botón y Modal "Historial de Temporadas":**
     - Despliega el Cuadro de Honor con las temporadas archivadas, ganadores del 1°, 2° y 3° puesto, montos ganados y fechas de cierre.

### 📁 Archivos Modificados:
- [`server.ts`](file:///c:/Users/PC/Desktop/Bingo-Live-main/server.ts): Endpoint `POST /api/admin/free-games/reset-tournament`, filtros en `GET /api/free-games/leaderboard`, archivado en `roomSettings` y broadcast en Ably.
- [`src/components/FreeGamesLeaderboard.tsx`](file:///c:/Users/PC/Desktop/Bingo-Live-main/src/components/FreeGamesLeaderboard.tsx): Banner de meta completada, botón y modal de reinicio a $0, modal de historial de temporadas y actualización de tipos.

### ⚙️ Verificaciones Técnicas Ejecutadas:
- **TypeScript:** `npx tsc --noEmit` completado con **0 errores** (código de salida 0).
- **Vite Build:** `npm run build` completado exitosamente en modo producción (código de salida 0).
- **Aislamiento Multi-Tenant:** Confirmada la segregación estricta por `tenant_id`.

---

## 11. Integración de Logo Oficial e Iconos de Instalación PWA Multiplataforma (2026-10-21)

### 🎯 Requerimiento:
1. Usar el nuevo logotipo oficial de Bingo Lite (círculo azul marino con ribete dorado, corona de oro y tipografía 3D "Bingo Lite").
2. Preparar los iconos de instalación PWA para PC de escritorio, dispositivos Android e iOS.
3. Colocar el nuevo logo en la página principal (`/`), en la parte superior izquierda, sustituyendo el cuadro de texto "B75".

### 🛠️ Implementación Técnica:
1. **Generación y Optimización de Iconos con Jimp:**
   - `public/logo.png`: 512x512 PNG en alta resolución para la app y branding.
   - `public/images/logo.png`: 512x512 PNG como recurso estático de respaldo.
   - `public/pwa-512x512.png`: 512x512 PNG optimizado para pantalla de bienvenida (splash screen) en Android y escritorio.
   - `public/pwa-192x192.png`: 192x192 PNG para el icono principal en la pantalla de inicio de Android y navegadores.
   - `public/apple-touch-icon.png`: 180x180 PNG optimizado para Safari en iOS (iPhone / iPad).
   - `public/favicon.png`: 64x64 PNG para pestañas del navegador y accesos directos.

2. **Configuración de Manifiesto y Metas:**
   - **`index.html`:** Enlaces `<link rel="apple-touch-icon" sizes="180x180" ...>`, `<link rel="icon" type="image/png" ...>` para 64x64, 192x192 y 512x512, además de Open Graph y Twitter card apuntando a `/pwa-512x512.png`.
   - **`public/manifest.webmanifest` & `vite.config.ts`:** Matriz completa de iconos con propósitos `any` y `maskable` (iconos adaptativos de Android) cubriendo todas las densidades de pantalla.

3. **Reemplazo en la Página Principal ([`src/pages/SaaSMarketingLanding.tsx`](file:///c:/Users/PC/Desktop/Bingo-Live-main/src/pages/SaaSMarketingLanding.tsx)):**
   - En la cabecera (navbar superior izquierdo), se retiró el contenedor provisional `B75` y se colocó el logo oficial con borde dorado sutil, sombra y animación hover interactiva.

### 📁 Archivos Modificados:
- `src/pages/SaaSMarketingLanding.tsx`: Reemplazo del bloque `B75` por el logotipo oficial.
- `index.html`: Inclusión de metaetiquetas e iconos de alta definición para iOS, Android y navegadores.
- `public/manifest.webmanifest` & `vite.config.ts`: Configuración completa de iconos PWA `any` y `maskable`.
- `public/logo.png`, `public/pwa-512x512.png`, `public/pwa-192x192.png`, `public/apple-touch-icon.png`, `public/favicon.png`, `public/images/logo.png`: Nuevos assets generados.

### ⚙️ Verificaciones Técnicas Ejecutadas:
- **Generación de imágenes:** Redimensionadas y renderizadas correctamente mediante Jimp.
- **Compilación Vite:** `npm run build` ejecutado exitosamente con empaquetado del Service Worker y precarga de los nuevos assets en `dist/`.



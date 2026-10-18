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

## 3. Estado del Motor de Bingo y Tareas Pendientes

### ⚙️ Diagnóstico del Motor de Bingo Autónomo (`serverAutoplay`):
- **Estado Actual:** El backend cuenta con `RoomAutoplayState` y un mapa en memoria (`roomAutoplays = new Map<string, RoomAutoplayState>()`) preparado para soportar bucles de sorteo independientes por sala.
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


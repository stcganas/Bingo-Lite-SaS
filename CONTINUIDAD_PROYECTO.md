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

---

## 3. Tareas Pendientes y Bloqueos Identificados

### ⚠️ Tareas Técnicas Pendientes:
1. **Ejecución de Migración DDL en Supabase:**
   - **Archivo:** `saas_multitenant_migration.sql`.
   - **Detalle:** La tabla `tenants` (con columnas `admin_email`, `admin_password`, `admin_name`, `contact_phone`) y las columnas `tenant_id` deben aplicarse en la base de datos de producción de Supabase. El backend actualmente opera con sincronización y fallback seguro en memoria RAM (`schema cache`).
   - **Acción requerida:** Ejecutar el script SQL en el Editor SQL de Supabase.
2. **Confirmación y Push de Cambios Locales en Git:**
   - Cambios listos para commit en el repositorio remoto `https://github.com/stcganas/Bingo-Lite-SaS.git`.
3. **Despliegue a Producción (Render.com):**
   - El archivo `render.yaml` ya se encuentra optimizado para desplegar el servicio web con `tsx server.ts`.

---

## 4. Trazabilidad de Archivos Clave

- `server.ts`: Motor de bingo autónomo, API Express, endpoints SaaS (`/api/tenants`, `/api/admin/tenant-login`), filtrado multi-tenant.
- `saas_multitenant_migration.sql`: Script PostgreSQL con tabla `tenants`, columnas de admin y restricciones compuestas únicas `(tenant_id, phone)`.
- `src/App.tsx`: Definición de rutas (`/`, `/sala/:slug`, `/sala/:slug/admin`, `/sala/:slug/admin/login`) y protección estricta `ProtectedRoute` / `PlayerProtectedRoute`.
- `src/AuthContext.tsx`: Métodos `loginTenantAdmin`, `loginPlayer` y persistencia con aislamiento por sala.
- `src/pages/AdminLogin.tsx`: Login de administración con soporte para sala específica (`/sala/:slug/admin/login`) y detección de accesos no autorizados entre salas.
- `src/pages/SaaSMarketingLanding.tsx`: Landing page con captura de credenciales del nuevo organizador y entrega de enlace directo al panel admin.
- `src/pages/Home.tsx`: Acceso seguro a salas con teléfono, contraseña y PIN de sala.
- `src/pages/PlayerDashboard.tsx`: Tablero de juego del jugador.
- `render.yaml`: Configuración de despliegue en Render.

---

## 5. Reglas de Negocio y Restricciones
- No alterar la evaluación en RAM de los 20,000 cartones (optimización crítica de rendimiento).
- Todo jugador pertenece exclusivamente a la sala (`tenant_id`) donde se registró.
- Las credenciales de administrador de una sala JAMÁS pueden funcionar en otra sala.
- Ningún dato (jugadores, billeteras, juegos, cartones) debe cruzarse entre salas.
- No exponer credenciales ni claves maestras (`service_role`, tokens privados) en el frontend.

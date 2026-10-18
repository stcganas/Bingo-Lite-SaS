# PANELES, ROLES Y PERMISOS
## Bingo Lite SaaS Multi-Tenant

Este documento establece la matriz de control de acceso, jerarquía de roles y mecanismos de aislamiento de paneles en el sistema.

---

## 1. Jerarquía de Roles del Sistema

El sistema implementa cuatro niveles diferenciados de acceso:

| Rol | Alcance | Mecanismo de Autenticación | Responsabilidades / Capacidades |
| :--- | :--- | :--- | :--- |
| **Super Administrador** | Global (todas las salas) | Supabase Auth (correo verificado en `ADMIN_EMAILS`) | Creación, suspensión y gestión de todas las salas (`tenants`), métricas globales de facturación y configuración del servidor. |
| **Administrador de Sala** | Exclusivo de su sala (`tenant_id`) | Token criptográfico HMAC (login contra `tenants.admin_password`) | Creación y activación de juegos, extracción de balotas, aprobación de recargas, gestión de revendedores locales y personalización visual. |
| **Revendedor (Seller)** | Exclusivo de su sala (`tenant_id`) | Credencial en tabla `sellers` | Venta directa de cartones a jugadores de su sala y cobro en efectivo con comisión. |
| **Jugador (Player)** | Exclusivo de su sala (`tenant_id`) | Token HMAC de jugador (`plyr.`) | Compra de cartones de su sala, visualización de tablero, cobro de bingo y recarga de saldo. |

---

## 2. Aislamiento Estricto por Sala (Tenant Isolation)

1. **Tokens HMAC y Firma del Servidor:**
   - Al iniciar sesión en `/api/admin/tenant-login`, el servidor genera un token firmado con `JWT_SECRET` que incluye el payload `{ tenant_id, email, isSuperAdmin: false }`.
   - El middleware `requireAdmin` extrae dicho token. Si `isSuperAdmin` es falso, **fuerza `req.tenantId = token.tenant_id`**.
   - Cualquier intento de un administrador de gestionar una sala diferente (`targetTenant !== token.tenant_id`) es rechazado con código HTTP `403 Forbidden`.

2. **Protección de Rutas en Frontend (`src/App.tsx`):**
   - Rutas administrativas de sala: `/sala/:slug/admin/*` protegidas por `ProtectedRoute`.
   - Rutas de jugador: `/sala/:slug/player` protegidas por `PlayerProtectedRoute`.
   - Se valida la coherencia entre el `slug` en la URL y la propiedad `tenant_id` en la sesión almacenada. Las sesiones que no coincidan con la URL son invalidadas localmente para prevenir filtrado de datos.

3. **Inmutabilidad de Parámetros:**
   - Ningún parámetro de query string (`?tenantId=...`) puede sobrescribir el `tenantId` verificado del token en peticiones autenticadas.

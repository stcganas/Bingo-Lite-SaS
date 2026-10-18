# SEGURIDAD Y PROTECCIÓN DE DATOS EN SUPABASE
## Bingo Lite SaaS Multi-Tenant

Este documento describe la arquitectura de seguridad, control de acceso basado en filas (RLS) y protección de datos implementada en Supabase para Bingo Lite SaaS.

---

## 1. Principio de Mínimo Privilegio y Modelo Zero-Trust
1. **Frontend con Clave Anónima (`anonKey`):**
   - El cliente web solo posee la clave anónima pública (`VITE_SUPABASE_ANON_KEY`).
   - Ninguna operación que involucre saldo de billetera, acreditación de premios, marcado forzado de balotas, o modificación de configuración de salas puede ejecutarse directamente desde el cliente vía la API REST de Supabase.
   - Las mutaciones críticas pasan obligatoriamente por el backend Express ([server.ts](file:///c:/Users/PC/Desktop/Bingo-Live-main/server.ts)).

2. **Backend con Clave Maestra de Servicio (`service_role`):**
   - El backend en Node.js utiliza `SUPABASE_SERVICE_ROLE_KEY` exclusivamente en el entorno del servidor.
   - Dicha clave nunca se expone en variables `VITE_*` ni se envía en bundles cliente.
   - El backend actúa como guardián validando tokens criptográficos HMAC antes de autorizar cualquier cambio en la base de datos.

---

## 2. Políticas de Seguridad RLS (Row Level Security)

Todas las 21 tablas del sistema tienen RLS activado (`ENABLE ROW LEVEL SECURITY`). Las reglas por tipo de recurso son:

### A. Información de Salas (`tenants`)
- **Lectura Pública (`SELECT`):** Permitida únicamente para metadatos públicos de la sala (nombre, slug, subdominio, colores, logotipo, banners, estado activo).
- **Protección de Credenciales:** Las columnas sensibles como `admin_password` (hash PBKDF2) y `admin_email` no deben ser accesibles directamente por clientes anónimos para prevenir recolección de hashes o ataques de fuerza bruta.
- **Escritura (`INSERT/UPDATE/DELETE`):** Restringida estrictamente al rol `service_role` (creación de salas o actualización vía endpoint administrativo).

### B. Jugadores y Billeteras (`players`, `wallets`, `wallet_transactions`, `wallet_activations`)
- **Aislamiento por Sala (`tenant_id`):** Cada jugador y cada billetera están vinculados estrictamente a un `tenant_id`.
- **Restricción de Operaciones Directas:** Ningún cliente anónimo puede ejecutar `INSERT`, `UPDATE` o `DELETE` sobre billeteras ni transacciones. Las modificaciones de saldo se realizan únicamente mediante funciones atómicas del servidor.
- **Prevención de Exposición:** Prohibido el uso de políticas `USING (true) WITH CHECK (true)` para roles anónimos o authenticated en tablas financieras.

### C. Juegos y Cartones (`game`, `cards`, `patterns`, `game_patterns`)
- **Lectura Pública Condicionada:** Los espectadores y jugadores pueden leer el estado del juego activo y las balotas extraídas de la sala en la que están participando.
- **Generación y Asignación de Cartones:** Solo el backend con rol de servicio puede generar cartones aleatorios o registrar la compra de los mismos.

---

## 3. Restricciones de Integridad y Aislamiento Multi-Tenant
- **Restricción Única Compuesta:** En la tabla `players`, la unicidad de cuenta se garantiza por la tupla `(tenant_id, phone)`:
  ```sql
  CONSTRAINT uq_players_tenant_phone UNIQUE (tenant_id, phone);
  ```
- **Integridad Referencial:** Todas las tablas secundarias (`cards`, `wallets`, `wallet_transactions`, `receipts`, `bingo_claims`) poseen clave foránea indexada apuntando a `tenants(id)` o `(tenant_id)` con comportamiento `ON DELETE CASCADE`.

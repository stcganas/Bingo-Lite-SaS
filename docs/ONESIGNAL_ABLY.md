# INTEGRACIONES EN TIEMPO REAL Y NOTIFICACIONES
## OneSignal & Ably Realtime - Bingo Lite SaaS

Este documento especifica el flujo de eventos en tiempo real y notificaciones push, garantizando el aislamiento por sala.

---

## 1. Ably Realtime: Canales Particionados

Para evitar la fuga de eventos entre diferentes salas concurrentes (sorteo de balotas, actualización de figuras ganadoras, chat y estado del juego), los canales de Ably se particionan utilizando el `tenant_id` como sufijo:

### Canales por Sala
- `bingo-live-updates-${tenantId}`: Transmisión de balotas cantadas (`ball_drawn`), cambios de estado del juego (`game_update`), y ganadores de patrones (`pattern_winner`).
- `bingo-chat-${tenantId}`: Mensajes de chat en vivo entre jugadores de la sala.
- `bingo-wallet-${tenantId}`: Notificaciones de recargas aprobadas o actualización de saldo (`wallet_updated`).

### Reglas de Suscripción en Frontend
- El frontend obtiene el `tenantId` activo desde `useTenant()` o la URL `/sala/:slug`.
- Los hooks `useAbly` y componentes de suscripción solo se suscriben a canales correspondientes a la sala actual.
- Al cambiar de ruta o desmontar el componente, se cancelan las suscripciones previas para evitar duplicidad o fuga de memoria.

---

## 2. OneSignal: Segmentación y Notificaciones Push

### Identificación y Tags
- Al autenticarse un jugador o administrador, se sincroniza el identificador con `OneSignal.login(userId)`.
- Se asignan tags obligatorios:
  - `tenant_id`: Slug o identificador de la sala a la que pertenece el usuario.
  - `role`: Rol del usuario (`player`, `seller`, `admin`).
  - `phone`: Teléfono normalizado del usuario.

### Envío de Notificaciones
- Al disparar un broadcast desde el panel de administración de una sala, el filtro de OneSignal incluye la etiqueta `tenant_id = :slug`, garantizando que solo los jugadores registrados en dicha sala reciban la notificación push.
- Se respetan los modos de mantenimiento por sala para no enviar notificaciones automáticas cuando la sala está inactiva.

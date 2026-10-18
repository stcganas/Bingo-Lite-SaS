# Instrucciones del proyecto

## Stack tecnológico
- Frontend: React + Vite.
- Lenguaje: respetar el lenguaje existente; preferir TypeScript en proyectos nuevos.
- Backend y base de datos: Supabase.
- Notificaciones push: OneSignal.
- Tiempo real: Ably.

## Antes de modificar
- Inspeccionar la estructura y el código existente.
- Identificar las funcionalidades que ya funcionan.
- Revisar los archivos y las dependencias relacionadas con cada cambio.
- No reconstruir módulos sin necesidad ni eliminar funciones existentes.
- No inventar tablas, columnas, roles o configuraciones.

## Seguridad
- Revisar Supabase Auth, políticas RLS y permisos antes de modificar operaciones protegidas.
- Separar los permisos de usuarios, administradores y superadministradores.
- Nunca confiar exclusivamente en las restricciones del frontend.
- No exponer secretos en React, variables VITE_* ni repositorios.
- Ejecutar operaciones privilegiadas en un entorno de servidor seguro.
- No realizar cambios destructivos en producción sin autorización.

## Integraciones
- Supabase es la fuente de verdad para los datos persistentes.
- Ably gestiona los eventos en tiempo real.
- OneSignal gestiona las notificaciones push.
- Proteger canales, destinatarios y credenciales.
- Evitar suscripciones duplicadas y gestionar errores de conexión.

## Documentación especializada
Antes de modificar seguridad, consultar docs/SEGURIDAD_SUPABASE.md.
Antes de modificar permisos o paneles, consultar docs/PANELES_Y_PERMISOS.md.
Antes de modificar notificaciones o tiempo real, consultar docs/ONESIGNAL_ABLY.md.

Si alguno de estos archivos no existe, indicar que falta y solicitar autorización o crearlo cuando la tarea lo permita. No asumir que sus contenidos han sido verificados.

## Calidad
- Mantener una arquitectura modular y responsive.
- Implementar estados de carga, error y ausencia de datos.
- Ejecutar las pruebas disponibles y la compilación cuando sea posible.
- No afirmar que las pruebas pasaron si no se ejecutaron.
- Informar los archivos modificados, las verificaciones realizadas y los problemas pendientes.
# 0004 — El servicio (turno) como unidad de trabajo y de análisis

- **Estado:** Aceptada
- **Fecha:** 2026-05 (commit `4c0a06c feat: añadir servicios`)
- **Afecta a:** apps/api, apps/web, modelo de datos

## Contexto

Un local de comida a domicilio trabaja por turnos (mediodía, noche) y hace **cierre de
caja** al final de cada uno. Antes de esta decisión, los pedidos se listaban por fecha, lo
que obligaba a filtrar a mano y no reflejaba cómo trabaja el local realmente.

## Opciones consideradas

1. **Filtrar por rango de fechas.** Sin conceptos nuevos, pero no representa el cierre de
   caja ni el "estamos abiertos".
2. **Jornada natural (día del calendario).** Simple, pero un turno de noche cruza la
   medianoche y quedaría partido en dos.
3. **Entidad explícita `Service`** con apertura y cierre manuales.

## Decisión

Opción 3. El `Service` es un turno con `startedAt` y `endedAt` (nulo mientras está activo),
y se convierte en el eje de toda la aplicación:

- No se pueden crear pedidos sin servicio activo (ni en local ni online).
- La tienda online se muestra abierta o cerrada según haya servicio activo.
- El listado del dashboard muestra solo el servicio activo.
- Las estadísticas se agregan por servicio.

## Consecuencias

### Positivas
- El estado "abierto/cerrado" del local es explícito y controlado por el propio local, sin
  configurar horarios.
- El cierre de servicio funciona como cierre de caja: importe total y desglose del turno.
- Los pedidos quedan agrupados como el negocio los entiende.

### Negativas / coste asumido
- **Olvidarse de cerrar el servicio** mezcla dos turnos en las estadísticas. No hay cierre
  automático ni recordatorio.
- Al cerrar, todos los pedidos no cancelados pasan a `DELIVERED`, aunque alguno no se haya
  entregado: simplifica el cierre pero falsea la tasa de entrega.
- Los pedidos online que llegan entre turnos necesitan un caso especial (se muestran
  siempre, aunque su `serviceId` no sea el activo), lo que complica la consulta de listado.
- La invariante "un solo servicio activo" se garantiza solo en la aplicación; falta el
  índice único parcial en la base de datos.

### Revisión pendiente (v1.1)
Al cerrar, preguntar qué hacer con los pedidos abiertos en vez de asumir `DELIVERED`, y
avisar si un servicio lleva más de N horas abierto.

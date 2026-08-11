# 0006 — JWT en `localStorage` sin refresh token

- **Estado:** Aceptada, **a revisar en v1.2**
- **Fecha:** 2026-04 (documentada retroactivamente el 2026-08-06)
- **Afecta a:** apps/api, apps/web, apps/print-agent

## Contexto

La aplicación se usa en tablets de mostrador y móviles durante todo un turno. Reautenticar
a mitad de servicio sería inaceptable. En el MVP se buscó la solución más simple posible.

## Opciones consideradas

1. **Cookie `httpOnly` + `SameSite`** con access token corto y refresh rotatorio.
   Es lo correcto en seguridad, pero exige gestión de CSRF, dominio compartido entre
   frontend y API, y un endpoint de refresco.
2. **JWT largo en `localStorage`.** Trivial de implementar; el token se adjunta a mano en
   cada `fetch`.

## Decisión

Opción 2: JWT de 7 días para staff y de 30 días para clientes online, guardado en
`localStorage`, enviado como `Authorization: Bearer`.

Se compensó parcialmente el riesgo: **`authMiddleware` no confía en el token para la
autorización**. En cada petición releé `BusinessUser` en la base de datos y toma de allí el
rol, de forma que revocar el acceso de un empleado surte efecto de inmediato.

## Consecuencias

### Positivas
- Implementación mínima, sin CSRF ni cookies entre dominios.
- El mismo esquema sirve al navegador y al `print-agent`.
- La revocación de acceso funciona pese a la larga vida del token.

### Negativas / coste asumido
- Un XSS en el dashboard entrega la sesión completa: no hay `httpOnly` ni CSP.
- No se puede cerrar sesión desde el servidor ni invalidar un token concreto.
- `customerAuthMiddleware` no revalida la cuenta: un token de 30 días sobrevive al borrado
  de la cuenta.
- **Un único `JWT_SECRET` firma tokens de staff y de clientes**; la separación se apoya solo
  en la forma del payload.

### Plan de revisión (v1.2)
1. Añadir `aud` al payload y verificarlo en cada middleware (barato, inmediato).
2. Secreto distinto para tokens de cliente.
3. Migrar a cookies `httpOnly` + `SameSite=Strict` con access token de 15 minutos y refresh
   rotatorio, junto con una `Content-Security-Policy` estricta.
4. Sustituir las credenciales del `print-agent` por un token de dispositivo revocable con
   permisos mínimos.

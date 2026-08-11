# 0002 — Generar ESC/POS en el servidor y transportar desde el cliente

- **Estado:** Aceptada
- **Fecha:** 2026-04 (documentada retroactivamente el 2026-08-06)
- **Afecta a:** apps/api, apps/web, apps/print-agent

## Contexto

Los locales usan impresoras térmicas de 58 y 80 mm, mayoritariamente clones genéricos
chinos con conexión USB o Bluetooth. El servidor está en la nube y **no puede ver la
impresora**; el navegador sí, mediante WebUSB o Web Bluetooth. Vender un TPV propietario o
exigir instalar drivers habría matado la propuesta de valor ("usa la impresora que ya
tienes").

## Opciones consideradas

1. **Maquetar en el cliente (JavaScript en el navegador).** Sin viaje al servidor, pero la
   lógica del ticket (logo rasterizado, QR, anchos, página de códigos) se duplicaría en
   cada transporte y sería imposible de probar.
2. **Servidor de impresión obligatorio en cada local.** Fiable, pero exige instalación y
   soporte en cada cliente; frena la venta autoservicio.
3. **Servidor maqueta, cliente transporta.** El backend devuelve un `Uint8Array` ESC/POS y
   quien pueda lo empuja a la impresora.

## Decisión

Opción 3. `POST /api/orders/:id/print` devuelve el buffer ESC/POS completo con
`Content-Type: application/octet-stream`, y existen tres transportes intercambiables:
WebUSB, Web Bluetooth y el agente local con CUPS.

## Consecuencias

### Positivas
- Una sola implementación de la maquetación (`printer.service.ts`), probada y evolucionable.
- Logo y QR se rasterizan en el servidor con Jimp y `qrcode`; el cliente no necesita
  librerías gráficas.
- Añadir un transporte nuevo (por ejemplo, impresión por red TCP 9100) no toca la
  maquetación.
- El mismo endpoint sirve al navegador y al agente local.

### Negativas / coste asumido
- Cada impresión exige un viaje al servidor: sin conexión no se imprime.
- El buffer viaja por la red (decenas de KB con logo y QR).
- `printedAt` se marca en el servidor **antes** de saber si el papel salió realmente.
- La compatibilidad de endpoints USB de las impresoras genéricas obligó a un bucle de
  descubrimiento en el cliente (ver [06-impresion.md](../06-impresion.md)).

### Qué haría falta para revertirla
Reimplementar la maquetación en el cliente y mantener dos versiones sincronizadas. No
merece la pena.

# 06 — Impresión térmica ESC/POS

Es la funcionalidad más diferencial del producto y la que más incidencias genera en campo.
Léelo entero antes de tocar `printer.service.ts` o el código de transporte.

## 1. Principio de diseño

> **El servidor maqueta; el cliente transporta.**

El backend genera un **buffer binario ESC/POS completo** (texto, negritas, líneas, imágenes
rasterizadas, corte de papel). El navegador o el agente local solo lo empujan a la
impresora sin interpretarlo. Ventajas: una única implementación de la maquetación,
soporte de logo y QR como imagen, y cero drivers en el puesto.

Ver [ADR 0002](adr/0002-impresion-escpos-servidor.md).

## 2. Generación del ticket (`apps/api/src/services/printer.service.ts`)

Librería: `@point-of-sale/receipt-printer-encoder` v3 (sucesor de `thermal-printer-encoder`,
que sigue en `package.json` sin usarse).

```ts
new ReceiptPrinterEncoder({
  language: 'esc-pos',
  columns: lineWidth,           // 32 (58 mm) | 48 (80 mm)
  codepageMapping: 'epson',
  codepageCandidates: ['cp858'],
})
```

| Papel | Columnas | Dots/línea | QR |
|-------|----------|-----------|-----|
| 58 mm | 32 | 384 | 160 px |
| 80 mm | 48 | 576 | 240 px |

### Estructura del ticket

```
[logo opcional, centrado, máx. 256 px de ancho]
NOMBRE DEL LOCAL (negrita, centrado)
dirección · Tel: teléfono
────────────────────────────
CLIENTE
Nombre : …
Tel    : …
Dir    : …
Pedido : #ÚLTIMOS8CARACTERES     ← identificador humano del pedido
Fecha  : dd/mm/aaaa hh:mm
Entrega: hh:mm                    (si hay estimación)
────────────────────────────
ARTICULOS
2x Pizza Margherita
   10,50 EUR            21,00 EUR
════════════════════════════
Subtotal / IVA / Envío (nombre de tarifa) / TOTAL
────────────────────────────
Forma de pago: Efectivo|Tarjeta
Entrega cliente / CAMBIO         (solo efectivo con cashGiven)
NOTAS: …
────────────────────────────
[QR de /tracking/{token}] + URL en texto
"Gracias por su pedido!"  + corte
```

### Detalles que parecen bugs y no lo son

- **`sanitize()` elimina tildes, ñ, ¡¿ y €.** Muchas impresoras genéricas ignoran el
  `ESC t` de selección de página de códigos y renderizan basura. Se sacrifica ortografía a
  cambio de legibilidad garantizada. El símbolo € se sustituye por `EUR`.
- **La zona horaria está fija a `Europe/Madrid`** en `formatDate`/`formatTime`. Es correcto
  hoy (mercado España) y **hay que parametrizarlo por `Business` antes de vender fuera**.
- **Las imágenes se difuminan con el algoritmo `atkinson`**, que da mejor resultado que
  el umbral simple en impresoras de 203 dpi.
- Si el logo (`business.logoUrl`) no se puede descargar, se registra un aviso y **el ticket
  se imprime sin logo**; no falla. Con el QR ocurre igual: se cae a imprimir la URL en texto.

### Marca de impresión

`POST /api/orders/:id/print` actualiza `printedAt`. Se hace **antes** de que el buffer
llegue a la impresora, así que un fallo de transporte deja el pedido marcado como impreso
aunque no haya salido papel (relevante para el `print-agent`, que filtra por `notPrinted`).

## 3. Transportes

Hay **tres** vías, seleccionables en Ajustes → `Business.printerMode`:

| Modo | Dónde vive | Navegador | Estado |
|------|-----------|-----------|--------|
| `webusb` | Navegador → USB | Chrome/Edge escritorio | ✅ Predeterminado |
| `bluetooth` | Navegador → BLE | Chrome Android / Chrome-Edge escritorio | ✅ Desde el parche del 2026-08-06 |
| `printserver` | `apps/print-agent` → CUPS | cualquiera | ✅ Funcional, requiere instalar el agente |

> Hasta el 6 de agosto de 2026, elegir "📶 Bluetooth" en Ajustes devolvía **400** porque el
> esquema Zod de `PATCH /api/settings` solo aceptaba `'webusb' | 'printserver'`. Ya está
> corregido. Recuerda que **el backend sigue ignorando `printerMode`**: quien decide el
> transporte es el frontend.

### 3.1 WebUSB (`printViaWebUSB`)

```ts
navigator.usb.requestDevice({ filters: [{ classCode: 0x07 }, { classCode: 0xFF }] })
```

`0x07` es la clase estándar *Printer*; `0xFF` (vendor-specific) cubre las impresoras chinas
genéricas que no se declaran como impresora.

Después **descubre y prueba todos los endpoints BULK OUT** de todas las interfaces y
alternate settings, y añade como último recurso las combinaciones `(iface 0, ep 1)` y
`(iface 0, ep 2)`. Prueba una a una hasta que un `transferOut` funciona. Este bucle es la
solución al problema histórico de "la impresora se detecta pero no imprime"
(commits `a83956d` / `65d74e2`).

**Restricciones inevitables de WebUSB:**

- Solo Chrome/Edge (no Firefox, no Safari, no iOS).
- Requiere **contexto seguro** (HTTPS o `localhost`).
- Requiere **gesto del usuario**: `requestDevice()` debe llamarse desde un clic. No se
  puede imprimir automáticamente al recibir un pedido online.
- El permiso se concede **por dispositivo y por origen**, y el diálogo de selección
  aparece cada vez que no hay dispositivo ya autorizado.
- En Linux hace falta una regla `udev`; en Windows a veces hay que sustituir el driver por
  WinUSB con Zadig.

### 3.2 Bluetooth (`printViaBluetooth`)

Web Bluetooth con los UUID del perfil serie más habitual en impresoras POS:

| Servicio | Característica |
|----------|----------------|
| `000018f0-0000-1000-8000-00805f9b34fb` | `000018f1-...` |
| `e7810a71-73ae-499d-8c15-faa9aef0c3f2` (alt.) | `bef8d6c9-...` |

Envía el buffer en **trozos de 200 bytes con 20 ms de pausa** usando
`writeValueWithoutResponse`, para no desbordar el buffer BLE. Mantiene el dispositivo
conectado entre impresiones en variables de módulo y se reconecta si se pierde el GATT.

### 3.3 Agente local (`apps/print-agent`)

Para locales donde el navegador no sirve (Firefox, iPad, impresora de red compartida) o
donde se quiere impresión automática sin clic.

```
login (email+password+slug) → cada 5 s:
  GET /api/orders?status=PENDING&notPrinted=true&limit=10
  POST /api/orders/:id/print → buffer
  escribir a /tmp/print-agent-*.bin → lp -d $PRINTER_NAME -o raw
```

Variables de entorno:

```
PRINT_AGENT_API_URL=https://api.tudominio.com
PRINT_AGENT_EMAIL=admin@local.com
PRINT_AGENT_PASSWORD=…
PRINT_AGENT_BUSINESS_SLUG=mi-local
PRINT_AGENT_POLL_INTERVAL_MS=5000
PRINTER_NAME=Printer_USB_Printer_P     # nombre en CUPS: lpstat -p
```

Puesta en marcha:

```bash
cd apps/print-agent && npm install && npm run build && npm start
```

**Limitaciones actuales:** solo imprime pedidos en estado `PENDING`; guarda la contraseña
en claro en el `.env`; no reintenta un pedido que ya quedó marcado como impreso; no hay
servicio de sistema (launchd/systemd) preparado.

## 4. Guía de resolución de incidencias

> **Antes de diagnosticar, activa el registro detallado** en el equipo del local desde la
> consola del navegador (F12) y vuelve a imprimir:
> ```js
> localStorage.setItem('debugPrint', '1')   // desactivar: localStorage.removeItem('debugPrint')
> ```
> Verás la lista de interfaces/endpoints probados y cuál funcionó.

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| "WebUSB no soportado" | Firefox/Safari/iOS | Usar Chrome o instalar el `print-agent` |
| El diálogo no muestra la impresora | Se declara como clase vendor y el sistema la tiene tomada | Ya se filtra `0xFF`; en Windows, Zadig → WinUSB; en Linux, regla udev |
| Se detecta pero no sale papel | Endpoint incorrecto | El bucle de candidatos ya lo cubre; mirar consola: `[WebUSB] Probando iface=… ep=…` |
| `NetworkError: unable to claim interface` | El driver del sistema ocupa la interfaz | Quitar la cola de impresión del sistema, o usar el agente local |
| Caracteres raros (`Ã±`) | Página de códigos | Ya se normaliza en `sanitize()`; ampliar si aparece un carácter nuevo |
| El ticket sale con líneas cortadas | `paperWidth` mal configurado | Ajustes → 58/80 mm |
| Bluetooth: "no se encontró el servicio" | UUID distinto | Añadir el par servicio/característica del modelo a la lista |
| El agente no imprime | Token caducado o nombre de impresora erróneo | `lpstat -p` y revisar `PRINTER_NAME`; el agente re-autentica solo al recibir 401 |
| Se imprime dos veces | Reimpresión manual + agente | El agente solo mira `printedAt`; evita mezclar los dos modos en el mismo local |

## 5. Cómo probar cambios sin impresora

1. Llama a `POST /api/orders/:id/print` con `curl` y guarda el binario:
   ```bash
   curl -s -X POST -H "Authorization: Bearer $TOKEN" \
     http://localhost:4000/api/orders/<id>/print -o /tmp/comanda.bin
   ```
2. Inspecciona el contenido legible: `strings /tmp/comanda.bin`
3. Si tienes CUPS con una impresora virtual: `lp -d <cola> -o raw /tmp/comanda.bin`
4. Para validar la maquetación visualmente, existen emuladores ESC/POS online a los que se
   les puede subir el `.bin`.

> Cuando exista suite de tests, la prioridad nº 1 es un **snapshot test del buffer** para
> 58 y 80 mm: es código sin cobertura, difícil de probar a mano y que rompe en campo.

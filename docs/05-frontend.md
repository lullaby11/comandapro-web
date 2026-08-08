# 05 — Frontend (`apps/web`)

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 (instalado) · lucide-react ·
react-hot-toast. Salida `standalone`, desplegado en AWS Amplify con SSR.

## 1. Mapa de rutas

```
/                              → redirect a /login
/login                         Login de staff (email + password + slug del local)
/register                      Alta de local nuevo (crea Business + OWNER)
/dashboard                     Home: KPIs del día + accesos rápidos + últimos pedidos
/dashboard/orders              Listado y gestión de pedidos del servicio activo
/dashboard/orders/new          ⭐ Flujo de nueva comanda en 3 pasos
/dashboard/products            CRUD de productos y stock
/dashboard/customers           Clientes del local + cuentas online pendientes
/dashboard/stats               Estadísticas: servicios, clientes, productos, categorías, periodos
/dashboard/settings            Configuración del local, impresión, tarifas de envío
/tracking/[token]              🔓 Seguimiento público del pedido (destino del QR)
/[slug]/pedidos                🔓 Tienda online del local (catálogo + cuenta de cliente)
```

`/dashboard/*` comparte `layout.tsx` con la barra lateral. Las rutas públicas no.

## 2. Patrones vigentes (importante antes de tocar código)

### 2.1 Todo son Client Components

Cada página empieza con `'use client'`. No se usa Server Components, ni Server Actions, ni
`fetch` en servidor. Motivo histórico: el token vive en `localStorage` y se necesita en
cada llamada.

### 2.2 Llamadas a la API

```ts
const API = '';                       // ← relativo: lo resuelve el rewrite de next.config.ts

function apiHeaders() {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

const res = await fetch(`${API}/api/orders`, { headers: apiHeaders() });
```

Este bloque está **duplicado en todas las páginas del dashboard**. No hay cliente HTTP
centralizado, ni manejo unificado de 401, ni tipos compartidos con el backend.
→ Primera refactorización recomendada: `src/lib/api.ts`. Ver
[11-deuda-tecnica.md](11-deuda-tecnica.md#p2-cliente-api).

### 2.3 Sesión

| Clave de `localStorage` | Contenido |
|-------------------------|-----------|
| `token` | JWT de staff |
| `user` | `{id, name, email, role}` serializado |
| `business` | `{id, name, slug}` serializado |
| `customer_session_{slug}` | Sesión de cliente online (token + nombre + email + dirección) |

No hay guardia de ruta: si el token falta o caduca, las llamadas devuelven 401 y la página
se queda vacía o muestra un toast; **el usuario no es redirigido a `/login` de forma
consistente**. El logout limpia las tres claves de staff.

### 2.4 Estado

`useState` + `useEffect` + `useCallback` por página. No hay React Query, SWR, Zustand ni
Context. Los datos se recargan llamando de nuevo a la función de carga (`loadOrders()`).

### 2.5 Refresco de pedidos

`/dashboard/orders` recarga por intervalo (polling). No hay WebSocket ni SSE, así que un
pedido online tarda hasta un ciclo de polling en aparecer.

### 2.6 Notificaciones

`react-hot-toast`, configurado en `app/layout.tsx` con los colores de marca. Usa
`toast.success` / `toast.error` en vez de `alert()`.

## 3. Estilos y design system

### Fuente de verdad: `src/app/globals.css` (514 líneas)

Variables HSL de marca **Olyda**:

```css
--bg: 207 85% 7%;        /* fondo casi negro azulado */
--surface: 207 75% 11%;
--surface2: 207 60% 16%;
--border: 207 40% 22%;
--primary: 25 100% 51%;  /* #ff6a03 naranja — CTAs */
--accent: 207 100% 40%;  /* #004177 azul corporativo */
--success: 142 71% 45%;
--danger: 0 84% 60%;
--warning: 38 92% 50%;
--text: 0 0% 98%;
--muted: 207 20% 65%;
--radius: 0.75rem;
```

Uso: `background: hsl(var(--surface))`, `color: hsl(var(--primary))`,
`background: hsl(var(--primary) / 0.15)` para fondos translúcidos.

**Tema oscuro único.** No hay modo claro.

### Convención actual: estilos inline

La mayor parte del layout se escribe con `style={{ ... }}` inline y solo el chrome
(sidebar, nav, tarjetas, media queries) usa clases de `globals.css`. Tailwind está
instalado pero apenas se usa.

> **Decisión pendiente**: unificar en Tailwind o en clases CSS. Mientras no se decida,
> **sigue el estilo del fichero que estés tocando** en lugar de introducir un tercer
> sistema. Propuesta en [12-roadmap.md](12-roadmap.md).

### Responsive

Tres breakpoints en `globals.css`:

| Ancho | Comportamiento de la barra lateral |
|-------|-----------------------------------|
| `>= 1024px` | Barra lateral completa con etiquetas |
| `640–1023px` (tablet) | Barra lateral estrecha, solo iconos |
| `< 640px` (móvil) | Barra horizontal fija (navegación tipo pestañas) y contenido a pantalla completa |

El objetivo de uso es **tablet en horizontal sobre el mostrador**; el móvil es para el
repartidor consultando estados.

## 4. Flujo de nueva comanda (`/dashboard/orders/new`, ~1.100 líneas)

Componente único con máquina de pasos `Step = 1 | 2 | 3`:

| Paso | Qué hace | Detalles de implementación |
|------|----------|----------------------------|
| **0** | Comprueba servicio activo | Si no hay, bloquea con botón "Iniciar servicio" |
| **1 — Cliente** | Busca por teléfono (exacto) o nombre (`contains`) con desplegable de sugerencias; alta inline si no existe | `GET /api/customers/by-phone/:phone` y `GET /api/customers?name=` |
| **2 — Productos** | Categorías + buscador + carrito con +/−; si falta stock, modal para reponer sin salir del flujo | `PATCH /api/products/:id` |
| **3 — Pago y envío** | Recogida/reparto, tarifa de envío, efectivo/tarjeta, efectivo entregado (calcula cambio), hora estimada por minutos o por hora concreta | Convierte minutos a `estimatedDeliveryAt` ISO |
| **Fin** | `POST /api/orders` → `POST /api/orders/:id/print` → WebUSB | Ver [06-impresion.md](06-impresion.md) |

**Objetivo de UX: menos de 30 segundos.** Cualquier cambio en esta pantalla debe medirse
contra ese objetivo (cronometrar el flujo con un pedido de 3 líneas antes y después).

## 5. Listado de pedidos (`/dashboard/orders`, ~920 líneas)

- `STATUS_CONFIG`: mapa estado → etiqueta, color, icono y **siguiente estado**, que alimenta
  el botón de avance de un solo clic.
- Regla especial: si `READY` y `isPickup`, el siguiente estado es `DELIVERED` (se salta
  `OUT_FOR_DELIVERY`).
- Los `RECEIVED_ONLINE` se ordenan primero y se destacan en morado con contador.
- Barra superior: iniciar/cerrar servicio, filtros por estado, total facturado del servicio.
- Botón de reimpresión por pedido y borrado con confirmación.

## 6. Tienda online (`/[slug]/pedidos`, ~890 líneas)

Pasos: carga del negocio → autenticación del cliente (login/registro/verificación por
`?verify=token`) → catálogo → carrito → confirmación. La sesión se guarda en
`customer_session_{slug}`, de modo que un cliente puede tener sesiones simultáneas en
varios locales.

Si `serviceActive` es `false`, se muestra el local como cerrado y no se permite pedir.

## 7. Accesibilidad y calidad (estado actual)

| Aspecto | Estado |
|---------|--------|
| Navegación por teclado | Parcial: los botones son `<button>`, pero hay `div`s clicables |
| Etiquetas de formulario | Inconsistente: muchos `input` con `placeholder` en vez de `<label>` |
| Contraste | Bueno en general (tema oscuro con texto casi blanco) |
| `alt` en imágenes | Presente en el logo; faltan en imágenes de producto |
| Foco visible | Definido para inputs, no para todos los botones |
| Tamaño táctil | Adecuado (pensado para tablet) |

Objetivo para v1.2: pasar `eslint-plugin-jsx-a11y` y auditoría Lighthouse ≥ 90.

## 8. Guía para añadir una pantalla nueva

1. Crea `src/app/dashboard/<seccion>/page.tsx` con `'use client'`.
2. Añade la entrada en `navItems` de `dashboard/layout.tsx` con un icono de lucide.
3. Reutiliza `apiHeaders()` (o, mejor, migra esa página al futuro `src/lib/api.ts`).
4. Usa las variables CSS de marca; nada de colores literales nuevos.
5. Estados vacíos, de carga y de error explícitos — es una app que se usa con prisa.
6. Comprueba a 375 px, 768 px y 1280 px antes del PR.

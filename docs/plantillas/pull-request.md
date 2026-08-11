# Plantilla — Pull Request

## Qué cambia

Una o dos frases. Si necesitas más, probablemente el PR es demasiado grande.

Issue relacionado:

## Por qué

## Cómo se ha probado

- [ ] `npx tsc --noEmit -p apps/api/tsconfig.json`
- [ ] `npx tsc --noEmit -p apps/web/tsconfig.json`
- [ ] `npm run lint --workspace=web`
- [ ] Tests (cuando existan): `npm test`
- [ ] Prueba manual (describe los pasos exactos):

## Checklist

### Siempre
- [ ] Toda consulta nueva filtra por `businessId`
- [ ] Toda entrada externa se valida con Zod (`safeParse`)
- [ ] Los mensajes de la interfaz están en español
- [ ] No hay `console.log` de depuración ni credenciales en el código
- [ ] Documentación actualizada (indica cuál)

### Según lo tocado
- [ ] **Modelo de datos:** migración Prisma generada (`migrate dev`), compatible hacia atrás
- [ ] **API:** `docs/04-api-reference.md` actualizado; no se rompe el contrato existente
- [ ] **Dinero:** los totales cuadran (`total = subtotal + tax + shippingCost`)
- [ ] **Stock:** comprobado el descuento y la restauración
- [ ] **Impresión:** buffer verificado en 58 y 80 mm
- [ ] **Frontend:** revisado a 375 px, 768 px y 1280 px; estados de carga, vacío y error
- [ ] **Permisos:** las rutas sensibles llevan `requireAdmin`
- [ ] **Decisión estructural:** ADR añadido en `docs/adr/`

## Riesgo de despliegue

- [ ] Bajo — solo frontend o cambios aislados
- [ ] Medio — cambia comportamiento de la API
- [ ] Alto — migración de datos o cambio en impresión / pedidos

> Recuerda: cualquier merge a `main` que toque `apps/api/**` **despliega a producción**.

## Capturas / vídeo

(Obligatorio si cambia la interfaz.)

# Plantilla — Checklist de release

Versión: `vX.Y.Z` · Fecha: · Responsable:

## 1. Antes de fusionar a `main`

- [ ] Todos los PR de la versión revisados y fusionados en la rama de release
- [ ] `tsc --noEmit` limpio en api y web
- [ ] Lint limpio
- [ ] Tests en verde (cuando existan)
- [ ] `CHANGELOG.md` actualizado con la fecha real y los cambios agrupados
- [ ] Versiones de `package.json` alineadas
- [ ] Documentación afectada actualizada (`docs/`)
- [ ] Si hay migración: revisada la sentencia SQL generada y confirmado que es compatible
      hacia atrás

## 2. Ventana de despliegue

- [ ] **No desplegar en hora de servicio** (evitar 13:00–16:00 y 20:00–23:30 hora peninsular)
- [ ] Avisar a los locales activos si el cambio es de riesgo alto

## 3. Despliegue

- [ ] Merge a `main` → el workflow crea el snapshot de RDS y despliega la API
- [ ] Anotar aquí el `SNAPSHOT_ID` y el `SHA` anterior que muestra el resumen del workflow:
  - Snapshot:
  - SHA anterior:
- [ ] Amplify ha compilado el frontend correctamente

## 4. Verificación posterior (humo)

- [ ] `GET /health` responde `ok`
- [ ] Login con un usuario real
- [ ] Abrir servicio → crear pedido de prueba → comprobar descuento de stock
- [ ] Imprimir la comanda de prueba en impresora real
- [ ] Comprobar el QR de tracking en el móvil
- [ ] Si hay tienda online: cargar `/{slug}/pedidos` y ver el catálogo
- [ ] Borrar el pedido de prueba y comprobar que el stock vuelve
- [ ] Revisar CloudWatch: sin errores nuevos en los 15 minutos siguientes

## 5. Si algo va mal

```bash
./scripts/rollback.sh <SHA_ANTERIOR>
# y solo si la base de datos está corrupta:
./scripts/rollback.sh <SHA_ANTERIOR> <SNAPSHOT_ID>
```

- [ ] Rollback ejecutado y verificado
- [ ] Incidencia documentada: qué falló, por qué no se detectó antes, qué test lo evitaría

## 6. Cierre

- [ ] Etiqueta de git creada: `git tag vX.Y.Z && git push --tags`
- [ ] Roadmap actualizado (`docs/12-roadmap.md`)
- [ ] Deuda técnica revisada: quitar lo resuelto, añadir lo nuevo

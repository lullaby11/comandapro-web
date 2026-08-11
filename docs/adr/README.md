# Decisiones de arquitectura (ADR)

Un ADR (*Architecture Decision Record*) documenta **una decisión estructural, su contexto y
sus consecuencias**. Sirve para que dentro de un año se entienda por qué algo está hecho
así, sin arqueología de commits.

## Cuándo escribir uno

- Se añade o se quita una pieza de infraestructura (base de datos, cola, proveedor cloud).
- Cambia el modelo de datos de forma transversal.
- Cambia el protocolo o el transporte de impresión.
- Se elige entre dos librerías o enfoques con consecuencias a largo plazo.
- Se decide **no** hacer algo por un motivo que conviene recordar.

Si la decisión se revierte en una tarde, no hace falta ADR.

## Cómo

1. Copia [`template.md`](template.md) a `NNNN-titulo-en-kebab-case.md` con el siguiente número.
2. Estado inicial `Propuesta`; pasa a `Aceptada` al fusionar el PR.
3. Una decisión nunca se borra ni se reescribe: se marca `Sustituida por [NNNN]` y se
   escribe la nueva.

## Índice

| # | Título | Estado |
|---|--------|--------|
| [0001](0001-monorepo-turborepo.md) | Monorepo con npm workspaces y Turborepo | Aceptada |
| [0002](0002-impresion-escpos-servidor.md) | Generar ESC/POS en el servidor y transportar desde el cliente | Aceptada |
| [0003](0003-multitenant-columna-discriminadora.md) | Multi-tenant con columna discriminadora | Aceptada |
| [0004](0004-servicio-como-unidad-de-trabajo.md) | El servicio (turno) como unidad de trabajo y análisis | Aceptada |
| [0005](0005-aws-apprunner-amplify-rds.md) | Despliegue en AWS App Runner + Amplify + RDS | Aceptada |
| [0006](0006-jwt-en-localstorage.md) | JWT en `localStorage` sin refresh token | Aceptada, **a revisar** |

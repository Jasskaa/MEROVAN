---
tipo: indice
id: IDX-08
estado: activo
responsable: owner
creado: 2026-11-04
actualizado: 2026-11-04
tags: [inicio]
---

# Reportes

En una frase: informes semanales (REP-AAAA-SNN) y mensuales (REP-AAAA-MM), en parte generados por la app.

- [[REP-2026-S45]]

## Notas de esta carpeta
```base
filters:
  and:
    - file.inFolder("08-REPORTES")
    - file.name != "_Índice"
views:
  - type: table
    name: Notas
    order:
      - file.name
      - tipo
      - estado
      - responsable
      - actualizado
```

← [[Home]]

---
tipo: indice
id: IDX-05
estado: activo
responsable: owner
creado: 2026-11-04
actualizado: 2026-11-04
tags: [inicio]
---

# Canales

En una frase: configuración y normas de la web propia, TikTok Shop e Instagram/Meta.

Pendiente: una nota por canal con cuentas, comisiones vigentes (con fecha de revisión) y políticas.

## Notas de esta carpeta
```base
filters:
  and:
    - file.inFolder("05-CANALES")
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

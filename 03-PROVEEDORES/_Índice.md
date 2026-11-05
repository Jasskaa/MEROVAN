---
tipo: indice
id: IDX-03
estado: activo
responsable: owner
creado: 2026-11-04
actualizado: 2026-11-04
tags: [inicio]
---

# Proveedores

En una frase: fichas de proveedor (PRV), muestras (MUE), incidencias y comparativas.

- Cómo pedir muestra: [[SOP-0002 Pedir una muestra]]

## Notas de esta carpeta
```base
filters:
  and:
    - file.inFolder("03-PROVEEDORES")
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

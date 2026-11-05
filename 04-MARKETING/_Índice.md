---
tipo: indice
id: IDX-04
estado: activo
responsable: owner
creado: 2026-11-04
actualizado: 2026-11-04
tags: [inicio]
---

# Marketing

En una frase: creatividades, guiones, creadores, campañas y calendario.

- Cómo lanzar un test: [[SOP-0004 Lanzar un test]]

## Notas de esta carpeta
```base
filters:
  and:
    - file.inFolder("04-MARKETING")
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

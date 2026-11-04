---
tipo: indice
id: IDX-10
estado: activo
responsable: owner
creado: 2026-11-04
actualizado: 2026-11-04
tags: [inicio]
---

# Recursos

En una frase: plantillas, adjuntos (logo, capturas, PDFs) y referencias.

- Plantillas en `10-RECURSOS/Plantillas` (ver [[Guía de la bóveda]])
- Logo: ![[logo-merovan.webp|200]]

## Notas de esta carpeta
```base
filters:
  and:
    - file.inFolder("10-RECURSOS")
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

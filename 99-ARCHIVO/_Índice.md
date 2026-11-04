---
tipo: indice
id: IDX-99
estado: activo
responsable: owner
creado: 2026-11-04
actualizado: 2026-11-04
tags: [inicio]
---

# Archivo

En una frase: lo cerrado; nada se borra sin confirmación.



## Notas de esta carpeta
```base
filters:
  and:
    - file.inFolder("99-ARCHIVO")
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

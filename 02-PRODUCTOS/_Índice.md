---
tipo: indice
id: IDX-02
estado: activo
responsable: owner
creado: 2026-11-04
actualizado: 2026-11-04
tags: [inicio]
---

# Productos

En una frase: una nota por producto; la subcarpeta indica la fase del embudo.

- Tablero: [[Embudo de productos]]
- Cómo validar: [[SOP-0001 Validar un producto]]

## Notas de esta carpeta
```base
filters:
  and:
    - file.inFolder("02-PRODUCTOS")
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

## Generado por la app
<!-- merovan:auto:start -->
| Producto | Estado |
|---|---|
| [[PRD-0001 Rodillo quitapelos reutilizable]] | Idea |
| [[PRD-0002 Rodillo quitapelos reutilizable (pack de 2)]] | Idea |
| [[PRD-0003 Kit para guardar la Navidad]] | Idea |
<!-- merovan:auto:end -->

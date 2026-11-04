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
- Ejemplo: [[PRD-0001 Organizador de cables (EJEMPLO)]]

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
| [[PRD-0001 Organizador de cables (EJEMPLO)]] | En test |
| [[PRD-0002 Lámpara de lectura recargable]] | Candidato |
| [[PRD-0003 SyncParty]] | Idea |
<!-- merovan:auto:end -->

---
tipo: indice
id: IDX-06
estado: activo
responsable: owner
creado: 2026-11-04
actualizado: 2026-11-04
tags: [inicio]
---

# Operaciones

En una frase: pedidos, soporte, devoluciones y procedimientos (SOP).

- [[SOP-0001 Validar un producto]]
- [[SOP-0002 Pedir una muestra]]
- [[SOP-0003 Publicar una ficha]]
- [[SOP-0004 Lanzar un test]]
- [[SOP-0005 Decidir escalar, arreglar o matar]]
- [[SOP-0006 Gestionar una devolución]]
- [[SOP-0007 Cerrar el mes]]

## Notas de esta carpeta
```base
filters:
  and:
    - file.inFolder("06-OPERACIONES")
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

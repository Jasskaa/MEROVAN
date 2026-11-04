---
tipo: indice
id: IDX-09
estado: activo
responsable: owner
creado: 2026-11-04
actualizado: 2026-11-04
tags: [inicio]
---

# Equipo

En una frase: roles, reuniones, notas diarias y semanales, onboarding.

## Roles
- **Producto y proveedores** · **Contenido** · **Paid media** · **Operaciones y soporte** · **Finanzas y legal** · **Sistema**
Cada rol tiene un dueño (pendiente de asignar).

## Notas de esta carpeta
```base
filters:
  and:
    - file.inFolder("09-EQUIPO")
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

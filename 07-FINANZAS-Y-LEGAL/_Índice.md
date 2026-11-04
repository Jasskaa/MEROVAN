---
tipo: indice
id: IDX-07
estado: activo
responsable: owner
creado: 2026-11-04
actualizado: 2026-11-04
tags: [inicio]
---

# Finanzas y legal

En una frase: cumplimiento, IVA/OSS, gastos, gestoría y GPSR. Información de apoyo: la valida la gestoría.

- Checklist de cumplimiento en el [[Cuadro de mando]]
- Cierre mensual: [[SOP-0007 Cerrar el mes]]

## Notas de esta carpeta
```base
filters:
  and:
    - file.inFolder("07-FINANZAS-Y-LEGAL")
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

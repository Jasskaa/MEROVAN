---
tipo: indice
id: IDX-01
estado: activo
responsable: owner
creado: 2026-11-04
actualizado: 2026-11-04
tags: [inicio]
---

# Estrategia

En una frase: visión, nichos, mercado, roadmap y decisiones de negocio (ADR).

- [[Roadmap]]
- Decisiones: [[ADR-0001 Tienda web propia en lugar de Shopify]]
- [[Historial de decisiones]] (escalar / arreglar / matar, generado por la app)
- [[Investigación de productos noviembre 2026]]: análisis, números y fuentes de los primeros productos
- Mapa del flujo: [[Flujo MEROVAN.canvas|Flujo MEROVAN]]

## Notas de esta carpeta
```base
filters:
  and:
    - file.inFolder("01-ESTRATEGIA")
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

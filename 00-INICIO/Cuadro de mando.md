---
tipo: indice
id: INI-CUADRO
estado: activo
responsable: owner
creado: 2026-11-04
actualizado: 2026-11-04
tags: [inicio]
---

# Cuadro de mando

En una frase: vista rápida del estado de MEROVAN; las tablas se actualizan solas (plugin del núcleo **Bases**).

> Los números reales (ROAS, gasto, pedidos) están en la app. Aquí se ve el estado y las decisiones.

## Productos por estado
```base
filters:
  and:
    - tipo == "producto"
views:
  - type: table
    name: Productos
    order:
      - file.name
      - estado
      - decision
      - puntuacion
      - margen_contribucion
      - roas_equilibrio
      - responsable
```

## Decisiones pendientes (escalar / arreglar / matar)
```base
filters:
  and:
    - tipo == "producto"
    - decision != "esperar"
    - estado != "descartado"
views:
  - type: table
    name: Decisiones
    order:
      - file.name
      - decision
      - motivo_decision
      - actualizado
```

## Muestras pendientes
```base
filters:
  and:
    - tipo == "muestra"
    - estado == "pedida"
views:
  - type: table
    name: Muestras
    order:
      - file.name
      - responsable
      - creado
```

## Alternativa con Dataview (si está instalado)
````
```dataview
TABLE estado, decision, puntuacion, margen_contribucion, roas_equilibrio
FROM "02-PRODUCTOS"
WHERE tipo = "producto"
SORT estado ASC
```
````

## Checklist de cumplimiento
- [ ] Aviso legal, términos, privacidad, cookies en la web
- [ ] Política de envíos y devoluciones (14 días)
- [ ] Alta OSS (si se vende fuera de España)
- [ ] TikTok Shop verificado; GPSR/DSA
- [ ] Datos GPSR en cada ficha publicada

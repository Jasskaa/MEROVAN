---
tipo: sop
id: SOP-0005
estado: activo
responsable: owner
creado: 2026-11-04
actualizado: 2026-11-04
tags: []
---

# SOP-0005 Decidir escalar, arreglar o matar

En una frase: cómo convertir los resultados del test en una decisión registrada.

## Reglas (por defecto, editables en la app)
- **ESCALAR:** ROAS ≥ objetivo, ≥ 10 pedidos, tendencia estable 3 días. +20-30 % cada 2-3 días; duplicar campaña ganadora.
- **ARREGLAR:** CTR > 1,5 % con pocas ventas (página/oferta); muchos carritos sin compra (checkout/envío); ROAS entre equilibrio y objetivo (AOV, precio, coste). Un cambio cada vez.
- **MATAR:** tope superado; CPA > 3 × equilibrio; CTR < 0,5 % tras 3+ creatividades; 20+ variantes sin ángulo; devoluciones altas; margen ≤ 0.
- **ESPERAR:** pocos datos.
## Pasos
1. Revisar la recomendación de la app y sus métricas en la reunión semanal.
2. Aceptar o rechazar con motivo.
3. Actualizar `decision` y `motivo_decision` en la nota del producto y su historial.
4. Si se mata: mover a `05-Descartados` con aprendizaje.
## Relacionado
[[SOP-0004 Lanzar un test]]

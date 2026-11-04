# ROADMAP — MEROVAN: agencia online de productos (web propia + TikTok Shop)

Fecha de inicio propuesta: semana del 9 de noviembre de 2026. Duración: 12 semanas.
Principio rector: **decidir con números, no con intuición**. Cada producto vive o muere por su margen real y su ROAS de equilibrio.

---

## 0. Resumen del modelo

1. Descubrir productos con demanda real.
2. Validar margen y proveedor (con muestra) ANTES de gastar en anuncios.
3. Publicar en web propia + TikTok Shop.
4. Generar contenido (orgánico + creadores + anuncios).
5. Medir, y decidir cada producto: **ESCALAR / ARREGLAR / MATAR**.
6. Operar bien: envíos, soporte, devoluciones, contabilidad.

Embudo realista: de 20 candidatos, ~8 pasan validación, ~4 se testean con anuncios, ~1 escala. Presupuesto y expectativas deben reflejarlo.

---

## 1. Decisiones que hay que tomar la semana 0

| Decisión | Opciones | Recomendación inicial |
|---|---|---|
| Forma jurídica | Autónomo / SL | SL si sois varios socios (reparto claro, responsabilidad limitada). Consultar gestoría. |
| Web | Shopify / WooCommerce / a medida | Shopify para salir rápido y conectar TikTok Shop. El sistema interno (backoffice) sí es a medida. |
| Mercado inicial | España / UE | España primero (idioma, IVA, logística). Ampliar con "Sell Across Europe" cuando haya producto ganador. |
| Modelo logístico | Dropshipping / stock en 3PL | Dropshipping con proveedores de almacén en UE al principio; 3PL cuando un producto escale. |
| Nicho | 2-3 categorías | Elegir por margen, tamaño, baja tasa de devolución y potencial visual. |
| Reparto de roles | Ver sección 2 | Un responsable claro por área. |
| Presupuesto | Ver sección 7 | Definir tope total y tope por test ANTES de empezar. |

---

## 2. Roles del equipo

- **Producto y proveedores:** investigación, muestras, negociación, stock.
- **Contenido y creatividad:** guiones, vídeos, creadores, edición.
- **Paid media:** TikTok Ads, Meta Ads, estructura de campañas, lectura de datos.
- **Operaciones y soporte:** pedidos, tracking, devoluciones, atención al cliente.
- **Finanzas y legal:** gestoría, IVA/OSS, facturas, conciliación.
- **Sistema/automatización (backoffice):** ver `PROMPT-CLAUDE-CODE.md`.

Con 2-3 personas, una persona puede llevar varios roles, pero cada rol tiene un dueño.

---

## 3. Fases

### FASE 0 — Cimientos (semanas 1-2)
**Objetivo:** poder vender legalmente y cobrar.
- [ ] Constituir sociedad o alta de autónomo; gestoría contratada.
- [ ] Cuenta bancaria, Stripe/PayPal, métodos de pago locales (tarjeta, Bizum si aplica, Apple/Google Pay).
- [ ] Nombre, marca, dominio, correo profesional, identidad visual básica.
- [ ] Cuentas: TikTok Shop Seller Center, TikTok Ads, Meta Business Manager, Instagram, TikTok, Google Analytics/GA4, Merchant Center.
- [ ] Páginas legales: aviso legal, términos, privacidad (RGPD), cookies (consentimiento), política de envíos y de devoluciones (14 días de desistimiento).
- [ ] Alta en OSS (ventanilla única de IVA) si se venderá a otros países UE; modelos 303/390 en España.
- [ ] Requisitos de TikTok Shop UE: GPSR (seguridad de producto, datos del fabricante/responsable) y DSA.
- [ ] Plantilla de seguimiento de costes (ver `PROMPT-CLAUDE-CODE.md`, calculadora de margen).
**Hito:** puedes recibir un pedido de prueba real y emitir factura.

### FASE 1 — Nicho y producto (semanas 2-4)
**Objetivo:** lista priorizada de 10-15 productos candidatos.
- [ ] Elegir 2-3 categorías (no "un producto ganador" suelto).
- [ ] Fuentes de demanda: TikTok (volumen y fecha de vídeos, comentarios, "dónde se compra"), Google Trends (estabilidad), librerías de anuncios (Meta y TikTok Creative Center), tiendas competidoras, listas de más vendidos en marketplaces.
- [ ] Puntuar cada candidato (scorecard, sección 4).
- [ ] Descartar: marcas con licencia (riesgo de propiedad intelectual), productos regulados (cosmética sin CPNP, juguetes sin CE, electrónica sin CE/RAEE, suplementos con declaraciones de salud), frágiles, tallas complicadas, baratos con envío caro.
**Hito:** 10-15 candidatos puntuados, 5-8 pasan a validación de proveedor.

### FASE 2 — Proveedores y muestras (semanas 3-5)
**Objetivo:** proveedor fiable con márgenes reales.
- [ ] Por producto: mínimo 2-3 proveedores comparados (BigBuy, Spocket, CJ Dropshipping con almacén UE, Syncee, proveedores directos).
- [ ] **Pedir muestras** desde el mismo almacén que se usará. Medir: plazo real, embalaje, calidad, parecido con las fotos.
- [ ] Verificar: certificado CE/GPSR, factura con IVA, dirección de devoluciones en la UE, política de reposición.
- [ ] Segundo proveedor de respaldo para cada producto.
- [ ] Calcular margen real (sección 5).
**Hito:** 3-5 productos con proveedor validado, margen de contribución suficiente y muestra recibida.

### FASE 3 — Tienda y fichas (semanas 4-6)
**Objetivo:** tienda lista para convertir.
- [ ] Shopify en español, tema rápido, ficha de producto con imágenes y vídeo propios, FAQ, plazos reales, devoluciones claras.
- [ ] Sincronización de catálogo a TikTok Shop (y a Meta Catalog).
- [ ] Fichas con datos GPSR por producto.
- [ ] Email transaccional + flujo de carrito abandonado.
- [ ] Píxeles/eventos: Meta Pixel + Conversions API, TikTok Pixel + Events API, GA4. Verificar deduplicación.
- [ ] Prueba de compra completa y de devolución.
**Hito:** compra de prueba de extremo a extremo en web y en TikTok Shop.

### FASE 4 — Contenido y creatividad (semanas 5-7)
**Objetivo:** banco de creatividades por producto.
- [ ] Por producto: 5-10 vídeos con ganchos distintos (problema, demostración, antes/después, comparación, prueba social real, unboxing).
- [ ] Formato nativo vertical, subtítulos, primeros 1-2 segundos con "efecto wow".
- [ ] Creadores: programa de afiliados/muestras de TikTok Shop; mensajes de contacto personalizados.
- [ ] Honestidad: sin reseñas ni testimonios inventados; etiquetar contenido generado por IA según las reglas de la plataforma; sin promesas de salud/resultados no verificables.
- [ ] Biblioteca: cada creatividad con id, gancho, producto, creador, plataforma y resultados.
**Hito:** 20+ creatividades listas y etiquetadas.

### FASE 5 — Test de producto (semanas 6-9)
**Objetivo:** decidir con datos qué producto tiene recorrido.
- [ ] Antes del test: ROAS de equilibrio y CPA de equilibrio calculados, **tope de gasto por test** fijado por escrito.
- [ ] Test en TikTok primero (CPM más barato), orgánico y TikTok Shop en paralelo; Meta después.
- [ ] 3-5 creatividades por producto en campaña de test (presupuesto por conjunto de anuncios, no automatizado a ROAS).
- [ ] Ventana de decisión (7-14 días). Reglas ESCALAR/ARREGLAR/MATAR en sección 6.
- [ ] Registro de decisión: cada producto acaba con una entrada "decisión + motivo + fecha".
**Hito:** 1-2 productos "escalables", el resto arreglados o descartados.

### FASE 6 — Escalado y operaciones (semanas 9-12)
**Objetivo:** crecer sin romper la operación.
- [ ] Escalar presupuesto gradualmente (+20-30 % cada 2-3 días mientras el ROAS aguante).
- [ ] Refresco continuo de creatividades antes de que caiga el rendimiento.
- [ ] Valorar stock propio/3PL o FBT (Fulfilled by TikTok) para el producto ganador.
- [ ] Soporte: respuesta en menos de 24 h, plantillas, gestión de devoluciones y de disputas.
- [ ] Control de chargebacks (tracking, descripciones claras, reembolso rápido).
- [ ] Cierre mensual: conciliación de pedidos con proveedor, comisiones, IVA, beneficio real.
- [ ] Segundo mercado (Sell Across Europe) solo si el primero es rentable y estable.
**Hito:** beneficio neto positivo y mensual medido; procesos documentados.

---

## 4. Scorecard de producto (0-5 por criterio)

1. **Demanda** (volumen y tendencia en TikTok/Google Trends, no solo un pico).
2. **Visual** (se entiende el beneficio en 1-2 segundos).
3. **Problema real** (resuelve algo concreto).
4. **Margen** (precio de venta − todos los costes ≥ objetivo).
5. **Competencia** (cuántos anuncios activos y cuánto tiempo llevan).
6. **Logística** (peso, fragilidad, plazo del proveedor, tasa de devolución esperada).
7. **Riesgo legal** (CE, GPSR, marcas, salud, cosmética).
8. **Recompra / valor de pedido** (accesorios, packs, upsell).

Umbral sugerido: pasar a validación con ≥ 28/40 y sin ninguna puntuación de "riesgo legal" menor que 3.

---

## 5. Economía unitaria (calcular siempre antes de testear)

```
Margen de contribución por pedido =
  Precio de venta (sin IVA)
  − Coste de producto
  − Envío
  − Comisión de plataforma (TikTok Shop: 9 % desde enero 2026 en España; promoción de 4 % durante 60 días para vendedores nuevos, verificar en Seller Center)
  − Comisión de pasarela de pago
  − Provisión de devoluciones/reembolsos (p. ej. 5-10 %)
  − Otros costes (embalaje, apps)

CPA de equilibrio  = Margen de contribución por pedido
ROAS de equilibrio = Precio de venta (con el mismo criterio de IVA) ÷ Margen de contribución
ROAS objetivo      = ROAS de equilibrio × 1,3-1,5
Presupuesto de test por producto = 3 a 5 × CPA de equilibrio
```

Importante: usar siempre el precio **sin IVA** en todos los cálculos o con IVA en todos; no mezclar.

---

## 6. Reglas de decisión (configurables)

**ESCALAR** si, tras la ventana de test:
- ROAS ≥ ROAS objetivo con un mínimo de pedidos (p. ej. ≥ 10) y la tendencia es estable.
- Acción: subir presupuesto 20-30 % cada 2-3 días; duplicar la campaña ganadora en lugar de editarla bruscamente; preparar nuevas creatividades.

**ARREGLAR** si:
- CTR bueno (> 1,5 %) y CPC razonable pero pocas ventas → problema de página, precio u oferta.
- Muchos "añadir al carrito" pero pocas compras → checkout, envío, confianza.
- ROAS entre equilibrio y objetivo → mejorar AOV (packs, upsell), subir precio, bajar coste.
- Acción: un cambio cada vez, nueva ventana de test.

**MATAR** si:
- Se supera el tope de gasto sin cumplir criterios.
- CPA > 3 × el de equilibrio sin mejora.
- CTR bajo (p. ej. < 0,5 %) tras 3+ creatividades distintas.
- 20+ variantes de creatividad sin que ningún ángulo funcione.
- Tasa de devolución o de reclamaciones por encima del umbral.
- Acción: despublicar, liquidar stock si lo hay, registrar el motivo en el historial.

---

## 7. Presupuesto (rangos orientativos, ajustar)

- Constitución, gestoría, dominio, herramientas: coste de arranque + cuotas mensuales.
- Muestras: 3-5 proveedores × 5 productos.
- Test de anuncios: entre ~300 y ~1.000 € por producto en dos semanas (referencia de mercado). Con 5 productos, 1.500-5.000 € solo en test.
- Creatividad: creador, edición, herramientas.
- Colchón para devoluciones y reembolsos.
- **Regla:** no comprometer más dinero del que se puede perder entero durante los primeros 3 meses.

---

## 8. KPIs por semana (panel semanal)

- Por producto: gasto, ingresos, pedidos, CPA, ROAS, AOV, CTR, CPC, tasa de conversión, tasa de devolución.
- Por canal: web vs TikTok Shop (ingresos, comisión, margen).
- Operaciones: plazo medio de entrega, % entregados a tiempo, tickets abiertos, tiempo de respuesta, reembolsos, disputas.
- Negocio: beneficio de contribución, beneficio neto, caja disponible.

Ritmo: revisión diaria breve (gasto/ROAS), reunión semanal de decisiones (escalar/arreglar/matar), cierre mensual.

---

## 9. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Producto sin demanda real | Validar con datos y test pequeño; matar rápido |
| Envíos lentos → reembolsos y chargebacks | Almacén UE, muestras, tracking, plazos honestos |
| Dependencia de un proveedor | Segundo proveedor por producto |
| Dependencia de TikTok (comisiones/políticas) | Web propia + lista de emails + Meta |
| Problemas legales (CE, GPSR, marcas, publicidad engañosa) | Checklist por producto; sin claims médicos; sin copias de marcas |
| Cierre de cuenta de anuncios | Cumplir políticas; no inventar reseñas; etiquetado IA; no evadir revisión |
| Márgenes que desaparecen | Calcular siempre con comisión, devoluciones y fees |
| Fatiga de creatividad | Pipeline continuo de vídeos nuevos |
| Mezclar dinero personal y de la empresa | Cuenta propia, contabilidad mensual |

---

## 10. Checklist "listo para lanzar el primer producto"

- [ ] Sociedad/alta, banco, pasarela, gestoría.
- [ ] Legal de la web completo; GPSR/DSA por producto.
- [ ] Muestra recibida y aprobada; proveedor de respaldo.
- [ ] Margen y ROAS de equilibrio calculados; tope de test escrito.
- [ ] Ficha de producto con vídeo propio; plazos reales.
- [ ] Píxeles y eventos verificados; compra de prueba hecha.
- [ ] 5+ creatividades listas; calendario de publicación.
- [ ] Soporte preparado (plantillas, buzón, responsable).
- [ ] Panel de control con las métricas de la sección 8.

---

## 11. Nota importante

Los datos de plataformas (comisiones, países, políticas, requisitos) cambian con frecuencia. Antes de cada decisión importante, comprobar el Seller Center de TikTok, las políticas de Meta/TikTok Ads y la normativa vigente con la gestoría. Este roadmap no sustituye asesoramiento legal o fiscal.

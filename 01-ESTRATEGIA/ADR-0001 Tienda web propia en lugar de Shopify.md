---
tipo: adr
id: ADR-0001
estado: activo
responsable: owner
creado: 2026-11-04
actualizado: 2026-11-04
tags: [canal/web]
decidido_por: owner
fecha_decision: 2026-11-04
---

# ADR-0001 Tienda web propia en lugar de Shopify

En una frase: MEROVAN construye su propia tienda online y su propio panel de gestión (tipo Shopify) en lugar de usar Shopify.

## Contexto
El [[Roadmap]] recomendaba Shopify para salir rápido. El equipo prefiere controlar toda la plataforma: tienda, panel de ventas, dinero, visitas, carrito y subida sencilla de productos.

## Opciones
- **Shopify:** rápido, pero cuota mensual + comisiones de apps y menos control.
- **WooCommerce:** barato, pero mantenimiento y plugins de terceros.
- **A medida (elegida):** todo en una sola app (tienda + backoffice) sobre Next.js + Supabase.

## Decisión
Tienda y panel propios dentro de la app de `_sistema/`. Los pagos se delegan en **Stripe** (Checkout alojado): MEROVAN nunca ve ni guarda datos de tarjeta. TikTok Shop sigue siendo el segundo canal.

## Consecuencias
- (+) Sin cuota de Shopify; un único sistema para tienda, catálogo, pedidos, márgenes y decisiones.
- (−) Más trabajo de desarrollo: carrito, checkout, emails, SEO, rendimiento y seguridad son responsabilidad nuestra.
- (−) La salida al mercado es más lenta; la tienda pasa a ser una fase propia del plan.
- Integraciones a revisar: TikTok Shop (sin conector nativo de Shopify), píxeles de Meta/TikTok con eventos de servidor propios.
- Legal: páginas legales, cookies y política de devoluciones en nuestra web (validar con gestoría).

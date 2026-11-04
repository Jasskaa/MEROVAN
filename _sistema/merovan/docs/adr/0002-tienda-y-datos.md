# ADR 0002 — Tienda propia, RPC públicas y tests sin Docker

- **Tienda propia en la misma app** (ver ADR-0001 de la bóveda): un solo sistema para catálogo, pedidos, márgenes y decisiones.
- **Pagos con Stripe Checkout alojado**: la tarjeta nunca toca nuestros servidores (PCI SAQ A). El pedido se crea antes del pago
  con precios de la BD y solo el webhook firmado lo marca como pagado.
- **API pública por RPC**: el visitante anónimo no tiene permisos sobre tablas; solo puede llamar a funciones que validan la sesión
  y los productos publicados. Evita depender de la clave de servicio en la tienda.
- **Tests de BD con PGlite**: Postgres en WebAssembly dentro de Vitest; reconstruye la BD desde las migraciones en cada ejecución
  sin Docker. Las migraciones de Storage (solo existen en Supabase) se omiten.
- **Métricas por CSV antes que API**: las exportaciones son estables y no requieren permisos sobre cuentas publicitarias.
- **Campañas sin «ad sets»**: modelo simplificado campaña → anuncio; las métricas se asignan por los códigos `PRD-`/`CRE-` en los nombres.

# Integraciones

Todas se pueden usar en **modo manual** (formulario o CSV), así que si una API falla o cambia, el negocio no se para.
Los valores de plataformas (comisiones, plazos) están en *Ajustes* con su fecha de revisión: compruébalos en la fuente oficial.

| Integración | Estado | Credenciales | Permisos mínimos | Si falla |
|---|---|---|---|---|
| **Supabase** (BD, login, archivos) | Conectada | URL + clave publicable (`.env.local`); clave secreta solo en servidor | — | La app muestra el aviso «Falta conectar Supabase» |
| **Stripe** (cobros web) | Lista, sin claves | *Developers → API keys*: `sk_test_…`; webhook en *Developers → Webhooks* → `whsec_…` | Clave restringida con escritura en *Checkout Sessions* y lectura de *Charges* | Los pedidos quedan «pendiente de pago»; nada se cobra |
| **TikTok Shop** (pedidos, catálogo) | Manual | Seller Center → app de partner (cuando haya API) | Solo lectura de pedidos; fichas en borrador | Registrar pedidos a mano en *Pedidos*; catálogo con *Productos → Exportar CSV* |
| **TikTok Ads** (métricas) | CSV | — (exportación de informes) | Solo lectura de informes; **nunca** permisos sobre presupuestos | *Marketing → Importar* con mapeo editable |
| **Meta Ads** (métricas) | CSV | — | Igual que TikTok Ads | Igual |
| **Obsidian** | Conectada (local) | Ruta de la bóveda (`VAULT_PATH`) | Escritura solo en notas de producto, informes, historial y zonas automáticas de los índices | *Sistema* muestra «no accesible»; exportar desde el equipo con la bóveda |

## Stripe paso a paso (modo prueba)
1. Crea la cuenta en stripe.com y quédate en **modo prueba**.
2. Copia la clave secreta `sk_test_…` en `STRIPE_SECRET_KEY` (en el archivo, no en el chat).
3. Webhook local: instala Stripe CLI y ejecuta `stripe listen --forward-to localhost:5190/api/stripe/webhook`; copia el `whsec_…` a `STRIPE_WEBHOOK_SECRET`.
4. Compra de prueba con la tarjeta `4242 4242 4242 4242`: el pedido debe pasar a «pagado» y bajar el stock.
5. En producción: webhook a `https://<dominio>/api/stripe/webhook` con los eventos `checkout.session.completed` y `checkout.session.async_payment_succeeded`.

## Límites y reintentos
- Importación CSV: máximo 5 MB por archivo; volver a subir el mismo periodo actualiza, no duplica.
- Tienda: 60 cambios de carrito por minuto y 10 intentos de pago cada 10 minutos por visitante; login: 10 intentos cada 15 minutos por IP.
- Webhook de Stripe: si la BD falla responde 500 y Stripe reintenta; marcar como pagado es idempotente.
- Tarea diaria: un reintento automático; el resultado queda en *Sistema*.

## Siguiente paso (cuando haya volumen)
Adaptadores por API de solo lectura (TikTok Shop pedidos, informes de TikTok/Meta Ads) detrás de la misma interfaz que el CSV.
Proveedores (BigBuy, CJ…) con API: catálogo y envío de pedidos, siempre con confirmación humana.

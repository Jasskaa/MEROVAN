---
tipo: guia
id: INI-REVISION-2026-11-06
estado: activo
responsable: owner
creado: 2026-11-06
actualizado: 2026-11-06
tags: [inicio]
---

# Revisión de MEROVAN para Claude Code

En una frase: revisión externa del pago, el stock y la dirección de envío, y registro de lo corregido.

Fecha 2026-11-06. Proyecto local C:\Users\jasma\Desktop\ClaudeCode\MEROVAN.
Versión revisada main, commit 2a808a99937a2ff5664882b6b23c6e71c6667640.

## Estado y encargo

Las correcciones están pendientes. Este informe recoge una revisión del código y dos reproducciones SQL locales. No certifica el funcionamiento de producción. Lee las instrucciones del repositorio y verifica el código actual antes de editar. Conserva los cambios locales ajenos. Todas las rutas de código siguientes parten de _sistema/merovan.

## 1. Crítico. Un segundo intento de pago elimina el pedido del primer enlace

En supabase/migrations/20261104000006_store.sql, checkout_create_order elimina los pedidos pendientes del carrito en la línea 87. src/app/(tienda)/actions.ts crea una nueva sesión de Stripe para cada intento sin cerrar la anterior.

La versión vigente de mark_order_paid está en supabase/migrations/20261104000009_operations.sql. Si el pedido ya no existe, retorna sin error. src/lib/payments.ts lo considera confirmado y src/app/api/stripe/webhook/route.ts responde con éxito.

Reproducción confirmada en PGlite con migraciones y seed del proyecto

1. Añadir un producto al carrito A.
2. Ejecutar checkout_create_order(A) y guardar su ID.
3. Ejecutar checkout_create_order(A) otra vez.
4. Ejecutar mark_order_paid con el primer ID.
5. No se produce error y consultar el primer pedido devuelve cero filas.

No se usó Stripe real en esta reproducción. El efecto observado es que la confirmación SQL de un pedido eliminado se pierde silenciosamente.

Corrección requerida

- Conservar la relación entre pago, sesión de Stripe y pedido.
- Reutilizar pedido y sesión cuando corresponda. Usar idempotencia estable al crear sesiones.
- Cubrir doble clic y concurrencia entre procesos, no solo deshabilitar un botón.
- Si cambia el carrito, cerrar correctamente la sesión anterior y gestionar un pago que se esté completando.
- Registrar y tratar un pago para un pedido inexistente sin reconocerlo silenciosamente como procesado.
- Validar importe, moneda y sesión contra el pedido.
- Recuperarse de fallos entre crear el pedido, llamar a Stripe y guardar la respuesta.
- Mantener compatibilidad con pedidos anteriores y webhooks duplicados.

Pruebas necesarias de reintento, sesión antigua, doble confirmación, fallo parcial y concurrencia.

## 2. Alto. Dos compradores pueden pagar la última unidad

cart_set comprueba stock al añadir al carrito, pero checkout_create_order no reserva unidades. mark_order_paid usa greatest(stock - quantity, 0), ocultando la falta de stock.

Reproducción confirmada en PGlite

1. Fijar stock de ORG-3 a una unidad.
2. Añadir una unidad a dos carritos distintos antes de cobrar.
3. Crear ambos pedidos.
4. Confirmar ambos mediante mark_order_paid.
5. Ambos quedan pagados y el stock termina a cero.

Corrección requerida

- Reservar stock transaccionalmente antes de permitir el pago, con bloqueos o actualizaciones condicionales.
- No basta con comprobar stock desde TypeScript ni rechazar el webhook después del cobro.
- Definir vencimiento y liberación de reservas por abandono, error y expiración.
- Resolver la carrera entre expiración y confirmación, y los pagos asíncronos si se admiten.
- Evitar descuentos o liberaciones duplicadas.
- Proteger frente a reservas abusivas e indefinidas mediante funciones públicas.

Pruebas necesarias para dos compradores con una unidad, reserva vencida, liberación repetida y pago durante la expiración.

## 3. Alto. No se guarda la dirección de entrega en MEROVAN

src/app/(tienda)/actions.ts, línea 66, pide dirección a Stripe.
src/lib/payments.ts, líneas 11 a 17, solo transmite nombre, correo y país. El esquema revisado de orders no conserva la dirección completa.

Corrección requerida

- Consultar tipos y documentación oficial de la versión usada de Stripe para extraer la dirección de envío correcta, que puede diferir de la dirección de facturación.
- Guardar destinatario, calle, segunda línea, ciudad, provincia, código postal y país. Conservar teléfono cuando esté disponible y sea necesario para entregar.
- Mostrar los datos a los roles autorizados en el detalle del pedido.
- No exponerlos en order_lines, función accesible públicamente.
- Actualizar exportación y anonimización de datos personales para las nuevas columnas.
- Admitir campos opcionales y pedidos antiguos sin dirección.

Pruebas de dirección de envío distinta de facturación, datos ausentes, pedidos antiguos y permisos.

## 4. Medio. Mensajes de compra y correo que no corresponden al estado real

src/app/(tienda)/pedido/[id]/page.tsx, líneas 24 a 33.

- paid = o.status !== "pendiente_pago" considera pagados también cancelados y reembolsados.
- ?pagado=1 basta para mostrar Gracias por tu compra aunque el servidor no haya confirmado el cobro.
- La página afirma que se envió correo aunque ese flujo no lo envía. La documentación del proyecto señala la integración de correo como pendiente.
- Un pedido pendiente sin ese parámetro dice que los pagos no están activados, incluso si Stripe sí está configurado.

Corrección requerida

Mostrar estados explícitos para pendiente, pagado, enviado, entregado, cancelado y reembolsado. El parámetro de retorno solo debe iniciar una comprobación con Stripe. Afirmar que se envió correo únicamente si hay confirmación real de envío. Mientras tanto, retirar esa afirmación. El reintento debe usar el flujo corregido del problema 1.

Pruebas de pedido pendiente con ?pagado=1, cancelado, reembolsado y confirmado.

## Migraciones y despliegue

Añadir migraciones nuevas. No resolverlo únicamente editando SQL ya aplicado.
Revisar las definiciones vigentes porque algunas funciones están reemplazadas en migraciones posteriores.
Probar reconstrucción local y compatibilidad con datos existentes. Coordinar nuevas firmas SQL con la versión de la app.
Documentar por separado cambios locales y migraciones realmente aplicadas en remoto.
La documentación indica que local y Vercel comparten base de datos. Usar datos aislados para pruebas destructivas.
No activar pagos reales ni realizar gastos durante este encargo.

## Comprobaciones ya realizadas

- Lint y TypeScript pasaron.
- La primera ejecución de npm test pasó 128 pruebas y omitió 17 al superar el tiempo del hook de inicialización.
- npm test -- --maxWorkers=1 --hookTimeout=60000 pasó las 145 pruebas de los 19 archivos.
- Las reproducciones SQL adicionales confirmaron los problemas 1 y 2 pese a pasar la suite.
- No se ejecutaron build, Playwright ni una compra real en Stripe.
- El E2E de carrito se omite si no hay productos con stock. Un resultado verde con saltos no demuestra el checkout.

Después de corregir, ejecutar tipos, lint, regresiones y suite completa. Ejecutar build y E2E según las instrucciones del repositorio usando datos aislados. Realizar compra de extremo a extremo en Stripe de pruebas si existe configuración. Registrar cualquier verificación bloqueada.

## Credenciales pendientes de confirmar

00-INICIO/Estado del proyecto.md indicaba que SUPABASE_SERVICE_ROLE_KEY y CRON_SECRET se compartieron por chat y quedaba pendiente renovarlas. No se verificó si ya se renovaron. Confirmar con el propietario. No copiar secretos al informe, logs o commits ni marcar la rotación como hecha sin evidencia.

## Entrega esperada

1. Código y migraciones que resuelvan los cuatro problemas.
2. Pruebas de regresión para los fallos descritos.
3. Actualizar este mismo documento con archivos modificados, decisiones y resultados exactos.
4. Indicar qué quedó solo local, qué migraciones se aplicaron y qué requiere configuración externa.
5. Resumen breve para Jaska con la ruta final del informe.

## Registro de correcciones

Hecho por Claude Code el 06/11/2026 sobre `main` (commit de partida 2a808a9). Los cuatro hallazgos se comprobaron
contra el código actual antes de editar y los cuatro eran ciertos. No había cambios locales ajenos que conservar.

### Estado de cada problema

| Problema | Código local | Pruebas locales | Remoto (Supabase `merovan-dev`) | Vercel |
|---|---|---|---|---|
| 1. Reintento de pago | Corregido | En verde | Migración aplicada | Ver «Despliegue» |
| 2. Última unidad | Corregido | En verde | Migración aplicada | Ver «Despliegue» |
| 3. Dirección de envío | Corregido | En verde | Migración aplicada | Ver «Despliegue» |
| 4. Mensajes del pedido | Corregido | En verde (lógica pura) | No aplica | Ver «Despliegue» |

**Actualización 06/11/2026 (confirmado por Jaska): aplicado en remoto.**
- Migración `checkout_reservas_direccion` aplicada en `merovan-dev` con `apply_migration`. Su SQL es el del archivo 17, sin algunos comentarios.
- Permisos comprobados en remoto con `has_function_privilege`:
  - `anon` solo puede ejecutar `checkout_prepare` y `checkout_create_order`.
  - `confirm_order_payment`, `mark_order_paid`, `checkout_attach_session`, `release_*` y `apply_retention`
    no están permitidas ni a `anon` ni a `authenticated`.
- `get_advisors` (seguridad): el único aviso nuevo es `checkout_prepare` ejecutable por `anon`, que es intencionado.
  Queda añadido a la lista de avisos aceptados en `docs/seguridad.md`. El resto de avisos ya existían.
- Commit y push a `main` hechos después. El resultado del despliegue está en la sección «Despliegue», al final.
Consulta de solo lectura en remoto (06/11/2026): 0 pedidos y última migración aplicada `content_agents` (16).
La nueva migración entraría sin conflictos con los datos actuales.

### Qué se ha cambiado y por qué

Migración nueva: `_sistema/merovan/supabase/migrations/20261106000017_checkout_reservas_direccion.sql`.
No se ha editado ninguna migración anterior. Las funciones vigentes de las migraciones 6, 9 y 11 se reemplazan aquí.

1. **Reintentos de pago (problema 1).**
   - Nunca se borra un pedido. `checkout_prepare(sesión)` bloquea el carrito (`for update`), así que el doble clic,
     dos pestañas o dos servidores se ejecutan uno tras otro.
     - Si el carrito no ha cambiado y la reserva sigue viva, **reutiliza el pedido y su sesión de Stripe**.
     - Si el carrito ha cambiado, **cancela** el pedido anterior (`cancel_reason = 'reemplazado'`), libera su stock
       y devuelve su sesión para que la app la cierre en Stripe (`sessions.expire`).
   - Índice único `orders_one_pending_per_cart`: como mucho un pedido pendiente por carrito, también entre procesos.
   - Relación pedido ↔ sesión: columnas `stripe_session_id` (única) y `stripe_session_url`.
     - Las guarda `checkout_attach_session`, que solo se ejecuta en el servidor y no pisa una sesión ya guardada.
     - Idempotencia estable al crear la sesión: `merovan-checkout-<pedido>`.
     - Si la app falla entre Stripe y la base de datos, el siguiente intento reutiliza el pedido y Stripe devuelve la misma sesión.
   - `confirm_order_payment(...)` sustituye a `mark_order_paid`.
     - Valida que el pedido existe, que la sesión es la suya, y el importe y la moneda (EUR).
     - Es idempotente ante webhooks repetidos (`ya_pagado`).
     - Si llega un segundo cobro distinto, lo marca como `pago_duplicado`.
   - Todo lo que no se puede aplicar se **registra en la tabla nueva `payment_events`** y se ve en Panel → Pedidos →
     «Pagos por revisar»: pedido inexistente, importe, sesión, sin stock, cancelado o duplicado. Ya no se da por bueno en silencio.
   - Pago que llega tarde (sesión antigua o reserva vencida mientras se completaba): se acepta solo si se puede volver
     a reservar el stock. Si no, queda como `sin_stock` para reembolsarlo.
   - Compatibilidad con la app desplegada:
     - `checkout_create_order` y `mark_order_paid` siguen existiendo, como envoltorios de las funciones nuevas.
     - `mark_order_paid` ahora **falla** si el pago no se aplica: Stripe reintenta y el caso queda registrado.
     - Los pedidos anteriores sin reserva se cobran descontando stock sin dejarlo en negativo.

2. **Reserva de stock (problema 2).**
   - El stock se descuenta **al empezar el pago**:
     - de forma condicional (`stock >= cantidad`);
     - con las variantes bloqueadas en orden fijo, para que dos compras no se crucen;
     - todo o nada.
   - Si no queda stock, sale el aviso «No queda stock suficiente…» y no se crea pedido.
   - La reserva dura `checkout_reservation_minutes` (35 minutos, porque Stripe exige más de 30). La sesión de Stripe caduca a la misma hora (`expires_at`).
   - La liberación es idempotente: la bandera `stock_reserved` cambia en la misma actualización, así que nunca se devuelve dos veces.
     Se libera en cuatro casos:
     - Al vencer la reserva, con `release_expired_reservations`, que se ejecuta en cada inicio de pago y en la tarea diaria.
     - Cuando Stripe avisa de que la sesión ha caducado (`checkout.session.expired` → `release_order_by_session`).
     - Al reemplazar el pedido por otro.
     - Cuando la sesión reutilizada ya ha caducado en Stripe.
   - Carrera entre expiración y confirmación: las dos bloquean la fila del pedido, así que se ejecutan una tras otra.
   - Pagos asíncronos: la sesión de Stripe se crea solo con tarjeta (Apple Pay y Google Pay incluidos), así que no hay métodos de pago diferidos.
   - Reservas abusivas: se limitan con tres medidas.
     - Como mucho `checkout_max_active_reservations` (200) pedidos pendientes con reserva a la vez.
     - Caducidad corta de la reserva.
     - El límite por sesión que ya tenía la app.

3. **Dirección de envío (problema 3).**
   - Columnas nuevas en `orders`, todas opcionales (los pedidos antiguos quedan en blanco): `ship_name`, `ship_line1`, `ship_line2`, `ship_city`, `ship_state`, `ship_postal_code` y `ship_phone`.
   - Se extraen con `shippingFromSession`, siguiendo los tipos de Stripe 17.7.0:
     - primero `collected_information.shipping_details`;
     - si no está, `shipping_details`;
     - la facturación solo se usa para el país y el teléfono.
   - Estas columnas no salen por `order_lines`, que es la función pública.
   - Las leen los roles con permiso sobre `orders` (owner, operaciones y finanzas, por RLS). Se muestran en el detalle del pedido del panel y en el texto para el proveedor.
   - `customer_data` (exportación RGPD), `anonymize_customer` y `apply_retention` incluyen las columnas nuevas.

4. **Mensajes del pedido (problema 4).**
   - `orderView` (módulo puro) da un mensaje para cada estado: pendiente, pagado, enviado, entregado, cancelado y reembolsado.
   - `?pagado=1` ya no da las gracias: solo lanza la comprobación con Stripe y muestra «Comprobando tu pago».
   - Se ha retirado la frase del correo enviado, porque no hay envío de correo.
   - Con Stripe configurado, un pedido pendiente ofrece «Volver al carrito para pagar», que usa el flujo nuevo y reutiliza el pedido.
   - «Los pagos online aún no están activados» solo aparece cuando de verdad no lo están.

### Archivos

Nuevos:
- `_sistema/merovan/supabase/migrations/20261106000017_checkout_reservas_direccion.sql`.
- `_sistema/merovan/src/lib/domain/checkout.ts`.
- `_sistema/merovan/tests/checkout-db.test.ts` (18 pruebas, PGlite aislado).
- `_sistema/merovan/tests/checkout-domain.test.ts` (8 pruebas).

Modificados:
- `_sistema/merovan/src/app/(tienda)/actions.ts`: checkout reutilizable, idempotencia, cierre de sesiones antiguas, `expires_at` y solo tarjeta.
- `_sistema/merovan/src/lib/payments.ts`: usa `confirm_order_payment`, guarda la dirección y devuelve un resultado explícito.
- `_sistema/merovan/src/app/api/stripe/webhook/route.ts`: resultado explícito y aviso `checkout.session.expired`.
- `_sistema/merovan/src/app/(tienda)/pedido/[id]/page.tsx`: estados explícitos.
- `_sistema/merovan/src/app/admin/pedidos/[number]/page.tsx`: dirección de envío.
- `_sistema/merovan/src/app/admin/pedidos/page.tsx`: lista «Pagos por revisar».
- `_sistema/merovan/src/lib/jobs.ts`: libera las reservas vencidas en la tarea diaria.
- `00-INICIO/Estado del proyecto.md`: enlace a este informe.
- Este documento: cabecera de Obsidian, para que `vault:check` siga con 0 errores.

### Pruebas ejecutadas (06/11/2026, este ordenador)

- `npx tsc --noEmit`: sin errores.
- `npm run lint`: sin errores.
- `npm test -- --hookTimeout=60000`: resultado final en «Re-ejecución final», más abajo.
- Pruebas de regresión nuevas en `tests/checkout-db.test.ts` (PGlite aislado con todas las migraciones y la semilla): **18/18 en verde**.
  - Reintento: devuelve el mismo pedido, sin borrarlo.
  - Fallo parcial entre Stripe y la base de datos.
  - Carrito cambiado: el pedido anterior se cancela y su sesión se devuelve para cerrarla.
  - Sesión antigua pagada tarde.
  - Pedido inexistente: queda registrado y `mark_order_paid` falla.
  - Doble confirmación: idempotente; un segundo cobro distinto se marca para revisar.
  - Importe, moneda o sesión incorrectos.
  - Un solo pedido pendiente por carrito.
  - Dos compradores y una sola unidad.
  - Reserva vencida liberada una sola vez.
  - Pago durante la expiración, con stock libre y sin stock.
  - Expiración de la sesión en Stripe.
  - Tope de reservas.
  - Pedido antiguo sin reserva.
  - Permisos de las funciones nuevas.
  - Dirección de envío distinta de la de facturación.
  - Pago sin dirección.
  - `order_lines` sin datos personales.
  - El rol de marketing no ve los pedidos.
  - Exportación y anonimización.
- `tests/checkout-domain.test.ts`: **8/8**.
  - Dirección de envío distinta de la de facturación, y campos ausentes.
  - Pedido pendiente con `?pagado=1`, cancelado, reembolsado y confirmado.
  - Ningún estado menciona un correo enviado.
- `npm run build`: correcto, con el servidor de desarrollo parado y `.next` borrado después.
- `npx playwright test`: 16 en verde y 2 saltadas.
  - Las 2 saltadas son las del carrito, porque no hay productos con stock: **el checkout no queda demostrado por las pruebas de extremo a extremo**.
  - Estas pruebas usan la base remota, que **no** tiene la migración nueva.

### Qué NO está verificado

- **Concurrencia real entre procesos.** PGlite usa una sola conexión, así que las pruebas cubren las intercalaciones en secuencia.
  La protección entre procesos se basa en los bloqueos de fila (`for update`), las actualizaciones condicionales y el índice único.
  Falta probarla con dos conexiones contra un Postgres aislado.
- **Stripe.** No hay `STRIPE_SECRET_KEY` de pruebas en `.env.local`.
  - No se ha hecho ninguna compra de extremo a extremo ni se ha probado el webhook real.
  - No se ha llamado a Stripe en ningún momento.
- **Efecto en remoto.** La migración no está aplicada en Supabase y el código no está desplegado en Vercel.
- **Rotación de claves.** No consta que `SUPABASE_SERVICE_ROLE_KEY` ni `CRON_SECRET` se hayan renovado. Hay que confirmarlo con Jaska.

### Pasos pendientes (en orden)

1. Jaska revisa los cambios y da el visto bueno.
2. Aplicar en `merovan-dev` la migración `20261106000017_checkout_reservas_direccion` con `apply_migration` y revisar `get_advisors`.
   - Es compatible con la app desplegada gracias a los envoltorios.
   - Hacerlo **antes** del paso 3: la app nueva llama a funciones que solo existen tras la migración.
3. Commit y push a `main`. Vercel despliega la app nueva.
4. Stripe en modo prueba:
   - `STRIPE_SECRET_KEY` (`sk_test_…`) en `.env.local` y en Vercel como Secret;
   - un webhook a `/api/stripe/webhook` con los eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded` y `checkout.session.expired`;
   - `STRIPE_WEBHOOK_SECRET`.
5. Con stock de prueba en un producto, repetir los E2E sin saltos y probar a mano:
   - compra con la tarjeta 4242…;
   - reintento;
   - carrito cambiado;
   - sesión caducada.
6. Si se quiere certificar la concurrencia, prueba con dos conexiones contra una base aislada (rama de Supabase o Postgres local).

Re-ejecución final (06/11/2026, 21:56): `npm test -- --hookTimeout=60000` → **21 archivos, 171/171 en verde**;
`npm run vault:check` → 0 errores, 0 avisos.


### Despliegue

Pendiente de anotar tras el push.

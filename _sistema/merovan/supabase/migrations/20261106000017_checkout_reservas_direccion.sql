-- Revisión 2026-11-06 (REVISION-MEROVAN-PARA-CLAUDE.md):
-- 1. Reintentar el pago ya no borra el pedido anterior: se reutiliza (mismo carrito) o se cancela
--    dejando rastro, y los pagos que no encajan quedan registrados en payment_events.
-- 2. El stock se reserva al crear el pedido (actualización condicional con bloqueo) y se libera
--    al vencer, al expirar la sesión de Stripe o al reemplazar el pedido. Nunca dos veces.
-- 3. Dirección de envío completa en orders (solo personal autorizado; no sale por order_lines).
-- Las firmas antiguas (checkout_create_order, mark_order_paid) siguen existiendo como envoltorios
-- para que la versión de la app ya desplegada siga funcionando mientras se publica la nueva.

insert into settings (key, value, description, verified, last_reviewed_at) values
  ('checkout_reservation_minutes', '35', 'Minutos que se reserva el stock de un pedido pendiente de pago (más de 30: Stripe exige sesiones de al menos 30 min)', true, current_date),
  ('checkout_max_active_reservations', '200', 'Máximo de pedidos pendientes con stock reservado a la vez (freno a reservas abusivas desde la web pública)', true, current_date)
on conflict (key) do nothing;

alter table orders
  add column stripe_session_id text,
  add column stripe_session_url text,
  add column cart_fingerprint text,
  add column reserved_until timestamptz,
  add column stock_reserved boolean not null default false,
  add column cancel_reason text,
  add column ship_name text,
  add column ship_line1 text,
  add column ship_line2 text,
  add column ship_city text,
  add column ship_state text,
  add column ship_postal_code text,
  add column ship_phone text;

create unique index orders_stripe_session_idx on orders(stripe_session_id) where stripe_session_id is not null;
create index orders_reserved_idx on orders(reserved_until) where stock_reserved;
-- Como mucho un pedido pendiente por carrito, también entre procesos distintos.
create unique index orders_one_pending_per_cart on orders(cart_id) where status = 'pendiente_pago' and cart_id is not null;

-- ---------- Pagos que no se han podido aplicar (para revisar y, si toca, reembolsar) ----------
create table payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe',
  event_ref text,                       -- id de la sesión de Stripe
  order_id uuid references orders(id) on delete set null,
  outcome text not null,                -- pedido_inexistente, importe_no_coincide, sesion_no_coincide, sin_stock, pago_duplicado, pedido_cancelado
  amount_cents integer,
  currency text,
  details jsonb not null default '{}',
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index payment_events_once on payment_events(provider, event_ref, outcome) where event_ref is not null;
create index payment_events_order_idx on payment_events(order_id);
alter table payment_events enable row level security;
create policy payment_events_read on payment_events for select using (private.current_role_is('owner', 'finanzas', 'operaciones'));
create policy payment_events_resolve on payment_events for update
  using (private.current_role_is('owner', 'finanzas')) with check (private.current_role_is('owner', 'finanzas'));

create or replace function private.log_payment_event(
  p_ref text, p_order uuid, p_outcome text, p_amount integer, p_currency text, p_details jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into public.payment_events (event_ref, order_id, outcome, amount_cents, currency, details)
  values (p_ref, (select id from public.orders where id = p_order), p_outcome, p_amount, p_currency, coalesce(p_details, '{}'))
  on conflict do nothing;
$$;

-- ---------- Reservas de stock ----------
-- Descuenta el stock del pedido solo si hay unidades para todas las líneas. Todo o nada.
create or replace function private.reserve_order_stock(p_order uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare need record;
begin
  begin
    -- Bloquea las variantes en orden fijo para que dos compras simultáneas no se crucen.
    perform 1 from public.product_variants v
     where v.id in (select variant_id from public.order_items where order_id = p_order)
     order by v.id for update;
    for need in
      select variant_id, sum(quantity)::int as q from public.order_items
       where order_id = p_order and variant_id is not null group by variant_id
    loop
      update public.product_variants set stock = stock - need.q where id = need.variant_id and stock >= need.q;
      if not found then raise exception 'merovan_sin_stock'; end if;
    end loop;
    update public.orders set stock_reserved = true where id = p_order;
    return true;
  exception when raise_exception then
    if sqlerrm = 'merovan_sin_stock' then return false; end if; -- se deshace lo descontado en el bloque
    raise;
  end;
end $$;

-- Devuelve el stock de un pedido pendiente y lo cancela. Idempotente: solo actúa si aún tenía reserva.
create or replace function private.release_order_stock(p_order uuid, p_reason text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.orders
     set stock_reserved = false, reserved_until = null, status = 'cancelado', cancel_reason = p_reason
   where id = p_order and status = 'pendiente_pago' and stock_reserved;
  if not found then return false; end if;
  update public.product_variants v set stock = v.stock + x.q
    from (select variant_id, sum(quantity)::int as q from public.order_items
           where order_id = p_order and variant_id is not null group by variant_id) x
   where v.id = x.variant_id;
  return true;
end $$;

create or replace function public.release_expired_reservations() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in
    select id from public.orders
     where status = 'pendiente_pago' and stock_reserved and reserved_until < now()
     for update skip locked
  loop
    if private.release_order_stock(r.id, 'reserva_vencida') then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Stripe avisa de que la sesión caducó: libera su pedido (si sigue pendiente).
create or replace function public.release_order_by_session(p_session_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare oid uuid;
begin
  select id into oid from public.orders where stripe_session_id = p_session_id for update;
  if oid is null then return false; end if;
  return private.release_order_stock(oid, 'sesion_expirada');
end $$;

-- ---------- Checkout ----------
-- Prepara el pago del carrito. Si ya hay un pedido pendiente con el mismo contenido y reserva viva,
-- lo reutiliza (con su sesión de Stripe). Si el carrito cambió, cancela el anterior (libera stock)
-- y devuelve su sesión para que la app la cierre en Stripe.
create or replace function public.checkout_prepare(p_session text)
returns table (order_id uuid, reused boolean, stripe_session_id text, stripe_session_url text,
               reserved_until timestamptz, superseded text[])
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare cid uuid; oid uuid; fp text; prev record; ship integer; sub integer; vat integer;
        minutes integer; max_active integer; old_sessions text[] := '{}';
begin
  cid := private.active_cart(p_session, false);
  if cid is null or not exists (select 1 from public.cart_items where cart_id = cid) then
    raise exception 'El carrito está vacío';
  end if;
  -- Serializa los intentos del mismo carrito (doble clic, dos pestañas, dos servidores).
  perform 1 from public.carts where id = cid for update;
  perform public.release_expired_reservations();

  select string_agg(variant_id::text || ':' || quantity, ',' order by variant_id) into fp
    from public.cart_items where cart_id = cid;

  select o.id, o.cart_fingerprint, o.stock_reserved, o.reserved_until, o.stripe_session_id, o.stripe_session_url
    into prev from public.orders o where o.cart_id = cid and o.status = 'pendiente_pago' for update;

  if prev.id is not null and prev.cart_fingerprint = fp and prev.stock_reserved and (
       (prev.stripe_session_id is not null and prev.reserved_until > now() + interval '2 minutes')
    or (prev.stripe_session_id is null and prev.reserved_until > now() + interval '31 minutes')) then
    return query select prev.id, true, prev.stripe_session_id, prev.stripe_session_url, prev.reserved_until, old_sessions;
    return;
  end if;

  if prev.id is not null then
    if prev.stripe_session_id is not null then old_sessions := array[prev.stripe_session_id]; end if;
    if not private.release_order_stock(prev.id, 'reemplazado') then
      update public.orders set status = 'cancelado', cancel_reason = 'reemplazado' where id = prev.id; -- pedido antiguo sin reserva
    end if;
  end if;

  select (value #>> '{}')::int into max_active from public.settings where key = 'checkout_max_active_reservations';
  if (select count(*) from public.orders where status = 'pendiente_pago' and stock_reserved) >= coalesce(max_active, 200) then
    raise exception 'Ahora mismo hay muchos pagos en curso; inténtalo en unos minutos';
  end if;

  select (value #>> '{}')::integer into ship from public.settings where key = 'shipping_fee_cents';
  insert into public.orders (cart_id, channel, status, shipping_cents, cart_fingerprint)
  values (cid, 'web', 'pendiente_pago', coalesce(ship, 0), fp) returning id into oid;

  insert into public.order_items (order_id, product_id, variant_id, quantity, unit_price_cents, unit_cost_cents)
  select oid, p.id, v.id, i.quantity, coalesce(v.price_cents, p.price_cents),
         (select o.unit_cost_cents + o.shipping_cents from public.supplier_offers o
          where o.product_id = p.id and o.role = 'principal' limit 1)
  from public.cart_items i
  join public.product_variants v on v.id = i.variant_id
  join public.products p on p.id = v.product_id
  where i.cart_id = cid and p.publish_status = 'publicado' and coalesce(v.price_cents, p.price_cents) is not null;

  select coalesce(sum(oi.unit_price_cents * oi.quantity), 0),
         coalesce(sum(round(oi.unit_price_cents * oi.quantity * p.vat_rate / (1 + p.vat_rate))), 0)
    into sub, vat
  from public.order_items oi join public.products p on p.id = oi.product_id where oi.order_id = oid;
  if sub = 0 then raise exception 'El carrito no tiene productos disponibles'; end if;

  if not private.reserve_order_stock(oid) then
    raise exception 'No queda stock suficiente de algún producto del carrito'; -- deshace el pedido entero
  end if;

  select (value #>> '{}')::int into minutes from public.settings where key = 'checkout_reservation_minutes';
  update public.orders
     set subtotal_cents = sub, vat_cents = vat, total_cents = sub + coalesce(ship, 0),
         reserved_until = now() + make_interval(mins => greatest(coalesce(minutes, 35), 31))
   where id = oid;
  return query select o.id, false, null::text, null::text, o.reserved_until, old_sessions from public.orders o where o.id = oid;
end $$;

-- Firma antigua (app ya desplegada): mismo comportamiento seguro, devuelve solo el id.
create or replace function public.checkout_create_order(p_session text) returns uuid
language sql security definer set search_path = '' as $$
  select order_id from public.checkout_prepare(p_session);
$$;

-- Guarda la sesión de Stripe del pedido (solo servidor). No pisa otra sesión ya guardada.
create or replace function public.checkout_attach_session(p_order uuid, p_session_id text, p_url text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.orders set stripe_session_id = p_session_id, stripe_session_url = p_url
   where id = p_order and status = 'pendiente_pago' and (stripe_session_id is null or stripe_session_id = p_session_id);
  return found;
end $$;

-- ---------- Confirmación del pago (solo servidor, tras verificar el evento con Stripe) ----------
-- Devuelve: pagado | ya_pagado | pedido_inexistente | importe_no_coincide | sesion_no_coincide |
--           sin_stock | pago_duplicado | pedido_cancelado. Todo lo que no es pagado/ya_pagado queda en payment_events.
create or replace function public.confirm_order_payment(
  p_order uuid, p_session_id text, p_payment_ref text, p_amount integer, p_currency text,
  p_email text, p_name text, p_ship jsonb
) returns text language plpgsql security definer set search_path = '' as $$
declare o record; fee jsonb; days integer; ref text := coalesce(p_session_id, p_payment_ref);
        info jsonb := jsonb_build_object('payment_ref', p_payment_ref, 'email', p_email);
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then
    perform private.log_payment_event(ref, null, 'pedido_inexistente', p_amount, p_currency, info || jsonb_build_object('order_id', p_order));
    return 'pedido_inexistente';
  end if;

  if o.status in ('pagado', 'enviado_proveedor', 'enviado', 'entregado') then
    if o.payment_ref = p_payment_ref or (p_session_id is not null and o.stripe_session_id = p_session_id) then
      return 'ya_pagado'; -- webhook repetido o vuelta del comprador
    end if;
    perform private.log_payment_event(ref, o.id, 'pago_duplicado', p_amount, p_currency, info);
    return 'pago_duplicado';
  end if;

  if p_session_id is not null and o.stripe_session_id is not null and o.stripe_session_id <> p_session_id then
    perform private.log_payment_event(ref, o.id, 'sesion_no_coincide', p_amount, p_currency, info || jsonb_build_object('sesion_guardada', o.stripe_session_id));
    return 'sesion_no_coincide';
  end if;

  if p_amount is not null and (p_amount <> o.total_cents or lower(coalesce(p_currency, '')) <> 'eur') then
    perform private.log_payment_event(ref, o.id, 'importe_no_coincide', p_amount, p_currency, info || jsonb_build_object('esperado', o.total_cents));
    return 'importe_no_coincide';
  end if;

  if o.status = 'cancelado' and o.cancel_reason in ('reemplazado', 'reserva_vencida', 'sesion_expirada') then
    -- El pago llegó tarde (sesión antigua o reserva vencida): solo se acepta si aún hay stock.
    if not private.reserve_order_stock(o.id) then
      perform private.log_payment_event(ref, o.id, 'sin_stock', p_amount, p_currency, info);
      return 'sin_stock';
    end if;
  elsif o.status <> 'pendiente_pago' then
    perform private.log_payment_event(ref, o.id, 'pedido_cancelado', p_amount, p_currency, info || jsonb_build_object('estado', o.status));
    return 'pedido_cancelado';
  elsif not o.stock_reserved then
    -- Pedido creado antes de las reservas: descuenta ahora, sin dejar el stock en negativo.
    if not private.reserve_order_stock(o.id) then
      perform private.log_payment_event(ref, o.id, 'sin_stock', p_amount, p_currency, info);
      return 'sin_stock';
    end if;
  end if;

  select value into fee from public.settings where key = 'payment_fee';
  select max(so.promised_days) into days
    from public.order_items oi join public.supplier_offers so on so.product_id = oi.product_id and so.role = 'principal'
   where oi.order_id = o.id;

  update public.orders
     set status = 'pagado', paid_at = now(), payment_provider = 'stripe', payment_ref = p_payment_ref,
         stripe_session_id = coalesce(stripe_session_id, p_session_id),
         stock_reserved = false, reserved_until = null, cancel_reason = null,  -- la reserva pasa a venta
         customer_email = p_email, customer_name = p_name,
         shipping_country = coalesce(nullif(p_ship ->> 'country', ''), 'ES'),
         ship_name = nullif(p_ship ->> 'name', ''), ship_line1 = nullif(p_ship ->> 'line1', ''),
         ship_line2 = nullif(p_ship ->> 'line2', ''), ship_city = nullif(p_ship ->> 'city', ''),
         ship_state = nullif(p_ship ->> 'state', ''), ship_postal_code = nullif(p_ship ->> 'postal_code', ''),
         ship_phone = nullif(p_ship ->> 'phone', ''),
         payment_fee_cents = round(total_cents * coalesce((fee ->> 'pct')::numeric, 0)) + coalesce((fee ->> 'fixed_cents')::int, 0),
         promised_delivery_on = current_date + coalesce(days, 5)
   where id = o.id;
  update public.carts set status = 'convertido' where id = o.cart_id;
  return 'pagado';
end $$;

-- Firma antigua (webhook de la app ya desplegada). Ya no da por bueno un pedido inexistente:
-- si el pago no se puede aplicar, falla (Stripe reintenta) y queda registrado en payment_events.
create or replace function public.mark_order_paid(
  p_order uuid, p_payment_ref text, p_email text, p_name text, p_country text
) returns void language plpgsql security definer set search_path = '' as $$
declare r text;
begin
  r := public.confirm_order_payment(p_order, null, p_payment_ref, null, null, p_email, p_name,
                                    jsonb_build_object('country', p_country));
  if r not in ('pagado', 'ya_pagado') then raise exception 'Pago no aplicado: %', r; end if;
end $$;

revoke execute on function public.release_expired_reservations() from public, anon, authenticated;
revoke execute on function public.release_order_by_session(text) from public, anon, authenticated;
revoke execute on function public.checkout_attach_session(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.confirm_order_payment(uuid, text, text, integer, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.mark_order_paid(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.checkout_prepare(text) from public;
grant execute on function public.checkout_prepare(text) to anon, authenticated;
grant execute on function public.checkout_create_order(text) to anon, authenticated;

-- ---------- RGPD con las columnas nuevas ----------
create or replace function public.customer_data(p_email text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object('numero', o.number, 'fecha', o.paid_at, 'total_cents', o.total_cents,
                 'estado', o.status, 'nombre', o.customer_name, 'pais', o.shipping_country,
                 'envio', jsonb_build_object('destinatario', o.ship_name, 'direccion', o.ship_line1, 'direccion_2', o.ship_line2,
                   'ciudad', o.ship_city, 'provincia', o.ship_state, 'codigo_postal', o.ship_postal_code, 'telefono', o.ship_phone)))
               from public.orders o where lower(o.customer_email) = lower(p_email)), '[]'),
    'incidencias', coalesce((select jsonb_agg(jsonb_build_object('numero', t.number, 'asunto', t.subject, 'fecha', t.created_at))
               from public.tickets t where lower(t.customer_email) = lower(p_email)), '[]')
  );
$$;

create or replace function public.anonymize_customer(p_email text) returns integer
language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  if not private.current_role_is('owner') then raise exception 'Solo el owner puede anonimizar datos'; end if;
  update public.orders set customer_email = null, customer_name = 'anonimizado', tracking_number = null,
         ship_name = null, ship_line1 = null, ship_line2 = null, ship_city = null, ship_state = null,
         ship_postal_code = null, ship_phone = null
   where lower(customer_email) = lower(p_email);
  get diagnostics n = row_count;
  update public.tickets set customer_email = null, notes = '[anonimizado]' where lower(customer_email) = lower(p_email);
  update public.payment_events set details = details - 'email' where details ->> 'email' = p_email;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values (auth.uid(), 'rgpd_anonimizar', 'orders', null, jsonb_build_object('pedidos', n));
  return n;
end $$;

create or replace function public.apply_retention() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cust integer; views integer; c_days integer; v_days integer;
begin
  select (value #>> '{}')::int into c_days from public.settings where key = 'retention_customer_days';
  select (value #>> '{}')::int into v_days from public.settings where key = 'retention_page_views_days';
  update public.orders set customer_email = null, customer_name = 'anonimizado', tracking_number = null,
         ship_name = null, ship_line1 = null, ship_line2 = null, ship_city = null, ship_state = null,
         ship_postal_code = null, ship_phone = null
   where (customer_email is not null or ship_line1 is not null) and paid_at < now() - make_interval(days => coalesce(c_days, 2190));
  get diagnostics cust = row_count;
  delete from public.page_views where at < now() - make_interval(days => coalesce(v_days, 400));
  get diagnostics views = row_count;
  return jsonb_build_object('pedidos_anonimizados', cust, 'visitas_borradas', views);
end $$;
revoke execute on function public.apply_retention() from public, anon, authenticated;
revoke execute on function public.anonymize_customer(text) from public, anon;
revoke execute on function public.customer_data(text) from public, anon;
-- Explícito (en Supabase ya lo daban los privilegios por defecto): el control real está dentro (rol owner / RLS de orders).
grant execute on function public.anonymize_customer(text) to authenticated;
grant execute on function public.customer_data(text) to authenticated;

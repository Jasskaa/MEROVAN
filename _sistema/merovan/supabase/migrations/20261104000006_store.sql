-- Phase C: storefront operations exposed as narrow RPCs, so the public site never needs
-- write access to tables. Prices always come from the database, never from the browser.

insert into settings (key, value, description, verified, last_reviewed_at) values
  ('shipping_fee_cents', '0', 'Gastos de envío que paga el cliente (céntimos, IVA incl.)', false, current_date),
  ('abandoned_cart_minutes', '60', 'Minutos sin actividad para considerar un carrito abandonado', true, current_date)
on conflict (key) do nothing;

create index if not exists carts_session_idx on carts(session_id) where status = 'activo';

-- ---------- Visits ----------
create or replace function public.track_view(
  p_session text, p_path text, p_product_slug text default null,
  p_referrer text default null, p_utm_source text default null, p_utm_campaign text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if length(coalesce(p_session, '')) not between 16 and 64 then return; end if;
  insert into public.page_views (path, product_id, session_id, referrer, utm_source, utm_campaign)
  values (
    left(p_path, 300),
    (select id from public.products where slug = p_product_slug and publish_status = 'publicado'),
    p_session, left(p_referrer, 300), left(p_utm_source, 100), left(p_utm_campaign, 100)
  );
end $$;

-- ---------- Cart ----------
create or replace function private.active_cart(p_session text, p_create boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  if length(coalesce(p_session, '')) not between 16 and 64 then raise exception 'Sesión no válida'; end if;
  select id into cid from public.carts where session_id = p_session and status = 'activo' order by created_at desc limit 1;
  if cid is null and p_create then
    insert into public.carts (session_id) values (p_session) returning id into cid;
  end if;
  return cid;
end $$;

create or replace function public.cart_set(p_session text, p_variant uuid, p_qty integer, p_add boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare cid uuid; available integer; current_qty integer; new_qty integer;
begin
  select v.stock into available
  from public.product_variants v join public.products p on p.id = v.product_id
  where v.id = p_variant and p.publish_status = 'publicado';
  if available is null then raise exception 'Producto no disponible'; end if;

  cid := private.active_cart(p_session, true);
  select quantity into current_qty from public.cart_items where cart_id = cid and variant_id = p_variant;
  new_qty := least(case when p_add then coalesce(current_qty, 0) + p_qty else p_qty end, 20, available);

  if new_qty <= 0 then
    delete from public.cart_items where cart_id = cid and variant_id = p_variant;
  else
    insert into public.cart_items (cart_id, variant_id, quantity) values (cid, p_variant, new_qty)
    on conflict (cart_id, variant_id) do update set quantity = excluded.quantity;
  end if;
  update public.carts set updated_at = now() where id = cid;
  return (select coalesce(sum(quantity), 0) from public.cart_items where cart_id = cid);
end $$;

create or replace function public.cart_contents(p_session text)
returns table (variant_id uuid, sku text, variant_title text, product_name text, slug text,
               unit_price_cents integer, quantity integer, stock integer, image_path text)
language sql stable security definer set search_path = '' as $$
  select v.id, v.sku, v.title, p.name, p.slug, coalesce(v.price_cents, p.price_cents), i.quantity, v.stock,
         (select m.storage_path from public.product_media m
          where m.product_id = p.id and m.kind = 'image' order by m.position limit 1)
  from public.carts c
  join public.cart_items i on i.cart_id = c.id
  join public.product_variants v on v.id = i.variant_id
  join public.products p on p.id = v.product_id
  where c.session_id = p_session and c.status = 'activo' and p.publish_status = 'publicado'
  order by p.name;
$$;

-- ---------- Checkout: builds a pending order from the cart with database prices ----------
create or replace function public.checkout_create_order(p_session text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid; oid uuid; ship integer; sub integer; vat integer;
begin
  cid := private.active_cart(p_session, false);
  if cid is null or not exists (select 1 from public.cart_items where cart_id = cid) then
    raise exception 'El carrito está vacío';
  end if;
  -- One pending order per cart: retrying checkout replaces it.
  delete from public.orders where cart_id = cid and status = 'pendiente_pago';

  select (value #>> '{}')::integer into ship from public.settings where key = 'shipping_fee_cents';
  insert into public.orders (cart_id, channel, status, shipping_cents)
  values (cid, 'web', 'pendiente_pago', coalesce(ship, 0)) returning id into oid;

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

  update public.orders set subtotal_cents = sub, vat_cents = vat, total_cents = sub + coalesce(ship, 0) where id = oid;
  return oid;
end $$;

-- Read a pending order's lines (for the payment page). Only exposes non-personal data.
create or replace function public.order_lines(p_order uuid)
returns table (product_name text, variant_title text, quantity integer, unit_price_cents integer,
               shipping_cents integer, total_cents integer, status public.order_status, number bigint)
language sql stable security definer set search_path = '' as $$
  select p.name, v.title, oi.quantity, oi.unit_price_cents, o.shipping_cents, o.total_cents, o.status, o.number
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  join public.products p on p.id = oi.product_id
  left join public.product_variants v on v.id = oi.variant_id
  where o.id = p_order;
$$;

-- Called only by the payment webhook (service role): marks paid, decrements stock, closes the cart.
create or replace function public.mark_order_paid(
  p_order uuid, p_payment_ref text, p_email text, p_name text, p_country text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.orders
     set status = 'pagado', paid_at = now(), payment_provider = 'stripe', payment_ref = p_payment_ref,
         customer_email = p_email, customer_name = p_name, shipping_country = coalesce(p_country, 'ES')
   where id = p_order and status = 'pendiente_pago';
  if not found then return; end if; -- idempotent: webhooks can be delivered twice

  update public.product_variants v set stock = greatest(v.stock - oi.quantity, 0)
    from public.order_items oi where oi.order_id = p_order and oi.variant_id = v.id;
  update public.carts set status = 'convertido'
   where id = (select cart_id from public.orders where id = p_order);
end $$;

revoke execute on function public.mark_order_paid(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.track_view(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.cart_set(text, uuid, integer, boolean) to anon, authenticated;
grant execute on function public.cart_contents(text) to anon, authenticated;
grant execute on function public.checkout_create_order(text) to anon, authenticated;
grant execute on function public.order_lines(uuid) to anon, authenticated;

-- ---------- Admin view of carts ----------
create view cart_overview with (security_invoker = true) as
select c.id, c.session_id, c.created_at, c.updated_at,
       case
         when c.status = 'activo' and c.updated_at < now() - make_interval(mins =>
              coalesce((select (value #>> '{}')::int from settings where key = 'abandoned_cart_minutes'), 60))
           then 'abandonado'::cart_status
         else c.status
       end as status,
       coalesce(sum(i.quantity), 0)::int as items,
       coalesce(sum(i.quantity * coalesce(v.price_cents, p.price_cents)), 0)::int as value_cents
from carts c
left join cart_items i on i.cart_id = c.id
left join product_variants v on v.id = i.variant_id
left join products p on p.id = v.product_id
group by c.id;

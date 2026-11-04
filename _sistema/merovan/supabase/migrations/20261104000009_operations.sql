-- Phase F: supplier orders and tracking, support tickets, returns, disputes, expenses, compliance.

-- ---------- Order fees (for real profit) ----------
alter table orders
  add column platform_fee_cents integer not null default 0,
  add column payment_fee_cents integer not null default 0,
  add column external_ref text,                    -- TikTok Shop order id, etc.
  add column promised_delivery_on date;

-- Estimated payment fee when Stripe confirms the payment (settings: payment_fee).
create or replace function public.mark_order_paid(
  p_order uuid, p_payment_ref text, p_email text, p_name text, p_country text
) returns void language plpgsql security definer set search_path = '' as $$
declare fee jsonb; days integer;
begin
  select value into fee from public.settings where key = 'payment_fee';
  select max(o.promised_days) into days
    from public.order_items oi join public.supplier_offers o on o.product_id = oi.product_id and o.role = 'principal'
   where oi.order_id = p_order;

  update public.orders
     set status = 'pagado', paid_at = now(), payment_provider = 'stripe', payment_ref = p_payment_ref,
         customer_email = p_email, customer_name = p_name, shipping_country = coalesce(p_country, 'ES'),
         payment_fee_cents = round(total_cents * coalesce((fee ->> 'pct')::numeric, 0)) + coalesce((fee ->> 'fixed_cents')::int, 0),
         promised_delivery_on = current_date + coalesce(days, 5)
   where id = p_order and status = 'pendiente_pago';
  if not found then return; end if;

  update public.product_variants v set stock = greatest(v.stock - oi.quantity, 0)
    from public.order_items oi where oi.order_id = p_order and oi.variant_id = v.id;
  update public.carts set status = 'convertido'
   where id = (select cart_id from public.orders where id = p_order);
end $$;
revoke execute on function public.mark_order_paid(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------- Supplier orders ----------
create type supplier_order_status as enum ('pendiente', 'pedido', 'enviado', 'entregado', 'incidencia', 'cancelado');

create table supplier_orders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete cascade,
  supplier_id uuid references suppliers(id),
  status supplier_order_status not null default 'pendiente',
  supplier_ref text,
  cost_cents integer,                 -- actually paid to the supplier (product + shipping)
  carrier text,
  tracking_number text,
  ordered_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger supplier_orders_updated before update on supplier_orders for each row execute function set_updated_at();

-- ---------- Support ----------
create type ticket_type as enum ('retraso', 'danado', 'no_esperado', 'devolucion', 'reembolso', 'disputa', 'pregunta', 'otro');
create type ticket_status as enum ('abierto', 'esperando_cliente', 'resuelto');

create table tickets (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  order_id uuid references orders(id) on delete set null,
  type ticket_type not null,
  status ticket_status not null default 'abierto',
  subject text not null,
  customer_email text,
  notes text not null default '',
  first_response_at timestamptz,
  resolved_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tickets_updated before update on tickets for each row execute function set_updated_at();

create type return_status as enum ('solicitada', 'aprobada', 'recibida', 'reembolsada', 'rechazada');

create table returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  reason text not null,
  status return_status not null default 'solicitada',
  refund_cents integer not null default 0,        -- refunded to the customer, VAT included
  return_cost_cents integer not null default 0,   -- our cost (shipping back, lost product), no VAT
  requested_at date not null default current_date,
  refunded_at date,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index returns_product_idx on returns(product_id);

create type dispute_status as enum ('abierta', 'ganada', 'perdida');

create table disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  amount_cents integer not null,
  fee_cents integer not null default 0,
  reason text not null,
  status dispute_status not null default 'abierta',
  opened_at date not null default current_date,
  closed_at date,
  created_at timestamptz not null default now()
);

-- ---------- Finance ----------
create type expense_category as enum ('herramientas', 'creadores', 'muestras', 'gestoria', 'publicidad', 'envios', 'stock', 'otros');

create table expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null,
  category expense_category not null,
  description text not null,
  vendor text,
  amount_cents integer not null check (amount_cents >= 0),  -- without VAT
  vat_cents integer not null default 0,
  receipt_path text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index expenses_date_idx on expenses(spent_on);

create type compliance_status as enum ('pendiente', 'en_curso', 'hecho', 'no_aplica');

create table compliance_items (
  key text primary key,
  label text not null,
  area text not null,
  status compliance_status not null default 'pendiente',
  owner_role app_role not null default 'owner',
  due_on date,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

insert into compliance_items (key, label, area) values
  ('alta_fiscal', 'Alta de autónomo o constitución de la SL', 'Empresa'),
  ('gestoria', 'Gestoría contratada', 'Empresa'),
  ('cuenta_bancaria', 'Cuenta bancaria de empresa separada', 'Empresa'),
  ('aviso_legal', 'Aviso legal en la web', 'Web'),
  ('condiciones', 'Condiciones generales de venta', 'Web'),
  ('privacidad', 'Política de privacidad (RGPD)', 'Web'),
  ('cookies', 'Política y banner de cookies', 'Web'),
  ('devoluciones', 'Política de envíos y devoluciones (14 días)', 'Web'),
  ('registro_tratamientos', 'Registro de actividades de tratamiento (RGPD)', 'Datos'),
  ('oss', 'Alta en OSS (si se vende a otros países UE)', 'Fiscal'),
  ('modelo_303', 'Modelo 303 trimestral', 'Fiscal'),
  ('modelo_390', 'Modelo 390 anual', 'Fiscal'),
  ('tiktok_verificado', 'Cuenta de TikTok Shop verificada', 'Plataformas'),
  ('gpsr_fichas', 'Datos GPSR en todas las fichas publicadas', 'Producto'),
  ('dsa', 'Requisitos DSA de TikTok Shop', 'Plataformas'),
  ('stripe_live', 'Stripe en modo real verificado', 'Pagos');

insert into settings (key, value, description, verified, last_reviewed_at) values
  ('tracking_alert_days', '5', 'Días tras el pago sin número de seguimiento para avisar', true, current_date),
  ('chargeback_alert_ratio', '0.0075', 'Ratio de contracargos que dispara la alerta (las pasarelas penalizan ~1 %)', false, current_date)
on conflict (key) do nothing;

-- ---------- RLS: customer data only for owner / operaciones / finanzas ----------
alter table supplier_orders enable row level security;
alter table tickets enable row level security;
alter table returns enable row level security;
alter table disputes enable row level security;
alter table expenses enable row level security;
alter table compliance_items enable row level security;

create policy supplier_orders_read on supplier_orders for select using (private.current_role_is('owner','operaciones','finanzas'));
create policy supplier_orders_write on supplier_orders for all using (private.current_role_is('owner','operaciones')) with check (private.current_role_is('owner','operaciones'));
create policy tickets_read on tickets for select using (private.current_role_is('owner','operaciones','finanzas'));
create policy tickets_write on tickets for all using (private.current_role_is('owner','operaciones')) with check (private.current_role_is('owner','operaciones'));
create policy returns_read on returns for select using (private.current_role_is('owner','operaciones','finanzas','producto'));
create policy returns_write on returns for all using (private.current_role_is('owner','operaciones')) with check (private.current_role_is('owner','operaciones'));
create policy disputes_read on disputes for select using (private.current_role_is('owner','operaciones','finanzas'));
create policy disputes_write on disputes for all using (private.current_role_is('owner','operaciones','finanzas')) with check (private.current_role_is('owner','operaciones','finanzas'));
create policy expenses_read on expenses for select using (private.current_role_is('owner','finanzas'));
create policy expenses_write on expenses for all using (private.current_role_is('owner','finanzas')) with check (private.current_role_is('owner','finanzas'));
create policy compliance_read on compliance_items for select using (private.is_staff());
create policy compliance_write on compliance_items for update using (private.current_role_is('owner','finanzas')) with check (private.current_role_is('owner','finanzas'));

-- Manual orders (TikTok Shop until there is an API connection): owner / operaciones may insert.
create policy orders_insert on orders for insert with check (private.current_role_is('owner','operaciones'));
create policy order_items_insert on order_items for insert with check (private.current_role_is('owner','operaciones'));

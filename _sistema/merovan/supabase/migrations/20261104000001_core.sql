-- MEROVAN core schema: roles, settings, audit, catalog, suppliers, store (cart/orders/visits), approvals.
-- Money is stored as integer cents (EUR). Percentages as numeric fractions (0.21 = 21 %).

-- ---------- Enums ----------
create type app_role as enum ('owner', 'producto', 'marketing', 'operaciones', 'finanzas', 'lectura');
create type product_status as enum (
  'idea', 'candidato', 'validando_proveedor', 'muestra_pedida', 'muestra_aprobada',
  'listo_para_publicar', 'en_test', 'escalando', 'pausado', 'descartado'
);
create type publish_status as enum ('borrador', 'pendiente_aprobacion', 'aprobado', 'publicado', 'retirado');
create type cart_status as enum ('activo', 'convertido', 'abandonado');
create type order_status as enum ('pendiente_pago', 'pagado', 'enviado_proveedor', 'enviado', 'entregado', 'cancelado', 'reembolsado');
create type sales_channel as enum ('web', 'tiktok_shop');
create type approval_status as enum ('pendiente', 'aprobada', 'rechazada', 'ejecutada');

-- ---------- Common helpers ----------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- Team & roles ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role app_role not null default 'lectura',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function current_role_is(variadic roles app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role = any(roles));
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid());
$$;

-- ---------- Configurable parameters (platform data changes often) ----------
create table settings (
  key text primary key,
  value jsonb not null,
  description text not null default '',
  verified boolean not null default false,          -- false = "a verificar"
  last_reviewed_at date,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- ---------- Immutable audit log ----------
create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'
);

create or replace function forbid_change() returns trigger language plpgsql as $$
begin raise exception 'audit_log es inmutable'; end $$;
create trigger audit_log_immutable before update or delete on audit_log
  for each row execute function forbid_change();

-- ---------- Catalog ----------
create table products (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^PRD-[0-9]{4}$'),   -- same ID as the Obsidian note
  name text not null,
  slug text unique not null,
  niche text,
  status product_status not null default 'idea',
  publish_status publish_status not null default 'borrador',
  description text not null default '',
  bullets text[] not null default '{}',
  vat_rate numeric(5,4) not null default 0.21,
  price_cents integer check (price_cents >= 0),                -- public price, VAT included
  compare_at_cents integer check (compare_at_cents >= 0),
  weight_g integer,
  origin_country text,
  -- GPSR data required to publish in the EU
  gpsr_manufacturer text,
  gpsr_address text,
  gpsr_contact text,
  gpsr_warnings text,
  score integer check (score between 0 and 40),
  legal_red_flag boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index products_status_idx on products(status);
create index products_publish_idx on products(publish_status);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  sku text unique not null,
  title text not null default 'Única',
  price_cents integer check (price_cents >= 0),                -- null = product price
  stock integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index product_variants_product_idx on product_variants(product_id);

create table product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  storage_path text not null,
  kind text not null check (kind in ('image', 'video')),
  alt text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table status_history (
  id bigint generated always as identity primary key,
  product_id uuid not null references products(id) on delete cascade,
  from_status product_status,
  to_status product_status not null,
  reason text not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

-- ---------- Suppliers ----------
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^PRV-[0-9]{4}$'),
  name text not null,
  warehouse_country text,
  platform text,
  url text,
  eu_return_address text,
  reliability numeric(3,2),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table supplier_offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete restrict,
  role text not null default 'candidato' check (role in ('principal', 'respaldo', 'candidato')),
  unit_cost_cents integer not null check (unit_cost_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  promised_days integer,
  measured_days numeric(5,1),
  moq integer not null default 1,
  reviewed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, supplier_id)
);

-- ---------- Store: visits, carts, orders ----------
create table page_views (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  path text not null,
  product_id uuid references products(id) on delete set null,
  session_id text not null,                                     -- anonymous, no personal data
  referrer text,
  utm_source text,
  utm_campaign text
);
create index page_views_at_idx on page_views(at);
create index page_views_product_idx on page_views(product_id, at);

create table carts (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  status cart_status not null default 'activo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts(id) on delete cascade,
  variant_id uuid not null references product_variants(id),
  quantity integer not null check (quantity > 0),
  unique (cart_id, variant_id)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  channel sales_channel not null default 'web',
  status order_status not null default 'pendiente_pago',
  cart_id uuid references carts(id),
  customer_email text,                                           -- minimal personal data
  customer_name text,
  shipping_country text not null default 'ES',
  subtotal_cents integer not null default 0,
  shipping_cents integer not null default 0,
  total_cents integer not null default 0,                        -- VAT included
  vat_cents integer not null default 0,
  payment_provider text,
  payment_ref text,                                              -- Stripe session/payment id, never card data
  tracking_number text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_created_idx on orders(created_at);
create index orders_status_idx on orders(status);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  variant_id uuid references product_variants(id),
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null,
  unit_cost_cents integer                                        -- snapshot for real margin
);
create index order_items_product_idx on order_items(product_id);

-- ---------- Human-in-the-loop approvals ----------
create table approvals (
  id uuid primary key default gen_random_uuid(),
  action text not null,               -- e.g. publish_product, change_price, ad_budget
  entity text not null,
  entity_id text not null,
  payload jsonb not null default '{}',
  reason text not null,
  status approval_status not null default 'pendiente',
  requested_by uuid references auth.users(id),
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text
);

-- ---------- updated_at triggers ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','products','product_variants','suppliers','supplier_offers','carts','orders'] loop
    execute format('create trigger %I_updated before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ---------- Row Level Security ----------
alter table profiles enable row level security;
alter table settings enable row level security;
alter table audit_log enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table product_media enable row level security;
alter table status_history enable row level security;
alter table suppliers enable row level security;
alter table supplier_offers enable row level security;
alter table page_views enable row level security;
alter table carts enable row level security;
alter table cart_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table approvals enable row level security;

-- Profiles: everyone on the team sees the team; only owner manages roles.
create policy profiles_read on profiles for select using (is_staff());
create policy profiles_owner on profiles for all using (current_role_is('owner')) with check (current_role_is('owner'));

-- Settings: team reads, owner/finanzas edit.
create policy settings_read on settings for select using (is_staff());
create policy settings_write on settings for all using (current_role_is('owner','finanzas')) with check (current_role_is('owner','finanzas'));

-- Audit: insert by staff, read by owner. No update/delete (trigger).
create policy audit_insert on audit_log for insert with check (is_staff());
create policy audit_read on audit_log for select using (current_role_is('owner'));

-- Catalog: public sees only published products; staff reads all; producto/owner edit.
create policy products_public on products for select using (publish_status = 'publicado');
create policy products_staff_read on products for select using (is_staff());
create policy products_write on products for all using (current_role_is('owner','producto')) with check (current_role_is('owner','producto'));

create policy variants_public on product_variants for select
  using (exists (select 1 from products p where p.id = product_id and p.publish_status = 'publicado'));
create policy variants_staff_read on product_variants for select using (is_staff());
create policy variants_write on product_variants for all using (current_role_is('owner','producto')) with check (current_role_is('owner','producto'));

create policy media_public on product_media for select
  using (exists (select 1 from products p where p.id = product_id and p.publish_status = 'publicado'));
create policy media_staff_read on product_media for select using (is_staff());
create policy media_write on product_media for all using (current_role_is('owner','producto','marketing')) with check (current_role_is('owner','producto','marketing'));

create policy history_read on status_history for select using (is_staff());
create policy history_insert on status_history for insert with check (current_role_is('owner','producto'));

-- Suppliers & costs: not visible to marketing/lectura.
create policy suppliers_read on suppliers for select using (current_role_is('owner','producto','operaciones','finanzas'));
create policy suppliers_write on suppliers for all using (current_role_is('owner','producto')) with check (current_role_is('owner','producto'));
create policy offers_read on supplier_offers for select using (current_role_is('owner','producto','operaciones','finanzas'));
create policy offers_write on supplier_offers for all using (current_role_is('owner','producto')) with check (current_role_is('owner','producto'));

-- Store tables are written by the server (service role bypasses RLS); staff reads.
create policy views_read on page_views for select using (is_staff());
create policy carts_read on carts for select using (is_staff());
create policy cart_items_read on cart_items for select using (is_staff());
-- Orders contain personal data: marketing and lectura cannot read them.
create policy orders_read on orders for select using (current_role_is('owner','operaciones','finanzas'));
create policy orders_write on orders for update using (current_role_is('owner','operaciones')) with check (current_role_is('owner','operaciones'));
create policy order_items_read on order_items for select using (current_role_is('owner','operaciones','finanzas','producto'));

-- Approvals: staff requests and reads; only owner decides.
create policy approvals_read on approvals for select using (is_staff());
create policy approvals_request on approvals for insert with check (is_staff() and status = 'pendiente');
create policy approvals_decide on approvals for update using (current_role_is('owner')) with check (current_role_is('owner'));

-- ---------- Sales dashboard view ----------
create view daily_sales with (security_invoker = true) as
select date_trunc('day', paid_at at time zone 'Europe/Madrid')::date as day,
       channel,
       count(*) as orders,
       sum(total_cents) as revenue_cents,
       sum(vat_cents) as vat_cents
from orders
where status not in ('pendiente_pago', 'cancelado')
group by 1, 2;

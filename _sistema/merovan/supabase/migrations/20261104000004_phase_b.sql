-- Phase B: scorecard + legal checklist, samples, margin scenarios, status guards, team invites.

alter table products
  add column score_detail jsonb not null default '{}',
  add column legal_checks jsonb not null default '{}',
  add column sample_exception text;

-- ---------- Samples ----------
create type sample_status as enum ('pedida', 'recibida', 'aprobada', 'rechazada');

create table samples (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^MUE-[0-9]{4}$'),
  product_id uuid not null references products(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete restrict,
  status sample_status not null default 'pedida',
  ordered_at date not null default current_date,
  received_at date,
  quality integer check (quality between 1 and 5),
  packaging text not null default '',
  matches_photos boolean,
  notes text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index samples_product_idx on samples(product_id);
create trigger samples_updated before update on samples for each row execute function set_updated_at();

alter table samples enable row level security;
create policy samples_read on samples for select using (private.current_role_is('owner','producto','operaciones','finanzas'));
create policy samples_write on samples for all using (private.current_role_is('owner','producto')) with check (private.current_role_is('owner','producto'));

-- ---------- Margin scenarios ----------
create table margin_scenarios (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  name text not null,
  kind text not null default 'base' check (kind in ('pesimista', 'base', 'optimista', 'otro')),
  inputs jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table margin_scenarios enable row level security;
create policy scenarios_read on margin_scenarios for select using (private.current_role_is('owner','producto','finanzas'));
create policy scenarios_write on margin_scenarios for all using (private.current_role_is('owner','producto','finanzas')) with check (private.current_role_is('owner','producto','finanzas'));

-- ---------- Next human-readable codes (PRD-0003, PRV-0002, MUE-0001…) ----------
create or replace function public.next_code(prefix text) returns text
language plpgsql stable set search_path = '' as $$
declare n integer;
begin
  execute format(
    'select coalesce(max(substring(code from 5)::int), 0) + 1 from public.%I',
    case prefix when 'PRD' then 'products' when 'PRV' then 'suppliers' when 'MUE' then 'samples'
      else null end
  ) into n;
  return prefix || '-' || lpad(n::text, 4, '0');
end $$;

-- ---------- Status & publish guards (last line of defence; the app explains the reasons) ----------
create or replace function private.product_guard() returns trigger
language plpgsql set search_path = '' as $$
declare red boolean := exists (select 1 from jsonb_each_text(new.legal_checks) where value = 'rojo');
begin
  new.legal_red_flag := red;

  if new.status is distinct from old.status
     and new.status not in ('idea', 'candidato', 'pausado', 'descartado') then
    if red then
      raise exception 'Bandera roja legal: el producto no puede avanzar';
    end if;
    if new.status in ('listo_para_publicar', 'en_test', 'escalando')
       and coalesce(trim(new.sample_exception), '') = ''
       and not exists (select 1 from public.samples s where s.product_id = new.id and s.status = 'aprobada') then
      raise exception 'Falta una muestra aprobada';
    end if;
    if new.status = 'escalando'
       and not exists (select 1 from public.supplier_offers o where o.product_id = new.id and o.role = 'respaldo') then
      raise exception 'Falta un proveedor de respaldo';
    end if;
  end if;

  if new.publish_status = 'publicado' and old.publish_status is distinct from 'publicado' then
    if red or new.price_cents is null
       or coalesce(new.gpsr_manufacturer, '') = '' or coalesce(new.gpsr_address, '') = '' or coalesce(new.gpsr_contact, '') = '' then
      raise exception 'No se puede publicar: faltan precio o datos GPSR, o hay bandera roja';
    end if;
  end if;
  return new;
end $$;

create trigger products_guard before update on products for each row execute function private.product_guard();

-- ---------- Team: the owner creates accounts with a role (app_metadata is only settable server-side) ----------
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare invited_role text := new.raw_app_meta_data ->> 'merovan_role';
begin
  if not exists (select 1 from public.profiles) then
    insert into public.profiles (id, full_name, role)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'owner');
    update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = new.id;
  elsif invited_role is not null then
    insert into public.profiles (id, full_name, role)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), invited_role::public.app_role);
  else
    raise exception 'El registro está cerrado: pide al owner que te dé de alta';
  end if;
  return new;
end $$;

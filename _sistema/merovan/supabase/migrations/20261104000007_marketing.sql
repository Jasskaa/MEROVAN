-- Phase D: creatives, scripts, creators, campaigns, content calendar and imported ad metrics.
-- Simplified model: campaign → ad (no ad sets). The system never changes budgets on any platform;
-- campaigns here are a record that is matched to imported metrics by the PRD-/CRE- codes in their names.

create type creative_status as enum ('idea', 'guion', 'grabado', 'editado', 'aprobado', 'publicado', 'retirado');
create type creative_angle as enum ('problema', 'demostracion', 'antes_despues', 'comparacion', 'prueba_social', 'unboxing', 'otro');
create type ad_platform as enum ('tiktok', 'meta', 'tiktok_shop');
create type creator_status as enum ('contactado', 'muestra_enviada', 'contenido_publicado', 'afiliado', 'descartado');
create type script_status as enum ('borrador', 'revisado', 'aprobado');
create type campaign_status as enum ('borrador', 'activa', 'pausada', 'finalizada');

create table creators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  handle text,
  platform text not null default 'tiktok',
  contact text,
  status creator_status not null default 'contactado',
  commission_pct numeric(5,4),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table scripts (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^GUI-[0-9]{4}$'),
  product_id uuid not null references products(id) on delete cascade,
  angle creative_angle not null default 'problema',
  hook text not null,
  problem text not null default '',
  demo text not null default '',
  proof text not null default '',
  offer text not null default '',
  cta text not null default '',
  status script_status not null default 'borrador',
  contains_ai boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table creatives (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^CRE-[0-9]{4}$'),
  product_id uuid not null references products(id) on delete cascade,
  script_id uuid references scripts(id) on delete set null,
  creator_id uuid references creators(id) on delete set null,
  hook text not null,
  angle creative_angle not null default 'otro',
  format text not null default 'video_vertical',
  duration_s integer,
  platforms ad_platform[] not null default '{tiktok}',
  status creative_status not null default 'idea',
  contains_ai boolean not null default false,
  sponsored boolean not null default false,
  url text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index creatives_product_idx on creatives(product_id);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^CAM-[0-9]{4}$'),
  name text not null,
  product_id uuid references products(id) on delete set null,
  platform ad_platform not null default 'tiktok',
  objective text not null default 'ventas',
  daily_budget_cents integer,
  test_cap_cents integer,
  starts_on date,
  ends_on date,
  status campaign_status not null default 'borrador',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table content_calendar (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  platform text not null default 'tiktok',
  kind text not null default 'organico' check (kind in ('organico', 'pago', 'creador')),
  creative_id uuid references creatives(id) on delete set null,
  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index content_calendar_day_idx on content_calendar(day);

create table import_mappings (
  platform ad_platform primary key,
  mapping jsonb not null,
  updated_at timestamptz not null default now()
);

create table metric_imports (
  id uuid primary key default gen_random_uuid(),
  platform ad_platform not null,
  filename text not null,
  rows_ok integer not null,
  rows_error integer not null,
  errors jsonb not null default '[]',
  date_from date,
  date_to date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table ad_metrics_daily (
  id bigint generated always as identity primary key,
  day date not null,
  platform ad_platform not null,
  campaign_name text not null,
  ad_name text not null default '',
  product_id uuid references products(id) on delete set null,
  creative_id uuid references creatives(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  impressions integer not null default 0,
  clicks integer not null default 0,
  spend_cents integer not null default 0,
  add_to_cart integer not null default 0,
  purchases integer not null default 0,
  revenue_cents integer not null default 0,
  video_views integer,
  import_id uuid references metric_imports(id) on delete cascade,
  unique (day, platform, campaign_name, ad_name)       -- re-importing the same report updates, never duplicates
);
create index ad_metrics_product_idx on ad_metrics_daily(product_id, day);
create index ad_metrics_creative_idx on ad_metrics_daily(creative_id, day);

-- next_code now also knows creatives, scripts and campaigns.
create or replace function public.next_code(prefix text) returns text
language plpgsql stable set search_path = '' as $$
declare n integer;
begin
  execute format(
    'select coalesce(max(substring(code from 5)::int), 0) + 1 from public.%I',
    case prefix when 'PRD' then 'products' when 'PRV' then 'suppliers' when 'MUE' then 'samples'
      when 'CRE' then 'creatives' when 'GUI' then 'scripts' when 'CAM' then 'campaigns' else null end
  ) into n;
  return prefix || '-' || lpad(n::text, 4, '0');
end $$;

do $$
declare t text;
begin
  foreach t in array array['creators','scripts','creatives','campaigns'] loop
    execute format('create trigger %I_updated before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- RLS: marketing and owner write; product/finance read results; lectura sees creatives only.
alter table creators enable row level security;
alter table scripts enable row level security;
alter table creatives enable row level security;
alter table campaigns enable row level security;
alter table content_calendar enable row level security;
alter table import_mappings enable row level security;
alter table metric_imports enable row level security;
alter table ad_metrics_daily enable row level security;

create policy creatives_read on creatives for select using (private.is_staff());
create policy scripts_read on scripts for select using (private.is_staff());
create policy calendar_read on content_calendar for select using (private.is_staff());
create policy creators_read on creators for select using (private.current_role_is('owner','marketing','producto'));
create policy campaigns_read on campaigns for select using (private.current_role_is('owner','marketing','producto','finanzas'));
create policy metrics_read on ad_metrics_daily for select using (private.current_role_is('owner','marketing','producto','finanzas'));
create policy imports_read on metric_imports for select using (private.current_role_is('owner','marketing','producto','finanzas'));
create policy mappings_read on import_mappings for select using (private.current_role_is('owner','marketing'));

create policy creatives_write on creatives for all using (private.current_role_is('owner','marketing')) with check (private.current_role_is('owner','marketing'));
create policy scripts_write on scripts for all using (private.current_role_is('owner','marketing')) with check (private.current_role_is('owner','marketing'));
create policy calendar_write on content_calendar for all using (private.current_role_is('owner','marketing')) with check (private.current_role_is('owner','marketing'));
create policy creators_write on creators for all using (private.current_role_is('owner','marketing')) with check (private.current_role_is('owner','marketing'));
create policy campaigns_write on campaigns for all using (private.current_role_is('owner','marketing')) with check (private.current_role_is('owner','marketing'));
create policy metrics_write on ad_metrics_daily for all using (private.current_role_is('owner','marketing')) with check (private.current_role_is('owner','marketing'));
create policy imports_write on metric_imports for all using (private.current_role_is('owner','marketing')) with check (private.current_role_is('owner','marketing'));
create policy mappings_write on import_mappings for all using (private.current_role_is('owner','marketing')) with check (private.current_role_is('owner','marketing'));

insert into settings (key, value, description, verified, last_reviewed_at) values
  ('ad_revenue_includes_vat', 'true', 'Los ingresos que reportan TikTok/Meta Ads incluyen IVA (revisar configuración del píxel)', false, current_date)
on conflict (key) do nothing;

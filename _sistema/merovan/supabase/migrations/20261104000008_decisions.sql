-- Phase E: decision engine output and the human decision on it.

create type decision_kind as enum ('escalar', 'arreglar', 'matar', 'esperar');
create type recommendation_status as enum ('pendiente', 'aceptada', 'rechazada', 'ejecutada', 'sustituida');

create table recommendations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  decision decision_kind not null,
  confidence text not null check (confidence in ('baja', 'media', 'alta')),
  reasons text[] not null,
  actions text[] not null,
  checks jsonb not null,          -- every rule evaluated: value, threshold, hit
  metrics jsonb not null,         -- inputs used, for audit
  period_from date,
  period_to date,
  status recommendation_status not null default 'pendiente',
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create index recommendations_product_idx on recommendations(product_id, created_at desc);
-- Only one open recommendation per product: recalculating replaces it.
create unique index recommendations_one_pending on recommendations(product_id) where status = 'pendiente';

alter table recommendations enable row level security;
create policy recommendations_read on recommendations for select
  using (private.current_role_is('owner', 'producto', 'marketing', 'finanzas'));
create policy recommendations_write on recommendations for all
  using (private.current_role_is('owner', 'producto')) with check (private.current_role_is('owner', 'producto'));

insert into settings (key, value, description, verified, last_reviewed_at) values
  ('decision_rules', '{"minOrdersToScale":10,"testWindowMinDays":7,"ctrGood":0.015,"ctrBad":0.005,"minCreativesForCtrKill":3,"maxCreativeVariants":20,"cpaKillMultiple":3,"maxReturnRate":0.15,"lowImpressions":1000,"minClicksForCtr":2000}',
   'Umbrales del motor de decisión (escalar / arreglar / matar / esperar)', true, current_date),
  ('decision_window_days', '14', 'Días de métricas que analiza el motor de decisión', true, current_date)
on conflict (key) do nothing;

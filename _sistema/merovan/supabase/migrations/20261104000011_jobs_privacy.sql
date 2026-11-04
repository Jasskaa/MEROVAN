-- Phase G: job run log (cron, exports) and GDPR tools.

create table job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,                          -- motor_diario, informe_semanal, exportar_obsidian…
  trigger text not null default 'manual',     -- manual | cron
  status text not null default 'en_curso' check (status in ('en_curso', 'ok', 'error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  details jsonb not null default '{}',
  error text,
  attempt integer not null default 1
);
create index job_runs_job_idx on job_runs(job, started_at desc);

alter table job_runs enable row level security;
create policy job_runs_read on job_runs for select using (private.current_role_is('owner', 'producto', 'finanzas', 'operaciones'));
create policy job_runs_write on job_runs for all using (private.current_role_is('owner', 'producto')) with check (private.current_role_is('owner', 'producto'));

insert into settings (key, value, description, verified, last_reviewed_at) values
  ('retention_customer_days', '2190', 'Días que se conservan datos personales de clientes tras el pedido (6 años por obligaciones contables; validar con la gestoría)', false, current_date),
  ('retention_page_views_days', '400', 'Días que se conservan las visitas anónimas', true, current_date)
on conflict (key) do nothing;

-- GDPR: everything we hold about a customer e-mail (right of access).
create or replace function public.customer_data(p_email text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object('numero', o.number, 'fecha', o.paid_at, 'total_cents', o.total_cents,
                 'estado', o.status, 'nombre', o.customer_name, 'pais', o.shipping_country))
               from public.orders o where lower(o.customer_email) = lower(p_email)), '[]'),
    'incidencias', coalesce((select jsonb_agg(jsonb_build_object('numero', t.number, 'asunto', t.subject, 'fecha', t.created_at))
               from public.tickets t where lower(t.customer_email) = lower(p_email)), '[]')
  );
$$;

-- GDPR: erase personal data but keep the accounting records (amounts, VAT, country).
create or replace function public.anonymize_customer(p_email text) returns integer
language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  if not private.current_role_is('owner') then raise exception 'Solo el owner puede anonimizar datos'; end if;
  update public.orders set customer_email = null, customer_name = 'anonimizado', tracking_number = null
   where lower(customer_email) = lower(p_email);
  get diagnostics n = row_count;
  update public.tickets set customer_email = null, notes = '[anonimizado]' where lower(customer_email) = lower(p_email);
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values (auth.uid(), 'rgpd_anonimizar', 'orders', null, jsonb_build_object('pedidos', n));
  return n;
end $$;

-- Retention: personal data of old orders and old anonymous visits (called by the daily job).
create or replace function public.apply_retention() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cust integer; views integer; c_days integer; v_days integer;
begin
  select (value #>> '{}')::int into c_days from public.settings where key = 'retention_customer_days';
  select (value #>> '{}')::int into v_days from public.settings where key = 'retention_page_views_days';
  update public.orders set customer_email = null, customer_name = 'anonimizado', tracking_number = null
   where customer_email is not null and paid_at < now() - make_interval(days => coalesce(c_days, 2190));
  get diagnostics cust = row_count;
  delete from public.page_views where at < now() - make_interval(days => coalesce(v_days, 400));
  get diagnostics views = row_count;
  return jsonb_build_object('pedidos_anonimizados', cust, 'visitas_borradas', views);
end $$;
revoke execute on function public.apply_retention() from public, anon, authenticated;
revoke execute on function public.anonymize_customer(text) from public, anon;
revoke execute on function public.customer_data(text) from public, anon;

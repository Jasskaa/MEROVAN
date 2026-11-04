-- AI agents layer: autonomy levels, hard guardrails, kill switch, task queue, runs, actions,
-- proposals, memory and the configuration centre. Everything starts in dry-run.

-- ---------- Global state (singleton) ----------
create table system_state (
  id boolean primary key default true check (id),
  kill_switch boolean not null default false,
  kill_reason text,
  dry_run boolean not null default true,         -- simulation: no external action is really executed
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into system_state default values;

create table kill_switch_events (
  id bigint generated always as identity primary key,
  action text not null check (action in ('parar', 'reanudar', 'simulacion_on', 'simulacion_off')),
  reason text not null,
  automatic boolean not null default false,
  actor uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------- Hard limits (only the owner edits them; agents read them) ----------
create table guardrails (
  key text primary key,
  label text not null,
  unit text not null check (unit in ('centimos', 'porcentaje', 'unidades')),
  value numeric not null check (value >= 0),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- Money limits start at 0: nothing that costs money can run until Jaska sets them.
insert into guardrails (key, label, unit, value) values
  ('ads_daily_max', 'Gasto publicitario máximo por día', 'centimos', 0),
  ('ads_weekly_max', 'Gasto publicitario máximo por semana', 'centimos', 0),
  ('ads_product_max', 'Gasto publicitario máximo por producto (test)', 'centimos', 0),
  ('ads_monthly_max', 'Gasto publicitario máximo del mes', 'centimos', 0),
  ('ads_increase_max_pct', 'Subida máxima de presupuesto sin aprobación', 'porcentaje', 20),
  ('supplier_daily_max', 'Gasto máximo en pedidos a proveedor por día', 'centimos', 0),
  ('samples_weekly_max', 'Gasto máximo en muestras por semana', 'centimos', 0),
  ('price_change_daily_max_pct', 'Variación máxima de precio por día', 'porcentaje', 10),
  ('min_margin_pct', 'Margen de contribución mínimo para publicar', 'porcentaje', 25),
  ('products_published_week_max', 'Productos publicados por semana', 'unidades', 2),
  ('products_in_test_max', 'Productos en test a la vez', 'unidades', 3),
  ('organic_posts_day_max', 'Publicaciones orgánicas por día y plataforma', 'unidades', 2),
  ('refund_no_approval_max', 'Reembolso máximo sin aprobación', 'centimos', 0),
  ('ai_monthly_budget', 'Presupuesto mensual de IA', 'centimos', 3000),
  ('promotion_min_approved', 'Propuestas aprobadas para recomendar subir de nivel', 'unidades', 10),
  ('auto_kill_refunds_24h', 'Reembolsos en 24 h que activan la parada automática', 'unidades', 5),
  ('auto_kill_errors_hour', 'Errores de una herramienta en 1 h que activan la parada', 'unidades', 3);

-- ---------- Autonomy per agent and action type ----------
create table autonomy_policies (
  agent text not null,
  action_type text not null,
  level smallint not null default 1 check (level between 0 and 3),
  approved_count integer not null default 0,
  rejected_count integer not null default 0,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (agent, action_type)
);

-- ---------- Work queue ----------
create table agent_tasks (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  title text not null,
  instructions text not null default '',
  input jsonb not null default '{}',
  status text not null default 'pendiente'
    check (status in ('pendiente', 'en_curso', 'hecha', 'fallida', 'bloqueada', 'cancelada')),
  priority smallint not null default 5,
  dedupe_key text unique,                          -- avoids two identical tasks
  locked_until timestamptz,                        -- lease so two workers never run the same task
  attempts smallint not null default 0,
  max_attempts smallint not null default 2,
  result jsonb,
  error text,
  parent_id uuid references agent_tasks(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agent_tasks_queue_idx on agent_tasks(status, priority, created_at);
create trigger agent_tasks_updated before update on agent_tasks for each row execute function set_updated_at();

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references agent_tasks(id) on delete set null,
  agent text not null,
  model text not null,
  status text not null default 'en_curso' check (status in ('en_curso', 'ok', 'error', 'sin_presupuesto', 'parado')),
  dry_run boolean not null,
  steps smallint not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cost_microusd bigint not null default 0,
  summary text,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index agent_runs_agent_idx on agent_runs(agent, started_at desc);

-- Every tool call an agent makes (the audit trail of agent behaviour).
create table agent_actions (
  id bigint generated always as identity primary key,
  run_id uuid references agent_runs(id) on delete cascade,
  agent text not null,
  tool text not null,
  input jsonb not null,
  outcome text not null check (outcome in ('ok', 'error', 'propuesta', 'bloqueada')),
  output jsonb,
  created_at timestamptz not null default now()
);
create index agent_actions_tool_idx on agent_actions(tool, created_at desc);

create table agent_proposals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references agent_runs(id) on delete set null,
  task_id uuid references agent_tasks(id) on delete set null,
  agent text not null,
  action_type text not null,
  title text not null,
  payload jsonb not null,
  reason text not null,
  metrics jsonb not null default '{}',
  level smallint not null,
  decision text not null check (decision in ('ejecutar', 'aprobacion', 'borrador', 'simular', 'bloquear')),
  decision_reasons text[] not null default '{}',
  compliance jsonb,                                -- veredict of the compliance agent
  status text not null default 'pendiente'
    check (status in ('pendiente', 'aprobada', 'rechazada', 'ejecutada', 'simulada', 'bloqueada', 'vetada', 'fallida')),
  idempotency_key text unique,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,
  executed_at timestamptz,
  result jsonb,
  created_at timestamptz not null default now()
);
create index agent_proposals_status_idx on agent_proposals(status, created_at desc);

-- Database-level last line of defence: nothing is executed while the kill switch is on.
create or replace function private.proposal_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status in ('ejecutada') and old.status is distinct from 'ejecutada'
     and (select kill_switch from public.system_state) then
    raise exception 'Parada global activa: no se ejecuta ninguna acción';
  end if;
  if new.status = 'ejecutada' and new.decision in ('bloquear', 'borrador') then
    raise exception 'Esta propuesta no se puede ejecutar (decisión: %)', new.decision;
  end if;
  if new.status = 'ejecutada' and new.compliance ->> 'veredicto' = 'vetado' then
    raise exception 'Vetada por Cumplimiento: no se ejecuta';
  end if;
  return new;
end $$;
create trigger agent_proposals_guard before update on agent_proposals for each row execute function private.proposal_guard();

create table agent_memory (
  id uuid primary key default gen_random_uuid(),
  scope text not null,                             -- nicho, proveedor, ganchos, producto:PRD-0001…
  key text not null,
  content text not null,
  agent text,
  created_at timestamptz not null default now(),
  unique (scope, key)
);

-- ---------- Configuration centre (what Jaska has to set up) ----------
create table config_items (
  key text primary key,
  priority smallint not null,
  area text not null,
  title text not null,
  why text not null,
  steps text[] not null,
  minutes text not null,
  where_to text not null,
  test text not null,
  agents text[] not null default '{}',
  external_wait boolean not null default false,    -- depends on an external approval that takes time
  status text not null default 'pendiente' check (status in ('pendiente', 'en_curso', 'hecho', 'bloqueado')),
  notes text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table system_state enable row level security;
alter table kill_switch_events enable row level security;
alter table guardrails enable row level security;
alter table autonomy_policies enable row level security;
alter table agent_tasks enable row level security;
alter table agent_runs enable row level security;
alter table agent_actions enable row level security;
alter table agent_proposals enable row level security;
alter table agent_memory enable row level security;
alter table config_items enable row level security;

create policy state_read on system_state for select using (private.is_staff());
create policy state_write on system_state for update using (private.current_role_is('owner', 'operaciones')) with check (private.current_role_is('owner', 'operaciones'));
create policy kill_read on kill_switch_events for select using (private.is_staff());
create policy kill_insert on kill_switch_events for insert with check (private.current_role_is('owner', 'operaciones'));

create policy guardrails_read on guardrails for select using (private.is_staff());
create policy guardrails_write on guardrails for update using (private.current_role_is('owner')) with check (private.current_role_is('owner'));
create policy autonomy_read on autonomy_policies for select using (private.is_staff());
create policy autonomy_write on autonomy_policies for all using (private.current_role_is('owner')) with check (private.current_role_is('owner'));

create policy tasks_read on agent_tasks for select using (private.is_staff());
create policy tasks_write on agent_tasks for all using (private.current_role_is('owner', 'producto')) with check (private.current_role_is('owner', 'producto'));
create policy runs_read on agent_runs for select using (private.is_staff());
create policy runs_write on agent_runs for all using (private.current_role_is('owner', 'producto')) with check (private.current_role_is('owner', 'producto'));
create policy actions_read on agent_actions for select using (private.is_staff());
create policy actions_insert on agent_actions for insert with check (private.current_role_is('owner', 'producto'));
create policy proposals_read on agent_proposals for select using (private.is_staff());
create policy proposals_write on agent_proposals for all using (private.current_role_is('owner', 'producto')) with check (private.current_role_is('owner', 'producto'));
create policy memory_read on agent_memory for select using (private.is_staff());
create policy memory_write on agent_memory for all using (private.current_role_is('owner', 'producto')) with check (private.current_role_is('owner', 'producto'));
create policy config_read on config_items for select using (private.is_staff());
create policy config_write on config_items for update using (private.current_role_is('owner')) with check (private.current_role_is('owner'));

-- AI cost per agent and month (for the budget and the panel).
create view agent_costs with (security_invoker = true) as
select agent, date_trunc('month', started_at)::date as month, count(*) as runs,
       sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens, sum(cost_microusd) as cost_microusd
from agent_runs group by 1, 2;

create index agent_tasks_parent_idx on agent_tasks(parent_id);
create index agent_runs_task_idx on agent_runs(task_id);
create index agent_actions_run_idx on agent_actions(run_id);
create index agent_proposals_run_idx on agent_proposals(run_id);
create index agent_proposals_task_idx on agent_proposals(task_id);

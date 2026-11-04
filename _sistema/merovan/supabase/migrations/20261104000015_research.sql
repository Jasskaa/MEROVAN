-- Phase 2 of the agents: niche research, scored candidates, supplier plan and verified price.
-- Candidates are not products: one becomes a product draft only when Jaska accepts it.

create table niches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  thesis text not null,                          -- why this niche, in two lines
  audience text not null default '',
  evidence text[] not null default '{}',         -- signals and where they come from
  risks text[] not null default '{}',
  confidence text not null default 'baja' check (confidence in ('baja', 'media', 'alta')),
  status text not null default 'propuesto' check (status in ('propuesto', 'elegido', 'descartado')),
  demo boolean not null default false,           -- created by the test run without an AI key
  agent text,
  run_id uuid references agent_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger niches_updated before update on niches for each row execute function set_updated_at();

create table niche_candidates (
  id uuid primary key default gen_random_uuid(),
  niche_id uuid not null references niches(id) on delete cascade,
  name text not null,
  description text not null default '',
  scores jsonb not null,                          -- 0-5 per criterion, given by the researcher
  score_total numeric(4,1) not null,              -- computed by the system
  passes boolean not null,
  score_reasons text[] not null default '{}',
  supplier_plan jsonb,                            -- principal, respaldo, ranking, warnings (computed)
  landed_cents integer,
  price_cents integer,
  margin_pct numeric(5,1),
  margin_cents integer,
  break_even_roas numeric(6,2),
  price_reasons text[] not null default '{}',
  real_data boolean not null default false,       -- false while figures are examples or estimates
  status text not null default 'propuesto' check (status in ('propuesto', 'aceptado', 'descartado')),
  product_id uuid references products(id) on delete set null,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index niche_candidates_niche_idx on niche_candidates(niche_id);
create index niche_candidates_product_idx on niche_candidates(product_id);
create index niches_run_idx on niches(run_id);
create trigger niche_candidates_updated before update on niche_candidates for each row execute function set_updated_at();

alter table niches enable row level security;
alter table niche_candidates enable row level security;
create policy niches_read on niches for select using (private.is_staff());
create policy niches_write on niches for all using (private.current_role_is('owner', 'producto')) with check (private.current_role_is('owner', 'producto'));
create policy candidates_read on niche_candidates for select using (private.is_staff());
create policy candidates_write on niche_candidates for all using (private.current_role_is('owner', 'producto')) with check (private.current_role_is('owner', 'producto'));

-- Price range the Pricing agent must respect (VAT included). Jaska adjusts it in Límites.
insert into guardrails (key, label, unit, value) values
  ('price_min_cents', 'Precio de venta mínimo (IVA incl.)', 'centimos', 995),
  ('price_max_cents', 'Precio de venta máximo (IVA incl.)', 'centimos', 4995)
on conflict (key) do nothing;

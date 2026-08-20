create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  name varchar(40) not null unique,
  display_name varchar(60) not null,
  price_cents bigint not null default 0,
  billing_cycle varchar(10) not null default 'monthly' check (billing_cycle in ('monthly','yearly','free')),
  max_members smallint not null default 1,
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  plan_id uuid not null references plans(id),
  status varchar(20) not null default 'trial' check (status in ('trial','active','past_due','cancelled','expired')),
  started_at timestamptz not null default now(),
  current_period_end timestamptz,
  cancelled_at timestamptz,
  payment_provider varchar(20),
  external_subscription_id varchar(120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id)
);
create index if not exists subscriptions_family_idx on subscriptions(family_id);
create index if not exists subscriptions_status_idx on subscriptions(status);
create table if not exists billing_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  event_type varchar(30) not null check (event_type in ('trial_started','payment_success','payment_failed','plan_changed','cancelled','refund')),
  amount_cents bigint,
  provider varchar(20),
  external_event_id varchar(120),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists billing_events_family_idx on billing_events(family_id, created_at desc);
insert into plans (name, display_name, price_cents, billing_cycle, max_members, features, sort_order)
values
  ('free', 'Gratuito', 0, 'free', 1, '{"budgets": true, "goals": true, "reports": "basic"}'::jsonb, 1),
  ('familia', 'Família', 1990, 'monthly', 20, '{"budgets": true, "goals": true, "reports": "advanced", "reserves": true, "cards": true, "investments": true}'::jsonb, 2),
  ('premium', 'Premium', 3990, 'monthly', 20, '{"budgets": true, "goals": true, "reports": "advanced", "reserves": true, "cards": true, "investments": true, "open_finance": true, "priority_support": true}'::jsonb, 3)
on conflict (name) do nothing;
insert into subscriptions (family_id, plan_id, status, current_period_end)
select f.id, p.id, 'trial', now() + interval '14 days'
from families f
cross join (select id from plans where name = 'familia' limit 1) p
where not exists (select 1 from subscriptions s where s.family_id = f.id)
on conflict do nothing;
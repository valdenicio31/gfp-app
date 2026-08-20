create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  owner_user_id uuid references users(id) on delete set null,
  category varchar(50) not null,
  limit_cents bigint not null check (limit_cents > 0),
  period_month smallint not null check (period_month between 1 and 12),
  period_year smallint not null check (period_year between 2020 and 2100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, category, period_month, period_year)
);
create index if not exists budgets_family_period_idx on budgets(family_id, period_year desc, period_month desc);
create index if not exists budgets_owner_idx on budgets(owner_user_id);
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  created_by uuid not null references users(id) on delete cascade,
  title varchar(120) not null,
  description text,
  target_cents bigint not null check (target_cents > 0),
  current_cents bigint not null default 0 check (current_cents >= 0),
  deadline date,
  status varchar(20) not null default 'active' check (status in ('active','completed','cancelled')),
  emoji varchar(12) not null default '🎯',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists goals_family_idx on goals(family_id, status, deadline);
create index if not exists goals_creator_idx on goals(created_by);
create table if not exists goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  amount_cents bigint not null,
  type varchar(10) not null check (type in ('deposit','withdraw')),
  note varchar(200),
  created_at timestamptz not null default now()
);
create index if not exists contributions_goal_idx on goal_contributions(goal_id, created_at desc);
create index if not exists contributions_family_idx on goal_contributions(family_id);
create table if not exists reserves (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  owner_user_id uuid references users(id) on delete set null,
  name varchar(80) not null default 'Reserva de Emergência',
  target_cents bigint not null check (target_cents > 0),
  current_cents bigint not null default 0 check (current_cents >= 0),
  monthly_target_cents bigint default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reserves_family_idx on reserves(family_id, is_active);
create table if not exists reserve_movements (
  id uuid primary key default gen_random_uuid(),
  reserve_id uuid not null references reserves(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  amount_cents bigint not null,
  type varchar(10) not null check (type in ('deposit','withdraw')),
  note varchar(200),
  created_at timestamptz not null default now()
);
create index if not exists reserve_movements_reserve_idx on reserve_movements(reserve_id, created_at desc);
create index if not exists reserve_movements_family_idx on reserve_movements(family_id);
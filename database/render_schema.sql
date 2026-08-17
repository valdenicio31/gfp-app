-- GFP | PostgreSQL para Render
-- Execute no Render Postgres após criar a instância.
create extension if not exists pgcrypto;

create table app_users(
  id uuid primary key default gen_random_uuid(),
  email text not null unique check(email = lower(email)),
  password_hash text not null,
  full_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app_sessions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table clifor(
  id text primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  code integer not null,
  name text not null,
  type text not null check(type in ('1 - Cliente','2 - Fornecedor','3 - Ambos')),
  trade_name text, cep text, address text, number text, complement text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,code)
);
create table banks(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references app_users(id) on delete cascade,
  code integer not null, bank_number text not null, bank_name text not null, agency_number text, agency_name text, account_number text,
  cep text, address text, number text, complement text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,code)
);
create table histories(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references app_users(id) on delete cascade,
  code text not null, description text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,code)
);
create table launches(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references app_users(id) on delete cascade,
  launch_date date not null, type text not null check(type in ('Receita','Despesa')), description text not null, amount numeric(14,2) not null check(amount>0),
  clifor_id text references clifor(id) on delete restrict, bank_id uuid references banks(id) on delete restrict, history_id uuid references histories(id) on delete restrict,
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table planning_records(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references app_users(id) on delete cascade,
  module text not null check(module in ('cards','debts','investments','assets','goals','reserve')), payload jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table user_snapshots(
  user_id uuid primary key references app_users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index launches_user_date_idx on launches(user_id,launch_date desc);
create index planning_records_user_module_idx on planning_records(user_id,module);

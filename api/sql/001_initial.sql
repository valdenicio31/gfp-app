create extension if not exists pgcrypto;

create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  name varchar(80) not null,
  license_status varchar(20) not null default 'trial',
  member_limit smallint not null default 6 check (member_limit between 1 and 20),
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name varchar(80) not null,
  email varchar(254) not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role varchar(20) not null check (role in ('admin','adult','dependent','viewer')),
  status varchar(20) not null default 'invited' check (status in ('invited','active','suspended')),
  primary key (family_id,user_id)
);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  owner_user_id uuid references users(id) on delete set null,
  name varchar(80) not null,
  type varchar(20) not null,
  balance_cents bigint not null default 0,
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  created_by uuid references users(id) on delete set null,
  type varchar(12) not null check (type in ('income','expense','transfer')),
  description varchar(140) not null,
  amount_cents bigint not null check (amount_cents > 0),
  occurred_on date not null,
  created_at timestamptz not null default now()
);

create index if not exists memberships_family_idx on memberships(family_id);
create index if not exists accounts_family_idx on accounts(family_id);
create index if not exists transactions_family_date_idx on transactions(family_id,occurred_on desc);

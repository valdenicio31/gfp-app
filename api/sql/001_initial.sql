create extension if not exists pgcrypto;

create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  name varchar(80) not null,
  license_status varchar(20) not null default 'trial',
  member_limit smallint not null default 20 check (member_limit between 1 and 20),
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

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  email varchar(254) not null,
  role varchar(20) not null check (role in ('adult','dependent','viewer')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists family_profiles (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name varchar(50) not null,
  base_role varchar(20) not null check (base_role in ('admin','adult','dependent','viewer')),
  emoji varchar(12) not null default '👤',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (family_id,name)
);

alter table memberships add column if not exists profile_id uuid references family_profiles(id) on delete set null;
alter table invitations add column if not exists profile_id uuid references family_profiles(id) on delete set null;
alter table users add column if not exists cpf varchar(11) unique;
alter table users add column if not exists birth_date date;
alter table users add column if not exists phone varchar(11);
alter table users add column if not exists avatar_emoji varchar(12) default '👤';
alter table users add column if not exists photo_data text;
alter table users add column if not exists cep varchar(8);
alter table users add column if not exists street varchar(120);
alter table users add column if not exists address_number varchar(20);
alter table users add column if not exists complement varchar(80);
alter table users add column if not exists district varchar(80);
alter table users add column if not exists city varchar(80);
alter table users add column if not exists state varchar(2);
alter table invitations add column if not exists name varchar(80);
alter table invitations add column if not exists cpf varchar(11);
alter table invitations add column if not exists birth_date date;
alter table invitations add column if not exists phone varchar(11);
alter table invitations add column if not exists avatar_emoji varchar(12) default '👤';
alter table invitations add column if not exists photo_data text;
alter table invitations add column if not exists cep varchar(8);
alter table invitations add column if not exists street varchar(120);
alter table invitations add column if not exists address_number varchar(20);
alter table invitations add column if not exists complement varchar(80);
alter table invitations add column if not exists district varchar(80);
alter table invitations add column if not exists city varchar(80);
alter table invitations add column if not exists state varchar(2);
alter table families alter column member_limit set default 20;
update families set member_limit=20 where member_limit<20;

insert into family_profiles (family_id,name,base_role,emoji,is_default)
select f.id,p.name,p.base_role,p.emoji,true from families f cross join (values
  ('Administrador','admin','👑'),('Adulto','adult','👤'),('Dependente','dependent','🧒'),('Somente leitura','viewer','👁️')
) p(name,base_role,emoji) on conflict (family_id,name) do nothing;

update memberships m set profile_id=p.id from family_profiles p
where m.profile_id is null and p.family_id=m.family_id and p.base_role=m.role and p.is_default=true;

create index if not exists memberships_family_idx on memberships(family_id);
create index if not exists accounts_family_idx on accounts(family_id);
create index if not exists transactions_family_date_idx on transactions(family_id,occurred_on desc);
create index if not exists invitations_family_idx on invitations(family_id,created_at desc);
create unique index if not exists one_admin_per_family on memberships(family_id) where role='admin' and status='active';
create index if not exists profiles_family_idx on family_profiles(family_id);

create table if not exists credit_cards (id uuid primary key default gen_random_uuid(),family_id uuid not null references families(id) on delete cascade,owner_user_id uuid not null references users(id) on delete cascade,name varchar(60) not null,brand varchar(30) not null,last_four varchar(4) not null,limit_cents bigint not null check(limit_cents>0),closing_day smallint not null check(closing_day between 1 and 31),due_day smallint not null check(due_day between 1 and 31),created_at timestamptz not null default now());
create table if not exists card_purchases (id uuid primary key default gen_random_uuid(),family_id uuid not null references families(id) on delete cascade,card_id uuid not null references credit_cards(id) on delete cascade,created_by uuid not null references users(id) on delete cascade,description varchar(120) not null,category varchar(40) not null,amount_cents bigint not null check(amount_cents>0),installments smallint not null default 1 check(installments between 1 and 48),purchased_on date not null,created_at timestamptz not null default now());
create index if not exists credit_cards_family_idx on credit_cards(family_id,owner_user_id);
create index if not exists card_purchases_family_idx on card_purchases(family_id,purchased_on desc);

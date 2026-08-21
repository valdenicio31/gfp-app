-- 011: agenda de contas a pagar e a receber, com recorrência.
-- Uma linha em scheduled_bills descreve o compromisso ("aluguel, todo dia 10").
-- Cada vez que a família paga, nasce uma linha em scheduled_bill_payments
-- ligada ao lançamento que foi criado — assim nada é pago duas vezes.
create table if not exists scheduled_bills (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  created_by uuid references users(id) on delete set null,
  kind varchar(10) not null check (kind in ('payable','receivable')),
  description varchar(160) not null,
  amount_cents bigint not null check (amount_cents > 0),
  category varchar(40),
  supplier varchar(120),
  account_id uuid references accounts(id) on delete set null,
  recurrence varchar(10) not null default 'monthly' check (recurrence in ('once','weekly','monthly','yearly')),
  day_of_month smallint check (day_of_month between 1 and 31),
  weekday smallint check (weekday between 0 and 6),
  month_of_year smallint check (month_of_year between 1 and 12),
  first_due_on date not null,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agenda_family_idx on scheduled_bills(family_id, is_active, kind);

create table if not exists scheduled_bill_payments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  bill_id uuid not null references scheduled_bills(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete set null,
  due_on date not null,
  paid_on date not null,
  amount_cents bigint not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists agenda_pago_unico on scheduled_bill_payments(bill_id, due_on);
create index if not exists agenda_pago_family_idx on scheduled_bill_payments(family_id, due_on);

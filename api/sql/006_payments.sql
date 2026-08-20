create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  provider varchar(20) not null default 'asaas' check (provider in ('asaas','stripe','mercadopago')),
  external_payment_id varchar(120),
  status varchar(20) not null default 'pending' check (status in ('pending','confirmed','overdue','cancelled','refunded')),
  amount_cents bigint not null check (amount_cents > 0),
  plan_name varchar(40),
  period varchar(10) not null default 'monthly' check (period in ('monthly','yearly')),
  due_date date,
  paid_at timestamptz,
  pix_code varchar(600),
  pix_qr_url varchar(500),
  boleto_url varchar(500),
  boleto_barcode varchar(60),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_family_idx on payments(family_id, created_at desc);
create index if not exists payments_status_idx on payments(status, due_date);
create index if not exists payments_external_idx on payments(external_payment_id);
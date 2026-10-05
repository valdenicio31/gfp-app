-- 015: empréstimos — consignado, pessoal, CDC, financiamento.

-- O contrato fica em loans; o cronograma, uma linha por parcela, em
-- loan_installments. O cronograma é gerado na tela pela Tabela Price
-- (v2-emprestimos-calculo.js) e conferido pela API antes de gravar.
--
-- Pagar uma parcela pode acontecer de três jeitos, e a coluna
-- payment_mode registra qual foi:
--   'linked'  a parcela foi ligada a um lançamento que já existia — em geral
--             o débito que veio no extrato importado. Nada novo entra na
--             conta, e o fluxo de caixa não conta o pagamento duas vezes;
--   'created' o sistema criou o lançamento de despesa na conta escolhida;
--   'marked'  só marcada como paga, sem lançamento — para as parcelas de
--             antes de o contrato ser cadastrado no GFP.
-- Desfazer a baixa apaga o lançamento só no caso 'created'.

create table if not exists loans (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  created_by uuid references users(id) on delete set null,
  name varchar(80) not null,
  lender varchar(80),
  kind varchar(20) not null default 'pessoal'
    check (kind in ('consignado','pessoal','cdc','financiamento','cheque_especial','outro')),
  principal_cents bigint not null check (principal_cents > 0),
  installments_count smallint not null check (installments_count between 1 and 600),
  monthly_rate numeric(12,10) not null default 0 check (monthly_rate >= 0),
  installment_cents bigint not null check (installment_cents > 0),
  first_due_on date not null,
  account_id uuid references accounts(id) on delete set null,
  category varchar(40) not null default 'Empréstimos',
  notes varchar(400),
  status varchar(10) not null default 'active' check (status in ('active','settled','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists loans_family_idx on loans(family_id, status);

create table if not exists loan_installments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  loan_id uuid not null references loans(id) on delete cascade,
  number smallint not null check (number >= 1),
  due_on date not null,
  amount_cents bigint not null check (amount_cents > 0),
  interest_cents bigint not null default 0 check (interest_cents >= 0),
  amortization_cents bigint not null,
  balance_after_cents bigint not null default 0,
  paid_on date,
  paid_cents bigint check (paid_cents > 0),
  payment_mode varchar(8) check (payment_mode in ('linked','created','marked')),
  transaction_id uuid references transactions(id) on delete set null,
  paid_by uuid references users(id) on delete set null,
  unique (loan_id, number)
);
create index if not exists loan_installments_family_idx on loan_installments(family_id, due_on);

-- Um lançamento paga no máximo uma parcela.
create unique index if not exists loan_installments_transaction_unico
  on loan_installments(transaction_id) where transaction_id is not null;

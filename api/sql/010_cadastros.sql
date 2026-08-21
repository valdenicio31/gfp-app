-- 010: cadastros livres da família — categorias, bancos, agências, fornecedores e clientes.
-- Os lançamentos continuam guardando o NOME da categoria e do fornecedor; renomear
-- no cadastro atualiza os lançamentos, então não existem duas versões da verdade.

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name varchar(40) not null,
  kind varchar(10) not null default 'expense' check (kind in ('income','expense','both')),
  emoji varchar(12),
  color varchar(9),
  background varchar(9),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (family_id, name)
);

create table if not exists banks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name varchar(80) not null,
  code varchar(10),
  created_at timestamptz not null default now(),
  unique (family_id, name)
);

create table if not exists bank_branches (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  bank_id uuid not null references banks(id) on delete cascade,
  number varchar(20) not null,
  name varchar(80),
  created_at timestamptz not null default now(),
  unique (bank_id, number)
);

-- fornecedor, cliente ou os dois; match_terms são os pedaços de texto que
-- identificam esse parceiro na descrição do extrato, separados por ;
create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name varchar(120) not null,
  kind varchar(10) not null default 'supplier' check (kind in ('supplier','client','both')),
  document varchar(20),
  category varchar(40),
  match_terms text,
  created_at timestamptz not null default now(),
  unique (family_id, name)
);

create index if not exists partners_family_idx on partners(family_id);
create index if not exists categories_family_idx on categories(family_id);

alter table accounts add column if not exists bank_id uuid references banks(id) on delete set null;
alter table accounts add column if not exists branch_id uuid references bank_branches(id) on delete set null;
alter table accounts add column if not exists account_number varchar(30);

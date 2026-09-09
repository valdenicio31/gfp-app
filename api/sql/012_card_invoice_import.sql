-- 012: importação de fatura de cartão e o de-para das categorias.

-- A fatura do cartão traz a categoria no vocabulário do emissor: "Restaurantes"
-- no Nubank, "Alimentação e bebidas" em outro. Guardar essa categoria como veio
-- é o que permite ensinar o sistema uma vez e acertar sozinho nas próximas.
alter table card_purchases add column if not exists source_category varchar(80);

-- Marca da importação: a mesma fatura relançada não duplica compra nenhuma,
-- mesmo padrão já usado em transactions.
alter table card_purchases add column if not exists import_hash varchar(64);
alter table card_purchases add column if not exists import_source varchar(120);

create unique index if not exists card_purchases_import_hash_idx
  on card_purchases(family_id, import_hash) where import_hash is not null;

-- O de-para vive por cartão, e não por família: cada emissor tem o seu
-- vocabulário, e a mesma palavra pode significar coisas diferentes entre eles.
create table if not exists card_category_map (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  card_id uuid not null references credit_cards(id) on delete cascade,
  source_category varchar(80) not null,
  category varchar(40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma linha por categoria de origem em cada cartão.
create unique index if not exists card_category_map_unico_idx
  on card_category_map(card_id, source_category);

create index if not exists card_category_map_familia_idx
  on card_category_map(family_id);

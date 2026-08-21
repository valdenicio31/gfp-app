-- 008: categoria e fornecedor nos lançamentos.
-- Colunas opcionais: lançamento sem categoria continua válido e aparece como "(Sem categoria)".
alter table transactions add column if not exists category varchar(40);
alter table transactions add column if not exists supplier varchar(120);

create index if not exists transactions_family_category_idx on transactions(family_id, category);
create index if not exists transactions_family_type_idx on transactions(family_id, type);

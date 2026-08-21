-- 009: marca de importação, para o mesmo extrato nunca entrar duas vezes.
alter table transactions add column if not exists import_hash varchar(64);
alter table transactions add column if not exists import_source varchar(120);

-- a marca é única dentro da família: reimportar o mesmo arquivo não duplica nada
create unique index if not exists transactions_import_hash_idx
  on transactions(family_id, import_hash) where import_hash is not null;

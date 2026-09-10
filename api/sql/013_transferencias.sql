-- 013: transferência entre contas do mesmo titular.

-- Dinheiro que sai de um banco e entra em outro do mesmo CPF/CNPJ não é receita
-- nem despesa: é o mesmo patrimônio mudando de lugar. Lançar as duas pontas
-- como entrada e saída infla o "entrou" e o "saiu" do mês com movimento que
-- não existiu.
--
-- Por isso a transferência é um par de lançamentos com type='transfer' — que o
-- painel já ignora ao somar receitas e despesas — ligados pelo mesmo
-- transfer_id. Assim o saldo de cada conta continua sendo calculado do jeito
-- que sempre foi, e as duas pontas se reconhecem.
alter table transactions add column if not exists transfer_id uuid;

-- A ponta oposta da transferência: de onde veio ou para onde foi.
alter table transactions add column if not exists transfer_account_id uuid
  references accounts(id) on delete set null;

-- Qual das duas pontas é esta. Sem isso, as duas linhas do par são idênticas
-- em estrutura e só se distinguiriam por artifício na consulta.
alter table transactions add column if not exists transfer_direction varchar(3)
  check (transfer_direction in ('out','in'));

create index if not exists transactions_transfer_idx
  on transactions(family_id, transfer_id) where transfer_id is not null;

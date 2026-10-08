-- 016: cobrança pelo Asaas — planos individuais, teste grátis, assinatura e avisos de pagamento.
-- Este arquivo roda a cada subida da API: tudo aqui pode repetir sem efeito colateral.

-- Planos do GFP individual. Os três de antes (gratuito, família, premium) saem de venda.
insert into plans (name, display_name, price_cents, billing_cycle, max_members, features, sort_order)
values
  ('mensal', 'Mensal', 990, 'monthly', 1, '{}'::jsonb, 10),
  ('anual', 'Anual', 6990, 'yearly', 1, '{}'::jsonb, 11)
on conflict (name) do nothing;
update plans set is_active=false where name in ('free','familia','premium') and is_active=true;

-- exempt: conta de cortesia, liberada sem prazo e sem cobrança.
alter table subscriptions add column if not exists exempt boolean not null default false;
-- cliente no Asaas (o CPF fica só lá; aqui guardamos apenas o identificador)
alter table subscriptions add column if not exists external_customer_id varchar(120);
-- plano escolhido na contratação, enquanto o primeiro pagamento não é confirmado
alter table subscriptions add column if not exists pending_plan varchar(40);
-- primeiro pagamento confirmado: é daqui que contam os 7 dias de arrependimento
alter table subscriptions add column if not exists contracted_at timestamptz;
-- vencimento da cobrança que está em atraso; nulo quando está em dia
alter table subscriptions add column if not exists overdue_since date;
-- vencimento da próxima cobrança já gerada pelo Asaas
alter table subscriptions add column if not exists next_due_on date;

alter table payments add column if not exists invoice_url varchar(500);
alter table payments add column if not exists billing_type varchar(20);
-- de qual assinatura do Asaas a cobrança veio: o arrependimento estorna só as da contratação atual
alter table payments add column if not exists external_subscription_id varchar(120);
create unique index if not exists payments_external_unico on payments(external_payment_id) where external_payment_id is not null;

-- Avisos já recebidos do Asaas. A entrega é "pelo menos uma vez": o mesmo
-- aviso pode chegar repetido, e o identificador dele impede processar de novo.
create table if not exists webhook_events (
  id varchar(120) primary key,
  provider varchar(20) not null default 'asaas',
  event varchar(60) not null,
  received_at timestamptz not null default now()
);

-- Contas que já existiam antes de a cobrança entrar no ar ficam liberadas sem prazo.
update subscriptions s set exempt=true
from families f
where f.id=s.family_id and s.exempt=false and s.status='trial'
  and s.external_subscription_id is null
  and f.created_at < timestamptz '2026-10-08 14:30:00+00';

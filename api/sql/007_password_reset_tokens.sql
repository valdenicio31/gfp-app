-- Fase 03: tokens de recuperação de senha.
-- Migração separada de propósito: o 001_initial.sql já foi aplicado no banco
-- de produção e não é reexecutado, então a tabela precisa vir em arquivo novo.
create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash char(64) not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_reset_tokens_user_idx on password_reset_tokens(user_id,expires_at desc);

-- 017: painel do dono — quem pode ver a lista de clientes.
-- Roda a cada subida da API: tudo aqui pode repetir sem efeito colateral.

-- O cadastro não confirma o e-mail. Para o painel do dono isso importa: sem
-- confirmação, qualquer pessoa poderia se cadastrar com um e-mail da lista de
-- donos que ainda estivesse livre. O e-mail passa a contar como confirmado
-- quando a pessoa redefine a senha pelo link recebido nele.
alter table users add column if not exists email_verified_at timestamptz;

-- Contas criadas antes de o painel existir são as do próprio dono e dos testes.
update users set email_verified_at = created_at
where email_verified_at is null and created_at < timestamptz '2026-10-10 12:40:00+00';

# GFP Familiar V2 — Arquitetura Oficial

## Princípios

- Multiempresa por família: toda entidade financeira pertence a uma `family_id`.
- Identidade individual: cada pessoa possui login, perfil e sessões próprios.
- Menor privilégio: permissões explícitas por papel e recurso.
- Privacidade: lançamentos podem ser privados, familiares ou compartilhados com membros escolhidos.
- Auditoria: login, convite, mudança de permissão, exportação e alteração financeira geram evento.
- Licenciamento separado dos dados financeiros.

## Entidades

| Entidade | Campos essenciais |
|---|---|
| Family | id, nome, administrador, plano, situação da licença |
| User | id, nome, e-mail, senha protegida, status |
| Membership | family_id, user_id, papel, permissões, status |
| Account | family_id, proprietário, nome, tipo, saldo inicial |
| Card | family_id, proprietário, limite, fechamento, vencimento |
| Transaction | family_id, autor, conta, tipo, valor, visibilidade |
| Budget | family_id, proprietário opcional, categoria, período, limite |
| Goal | family_id, criador, participantes, valor-alvo, prazo |
| Invitation | family_id, e-mail, papel, token protegido, validade |
| AuditEvent | family_id, ator, ação, alvo, data, resultado |

## Papéis

- `family_admin`: família, licença, membros, permissões e consolidado.
- `adult`: dados próprios e recursos compartilhados autorizados.
- `dependent`: carteira, mesada, metas e limites definidos.
- `viewer`: consulta somente aos recursos explicitamente concedidos.

## Regras críticas

1. Toda consulta financeira filtra `family_id` no servidor.
2. O cliente nunca define sozinho a família autorizada.
3. Senhas usam Argon2id ou mecanismo gerenciado equivalente.
4. Tokens de convite e recuperação são de uso único e expiram.
5. Alteração de administrador exige confirmação e auditoria.
6. Dados privados de adultos não aparecem no consolidado sem consentimento.
7. Exclusões financeiras usam lixeira auditável antes da remoção definitiva.

## Ambientes

- Protótipo V2: dados demonstrativos no navegador, sem autenticação real.
- Homologação: API, banco e e-mail transacional controlados.
- Produção: HTTPS, backups, monitoramento, política de retenção e recuperação.


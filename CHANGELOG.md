# Histórico de versões — GFP (Gestão Financeira Pessoal)

A versão em uso aparece no sistema (rodapé, barra lateral e em **Ajuda → Novidades e versões**)
e na API, em `GET /health`.

## Como versionar

O número segue o padrão **X.Y.Z**:

| Parte | Muda quando | Exemplo |
|---|---|---|
| **X** (maior) | o jeito de usar muda, ou dados antigos precisam ser convertidos | 1.4.2 → 2.0.0 |
| **Y** (menor) | entra funcionalidade nova | 1.0.3 → 1.1.0 |
| **Z** (correção) | corrige erro ou faz ajuste pequeno | 1.1.0 → 1.1.1 |

Cada publicação altera, no mesmo commit:

1. `versao.js`: `GFP_VERSAO` e uma entrada nova **no topo** de `GFP_HISTORICO`;
2. `api/package.json` (e `api/package-lock.json`): campo `version`;
3. `sw.js`: `const CACHE = 'gfp-X.Y.Z'`, que faz os aparelhos descartarem as telas antigas;
4. este arquivo, com a mesma entrada.

`npm test` (na pasta `api`) falha se esses números não baterem. Depois do push, marque a versão:
`git tag vX.Y.Z && git push origin vX.Y.Z`.

---

## 2.3.0 — 08/10/2026 · Assinatura: teste grátis, planos e pagamento

- Licença de verdade. `api/src/licenca.js` calcula a situação da conta (cortesia, teste, ativa, atrasada, suspensa, cancelada, encerrada) e o acesso (total ou só consulta). Toda rota autenticada que grava passa pela conferência em `requireAuth` e responde 402 quando a conta está só para consulta; leitura e exportação continuam liberadas.
- Cobrança pelo Asaas em `api/src/cobranca.js`: `GET /billing/license`, `POST /billing/subscribe` (cria cliente e assinatura e devolve a fatura), `POST /billing/cancel`, `POST /billing/refund` (arrependimento em 7 dias) e `POST /billing/webhook/asaas` (avisos de pagamento, protegidos por senha no cabeçalho e sem reprocessar aviso repetido). O webhook é cadastrado no Asaas na subida da API.
- Mensal só no cartão; anual com cartão, Pix ou boleto. O GFP não recebe dados de cartão, e o CPF informado vai direto para o Asaas, sem ser gravado.
- Migração `016_cobranca.sql`: planos `mensal` e `anual`, colunas de assinatura e pagamento, tabela `webhook_events`. Contas criadas antes de 08/10/2026 11h30 ficam de cortesia, liberadas sem prazo. Conta nova nasce com 14 dias de teste.
- Tela Assinatura (`v2-assinatura.js`), selo da licença na barra lateral e faixa de aviso. Termos de Uso ajustados: fim do teste e inadimplência deixam a conta só para consulta, em vez de bloqueada.
- Testes: `tests/cobranca.test.mjs` cobre as regras e o ciclo completo contra PostgreSQL e um Asaas simulado.

## 2.2.1 — 08/10/2026 · Endereço próprio e servidor sempre ligado

- Domínio próprio `gfp.viaiasolucoes.com` (CNAME para o site estático no Render) e API em instância paga, que não hiberna. Saíram do manual e da tela de Lançamentos os avisos de "servidor dormindo".
- Cobrança, primeira peça: `api/src/cobranca.js` lê `ASAAS_API_KEY` e `ASAAS_API_URL` e confere a conexão com o Asaas. `GET /billing/status` (autenticado, resultado guardado por um minuto) devolve se está configurada, o ambiente e se a conexão funciona — nunca a chave nem dados da conta.
- Testes: `tests/cobranca.test.mjs`.

## 2.2.0 — 08/10/2026 · Período, banco e conta — e painéis de receitas e despesas

- Lançamentos abre sempre no mês atual. O campo Período escolhe um mês anterior, uma data inicial e uma final, ou todos os lançamentos; ao lado ficam os filtros de banco, conta e categoria.
- A tela pede à API só o período escolhido (`from`/`to`), além dos mais recentes de qualquer data, que a importação usa para reconhecer fornecedor e categoria.
- A conferência da exclusão por período passa a vir do servidor, para mostrar exatamente o que será apagado.
- Central: "Entrou x saiu" virou "Receitas x despesas"; filtros de banco e conta (`GET /dashboard?bank_id=&account_id=`, com `bank_id=none` para contas sem banco) ou tudo consolidado. Agenda, metas, orçamento e cartões continuam consolidados.
- Central: abas Receitas e Despesas, por tipo e por mês no ano atual e o total dos últimos cinco anos (`ano_atual` na resposta de `/dashboard`). Regra em `api/src/painel.js`.
- Empréstimos: parcelas pagas e a pagar, juros pagos e a pagar, economia por antecipação e a listagem dos contratos. O desconto de uma antecipação sai dos juros pagos e entra só na economia (`custoDaParcela`).
- O alerta da reserva de emergência deixou de mencionar família.
- Testes: `tests/painel.test.mjs`.

## 2.1.0 — 05/10/2026 · A categoria acompanha o fornecedor

- Ao incluir ou alterar um lançamento com fornecedor ou cliente, a categoria é aplicada a todos os outros lançamentos do mesmo parceiro, inclusive os que tinham outra categoria. Transferências ficam de fora.
- O cadastro do fornecedor ou cliente recebe a categoria (e é criado se não existir), para as próximas importações.
- API: `POST /transactions` e `PATCH /transactions/:id` devolvem `replicated`, o número de lançamentos reclassificados. Regra em `api/src/categoria-fornecedor.js`.
- `npm test` passa a rodar um arquivo por vez, porque dois testes recriam o mesmo banco de teste.

## 2.0.0 — 05/10/2026 · GFP — Gestão Financeira Pessoal

Mudança de conceito: o sistema deixa de ser familiar e passa a ser **individual**.

- Nome: GFP — Gestão Financeira Pessoal, em todas as telas, no aplicativo instalável, nos e-mails e nos documentos.
- Cadastro pede só nome, e-mail e senha. Na API, `familyName` virou opcional e assume o nome da pessoa.
- Saem das telas o cadastro de usuários, os perfis, a troca "toda a família / só meus dados" e os painéis por membro.
- API: `POST /family/invitations` e `POST /family/profiles` respondem 410. Nada foi removido do banco.
- Contas antigas com mais de um usuário continuam funcionando para quem já estava cadastrado.
- Termos de Uso e Política de Privacidade (versão 2.0), manual e página de planos reescritos para o uso individual.
- Preços novos: R$ 9,90 por mês ou R$ 69,90 por ano (equivale a R$ 5,83 por mês), nos Termos e na página de planos.
- Todas as imagens do manual refeitas com as telas da versão individual.

## 1.1.1 — 05/10/2026 · Termos e página de planos

- Termos de Uso e Política de Privacidade: CNPJ, endereço, encarregado de dados, data de vigência e os fornecedores (Render, Asaas, Resend) preenchidos.
- Página de apresentação alinhada aos Termos: planos mensal (R$ 19,90) e anual (R$ 149,00), 14 dias de teste. Saem o plano Gratuito e o Premium.
- Removidas promessas de recursos que não existem (API de integração, relatórios personalizados, auditoria).

## 1.1.0 — 28/09/2026 · Empréstimos e financiamentos

- Tela Empréstimos: consignado, pessoal, CDC, financiamento e cheque especial, com saldo devedor, juros e próxima parcela.
- Cadastro com prévia do cronograma pela Tabela Price, informando a taxa ou só o valor da parcela.
- Baixa de parcela no modo "vincular ou criar": procura o débito no extrato e liga a parcela a ele; se não achar, cria a despesa na conta.
- Antecipação com desconto registrada como economia.
- Contratos antigos: parcelas vencidas entram como pagas, sem mexer nas contas.
- Banco: migração `015_emprestimos.sql` (tabelas `loans` e `loan_installments`).
- API: rotas `/loans` em `api/src/emprestimos.js`, com testes de ponta a ponta contra PostgreSQL (`GFP_TEST_PG`).
- Manual: seções "Empréstimos e financiamentos" e "Pagar parcela sem lançar duas vezes".

## 1.0.0 — 28/09/2026 · Primeira versão oficial

Marco zero do versionamento: tudo o que já estava no ar passa a ser a versão 1.0.

- Família com administrador, adultos, dependentes e somente leitura.
- Central da família com saldo, entradas, saídas, comparação mensal, gráficos e alertas.
- Lançamentos com filtro por coluna, seleção em lote, exclusão por período e exportação.
- Importação de extrato: OFX, CSV, TXT e PDF, inclusive protegido por senha.
- Importação de fatura de cartão com de-para das categorias do emissor.
- Transferência entre contas do mesmo titular.
- Cadastros de contas, bancos, agências, fornecedores, clientes e categorias.
- Calendário de contas a pagar e receber, com recorrência.
- Metas, orçamento do mês e reserva de emergência.
- Cartões de crédito com limite, fatura e participação por membro.
- Manual de operação no sistema, com busca, histórico de versões e impressão completa.
- Número da versão visível no sistema e exposto em `GET /health`.

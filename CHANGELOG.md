# Histórico de versões — GFP Familiar

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

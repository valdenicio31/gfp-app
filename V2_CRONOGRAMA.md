# GFP Familiar V2 — Cronograma de Execução

**Revisto em 10 de setembro de 2026**, conferindo arquivo por arquivo o que
existe no repositório. A revisão anterior marcava como planejadas quatro fases
já entregues e não registrava a ausência de testes automatizados.

| Fase | Entrega | Peso | Estado |
|---:|---|---:|---|
| 01 | Arquitetura familiar, dados e segurança | 8% | Concluída |
| 02 | Design System VIA IA e componentes | 8% | Concluída |
| 03 | Login, cadastro e recuperação | 8% | Concluída — recuperação de senha com página, API e token próprios |
| 04 | Famílias, usuários, perfis e permissões | 10% | Concluída |
| 05 | Núcleo financeiro multiusuário | 12% | Concluída |
| 06 | Central da Família e dashboard individual | 10% | Concluída |
| 07 | Contas, cartões e parcelamentos | 8% | Concluída |
| 08 | Orçamentos, metas e reserva | 8% | Concluída — `v2-metas.js` e migração `002` |
| 09 | Dashboards avançados e semáforos | 10% | Concluída |
| 10 | Alertas e inteligência financeira | 6% | Concluída — simulador CDI com três instituições |
| 11 | Licenças e administração | 5% | Concluída — migrações `004` e `006` |
| 12 | Segurança, LGPD, auditoria e testes | 5% | **Parcial** — LGPD e auditoria entregues; testes cobrem só o núcleo |
| 13 | Publicação e homologação comercial | 2% | Concluída — dois serviços no ar |

**Progresso funcional:** 12 fases concluídas e uma parcial.

## Entregue depois do cronograma original

Trabalho posterior ao desenho das treze fases, feito a partir do uso real:

| Entrega | Estado |
|---|---|
| Importação de extrato em PDF, inclusive protegido por senha | Concluída |
| Exportação da leitura para CSV, para conferir e corrigir na planilha | Concluída |
| Importação de fatura de cartão com de-para das categorias do emissor | Concluída |
| Transferência entre contas do mesmo titular | Concluída |
| Gráfico mês a mês por ano civil, com seletor de ano | Concluída |
| Logotipo VIA IA nas telas de navegação | Concluída |
| Matemática dos empréstimos — cronograma, juros e antecipação | Concluída |
| Manual de operação revisado, com impressão completa | Concluída |
| Versionamento do sistema — começa na 1.0.0 (ver `CHANGELOG.md`) | Concluída |
| Módulo de empréstimos — banco, API e tela | **Não iniciado** |

## O que falta

1. **Módulo de empréstimos.** O cálculo está pronto e testado; faltam a tabela,
   os endpoints e a tela. Depende de uma definição: parcela paga vira lançamento
   de despesa na conta, ou o módulo fica isolado do fluxo de caixa?
2. **Cobertura de testes na API.** Os 15 casos atuais cobrem o núcleo que roda
   no navegador. Nenhuma rota do Express é exercitada por teste.
3. **Homologação comercial.** Fase 13 publicada, sem aceite formal registrado.

## Como isto é verificado

O núcleo — leitura de extrato, leitura de fatura e matemática de empréstimo —
tem 15 casos automatizados em `tests/`. Rodam em dois lugares: `tests/index.html`
no navegador, que é onde esse código de fato executa, e `npm test` na API, por
um wrapper que avalia os mesmos arquivos sob `node --test`.

O que **não** está coberto, e portanto depende de conferência manual a cada
alteração:

- as rotas da API e as consultas SQL;
- o comportamento das telas;
- a leitura de faturas e extratos de bancos reais — os casos usam arquivos
  construídos para o teste, e formatos variam entre emissores.

## Infraestrutura

- `gfp-gestao-financeira` — site estático.
- `gfp-familiar-api` — Node, com `gfp-postgres` gerenciado.
- Deploy automático a cada push na branch principal.
- Migrações aplicadas na subida da API, hoje até `013_transferencias.sql`.

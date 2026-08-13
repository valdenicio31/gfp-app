# GFP — Gestão Financeira Pessoal

MVP web instalável para controle local de receitas, despesas, orçamento e relatórios.

## Funcionalidades

- Cadastro, edição e exclusão de lançamentos.
- Filtros por mês, tipo, categoria e descrição.
- Indicadores de receitas, despesas, saldo e taxa de poupança.
- Orçamento mensal e acompanhamento de uso.
- Despesas por categoria e evolução dos últimos seis meses.
- Exportação CSV, backup JSON e importação CSV/JSON.
- Tema claro/escuro e suporte a instalação como PWA.
- Dados persistidos somente no navegador (`localStorage`).

## Executar

```bash
python3 -m http.server 8080 --directory gfp-app
```

Abra `http://localhost:8080`.

## Privacidade

Esta versão não envia dados financeiros para servidores. Limpar os dados do navegador remove os lançamentos; gere backups JSON regularmente.

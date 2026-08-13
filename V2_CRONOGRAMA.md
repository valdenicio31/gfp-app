# GFP Familiar V2 — Cronograma de Execução

| Fase | Entrega | Peso | Estado |
|---:|---|---:|---|
| 01 | Arquitetura familiar, dados e segurança | 8% | Concluída |
| 02 | Design System VIA IA e componentes | 8% | Concluída |
| 03 | Login, cadastro e recuperação | 8% | Cadastro e login conectados; recuperação pendente |
| 04 | Famílias, usuários, perfis e permissões | 10% | Administrador único, 20 membros, perfis padrão e personalizados |
| 05 | Núcleo financeiro multiusuário | 12% | Contas e lançamentos conectados à interface real |
| 06 | Central da Família e dashboard individual | 10% | Três meses simulados e visões familiar/individual aplicadas |
| 07 | Contas, cartões e parcelamentos | 8% | Planejada |
| 08 | Orçamentos, metas e reserva | 8% | Planejada |
| 09 | Dashboards avançados e semáforos | 10% | Série de três meses, indicadores e semáforos habilitados |
| 10 | Alertas e inteligência financeira | 6% | Planejada |
| 11 | Licenças e administração | 5% | Planejada |
| 12 | Segurança, LGPD, auditoria e testes | 5% | Planejada |
| 13 | Publicação e homologação comercial | 2% | Planejada |

**Progresso funcional ponderado:** 69%.

> A versão atual é uma prévia navegável. Login, permissões e números são demonstrativos até a conexão com autenticação e banco de dados de produção.

**Checkpoint de homologação:** branch `gfp-familiar-v2`, PR em rascunho e prévia isolada da V1.

**Infraestrutura ativa:** `gfp-postgres` Basic-256mb/1 GB e `gfp-familiar-api` Free, com teste de saúde HTTP 200.

**Checkpoint funcional:** cadastro de família, login, perfil real, contas privadas/familiares e lançamentos protegidos por `family_id`.

**Checkpoint familiar:** convites válidos por sete dias, aceite com senha própria, limite de 20 membros e administração exclusiva do perfil administrador.

**Revisão aprovada:** limite ampliado para 20 membros; cadastro de familiares movido para o módulo Usuários; perfis padrão e personalizados separados do login; apenas um administrador titular ativo por família.

**Privacidade validada:** administrador alterna entre toda a família e seus próprios dados; demais membros recebem apenas contas e lançamentos próprios. Demonstração habilitada para usuários, perfis personalizados e junho–agosto de 2026.

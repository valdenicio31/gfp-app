# GFP Familiar V2 — Cronograma de Execução

| Fase | Entrega | Peso | Estado |
|---:|---|---:|---|
| 01 | Arquitetura familiar, dados e segurança | 8% | Concluída |
| 02 | Design System VIA IA e componentes | 8% | Concluída |
| 03 | Login, cadastro e recuperação | 8% | Cadastro e login conectados; recuperação pendente |
| 04 | Famílias, usuários, perfis e permissões | 10% | Cadastro destacado, administrador único, 20 membros, perfis padrão e personalizados |
| 05 | Núcleo financeiro multiusuário | 12% | Contas e lançamentos conectados à interface real |
| 06 | Central da Família e dashboard individual | 10% | Três meses simulados e visões familiar/individual aplicadas |
| 07 | Contas, cartões e parcelamentos | 8% | Concluída: cadastros, compras em até 48x, faturas e projeções conectados |
| 08 | Orçamentos, metas e reserva | 8% | Planejada |
| 09 | Dashboards avançados e semáforos | 10% | Comparativo receitas x despesas, série de três meses e semáforos habilitados |
| 10 | Alertas e inteligência financeira | 6% | Simulador educativo CDI com ranking de três instituições |
| 11 | Licenças e administração | 5% | Planejada |
| 12 | Segurança, LGPD, auditoria e testes | 5% | Planejada |
| 13 | Publicação e homologação comercial | 2% | Planejada |

**Progresso funcional ponderado:** 91%.

> A versão atual é uma prévia navegável. Login, permissões e números são demonstrativos até a conexão com autenticação e banco de dados de produção.

**Checkpoint de homologação:** branch `gfp-familiar-v2`, PR em rascunho e prévia isolada da V1.

**Infraestrutura ativa:** `gfp-postgres` Basic-256mb/1 GB e `gfp-familiar-api` Free, com teste de saúde HTTP 200.

**Checkpoint funcional:** cadastro de família, login, perfil real, contas privadas/familiares e lançamentos protegidos por `family_id`.

**Checkpoint familiar:** convites válidos por sete dias, aceite com senha própria, limite de 20 membros e administração exclusiva do perfil administrador.

**Revisão aprovada:** limite ampliado para 20 membros; cadastro de familiares movido para o módulo Usuários; perfis padrão e personalizados separados do login; apenas um administrador titular ativo por família.

**Privacidade validada:** administrador alterna entre toda a família e seus próprios dados; demais membros recebem apenas contas e lançamentos próprios. Demonstração habilitada para usuários, perfis personalizados e junho–agosto de 2026.

**Checkpoint visual:** gráfico comparativo mensal de receitas e despesas, destaque do mês selecionado e atalhos diretos para cadastro de usuários e perfis.

**Checkpoint investimentos:** simulação interativa de Nubank, Mercado Pago e PagBank, com valor, prazo, CDI ilustrativo, ranking automático e aviso educativo.

**Checkpoint cartões:** comparativo de três cartões, faturas e limites, evolução mensal, uso por familiar, categorias, semáforos, alertas e projeções futuras com proteção da visão individual.

**Checkpoint cadastral:** usuários com nome, CPF validado e mascarado, e-mail, nascimento, celular/WhatsApp, endereço completo com preenchimento automático pelo CEP, foto ou avatar e associação visual de emojis aos perfis.

**Checkpoint operacional:** banco e API preparados para cartões reais do usuário e compras à vista ou parceladas em até 48 vezes, mantendo o escopo familiar exclusivo do administrador.

**Checkpoint cartões conectado:** formulários reais e demonstrativos para cadastrar cartões e registrar compras, cálculo instantâneo da parcela e atualização da fatura.

**Homologação da Fase 07:** interface, API e banco reconciliados; cadastro de cartões, registro de compras, parcelamento, leitura das faturas e proteção por `family_id` validados no código.

/* Versão do GFP — fonte única.
   Toda entrega em produção muda o número aqui e ganha uma entrada no topo do
   HISTORICO. O teste tests/gfp.test.mjs confere que este número é o mesmo do
   api/package.json e do cache do service worker (sw.js), para ninguém
   publicar uma versão pela metade.

   Regra do número (X.Y.Z):
   - X muda quando o sistema muda de forma que o cliente precisa reaprender
     algo, ou quando dados antigos precisam ser convertidos;
   - Y muda quando entra funcionalidade nova;
   - Z muda com correção de erro ou ajuste pequeno, sem funcionalidade nova. */

const GFP_VERSAO = { numero: '2.4.0', data: '2026-10-10' };

const GFP_HISTORICO = [
  {
    numero: '2.4.0', data: '2026-10-10', titulo: 'Ajustes internos',
    resumo: 'Melhorias na administração do serviço. Nada muda no seu uso do dia a dia.',
    itens: [
      ['melhoria', 'Ferramentas internas de acompanhamento das assinaturas.'],
      ['melhoria', 'Redefinir a senha pelo link do e-mail passa a confirmar o seu endereço de e-mail.']
    ]
  },
  {
    numero: '2.3.0', data: '2026-10-08', titulo: 'Assinatura: teste grátis, planos e pagamento',
    resumo: 'Contas novas começam com 14 dias de teste, e a tela Assinatura permite contratar, acompanhar e cancelar.',
    itens: [
      ['novo', 'Teste grátis de 14 dias para toda conta nova, sem cartão.'],
      ['novo', 'Tela Assinatura: plano mensal (R$ 9,90, no cartão) ou anual (R$ 69,90, no cartão, Pix ou boleto), com pagamento na página do Asaas.'],
      ['novo', 'A situação da licença aparece na barra lateral, e um aviso surge quando há algo a fazer.'],
      ['novo', 'Cancelamento pelo próprio sistema, com acesso até o fim do período pago, e desistência com estorno nos 7 primeiros dias.'],
      ['novo', 'Com o teste encerrado ou a assinatura vencida há mais de 10 dias, a conta fica só para consulta: ver e exportar continuam funcionando.'],
      ['melhoria', 'Contas criadas antes desta versão continuam liberadas, sem prazo.']
    ]
  },
  {
    numero: '2.2.1', data: '2026-10-08', titulo: 'Endereço próprio e servidor sempre ligado',
    resumo: 'O GFP passa a atender em gfp.viaiasolucoes.com, e o servidor não hiberna mais.',
    itens: [
      ['melhoria', 'Novo endereço: gfp.viaiasolucoes.com. O endereço antigo continua funcionando.'],
      ['melhoria', 'O servidor fica sempre ligado: acabou a espera de até um minuto na primeira tela.'],
      ['melhoria', 'Preparação da cobrança: o sistema confere a conexão com o meio de pagamento.']
    ]
  },
  {
    numero: '2.2.0', data: '2026-10-08', titulo: 'Período, banco e conta — e painéis de receitas e despesas',
    resumo: 'Lançamentos abre no mês atual e filtra por período, banco, conta e categoria. A Central ganha os painéis de Receitas e de Despesas. Empréstimos mostra parcelas pagas, a pagar, juros e economia.',
    itens: [
      ['novo', 'Lançamentos abre sempre no mês atual. Em Período dá para escolher um mês anterior, uma data inicial e uma final, ou todos os lançamentos.'],
      ['novo', 'Lançamentos: filtros de banco, conta e categoria ao lado do período.'],
      ['novo', 'Central: filtros de banco e conta, ou tudo consolidado.'],
      ['novo', 'Central: abas Receitas e Despesas, com o total por tipo e por mês no ano atual e o dos últimos cinco anos.'],
      ['novo', 'Empréstimos: parcelas já pagas, parcelas que faltam, juros já pagos e economia pagando adiantado.'],
      ['novo', 'Empréstimos: listagem dos contratos com vencimento, parcela/total, valor da parcela, valor pago, juros e valor economizado.'],
      ['melhoria', 'Central: "Entrou x saiu" passa a se chamar "Receitas x despesas".'],
      ['melhoria', 'Empréstimos: o desconto de uma antecipação sai dos juros pagos e aparece só como economia.'],
      ['correcao', 'A conferência da exclusão por período mostra exatamente o que será apagado, mesmo com a tela em outro mês.'],
      ['correcao', 'O alerta da reserva de emergência não fala mais em família.']
    ]
  },
  {
    numero: '2.1.0', data: '2026-10-05', titulo: 'A categoria acompanha o fornecedor',
    resumo: 'Classificou um lançamento de um fornecedor ou cliente? Todos os outros dele ficam com a mesma categoria.',
    itens: [
      ['novo', 'Ao incluir ou alterar um lançamento com fornecedor ou cliente, a categoria escolhida é aplicada a todos os lançamentos dele, inclusive os que tinham outra.'],
      ['novo', 'O cadastro do fornecedor guarda a categoria, e as próximas importações já chegam classificadas.'],
      ['melhoria', 'O aviso ao salvar mostra quantos lançamentos foram reclassificados.']
    ]
  },
  {
    numero: '2.0.0', data: '2026-10-05', titulo: 'GFP — Gestão Financeira Pessoal',
    resumo: 'O sistema passa a ser individual: uma conta por pessoa, com tudo o que já existia para organizar as finanças.',
    itens: [
      ['melhoria', 'Novo nome: GFP — Gestão Financeira Pessoal.'],
      ['melhoria', 'Conta individual: o cadastro pede só nome, e-mail e senha.'],
      ['melhoria', 'Saem das telas o cadastro de usuários, os perfis e os painéis por membro.'],
      ['melhoria', 'Contas antigas com mais de um usuário continuam funcionando para quem já estava cadastrado.'],
      ['melhoria', 'Termos de Uso, Política de Privacidade, manual e página de planos reescritos para o uso individual.'],
      ['melhoria', 'Novos preços: R$ 9,90 por mês ou R$ 69,90 por ano.'],
      ['melhoria', 'Manual com todas as imagens atualizadas.']
    ]
  },
  {
    numero: '1.1.1', data: '2026-10-05', titulo: 'Termos e página de planos',
    resumo: 'Os documentos legais ganham os dados da empresa e a página de planos passa a mostrar o que está nos Termos.',
    itens: [
      ['melhoria', 'Termos de Uso e Política de Privacidade com CNPJ, endereço e data de vigência.'],
      ['correcao', 'Página de planos alinhada aos Termos: mensal e anual, com 14 dias de teste.'],
      ['correcao', 'Saem da página de apresentação os recursos que ainda não existem.']
    ]
  },
  {
    numero: '1.1.0', data: '2026-09-28', titulo: 'Empréstimos e financiamentos',
    resumo: 'O módulo de empréstimos sai do papel: contrato, cronograma e baixa das parcelas.',
    itens: [
      ['novo', 'Tela Empréstimos: consignado, pessoal, CDC, financiamento e cheque especial, com saldo devedor, juros e próxima parcela.'],
      ['novo', 'Cadastro com prévia do cronograma pela Tabela Price, informando a taxa ou só o valor da parcela.'],
      ['novo', 'Baixa de parcela que procura o débito no extrato e vincula, sem lançar duas vezes; se não achar, cria a despesa.'],
      ['novo', 'Antecipação com desconto: a diferença aparece como economia.'],
      ['novo', 'Contratos antigos: as parcelas que já venceram entram como pagas, sem mexer nas contas.'],
      ['melhoria', 'Manual com duas seções novas sobre empréstimos.']
    ]
  },
  {
    numero: '1.0.0', data: '2026-09-28', titulo: 'Primeira versão oficial',
    resumo: 'Marco zero do versionamento: tudo o que já estava no ar passa a ser a versão 1.0.',
    itens: [
      ['novo', 'Acesso por perfis, cada um vendo só o que deve.'],
      ['novo', 'Central com saldo, entradas, saídas, comparação com o mês anterior, gráficos e alertas.'],
      ['novo', 'Lançamentos com filtro por coluna, seleção em lote, exclusão por período e exportação.'],
      ['novo', 'Importação de extrato de qualquer banco: OFX, CSV, TXT e PDF, inclusive protegido por senha.'],
      ['novo', 'Importação de fatura de cartão, aproveitando as categorias do próprio emissor.'],
      ['novo', 'Transferência entre contas do mesmo titular, sem inflar entradas e saídas.'],
      ['novo', 'Cadastros de contas, bancos, agências, fornecedores, clientes e categorias.'],
      ['novo', 'Calendário de contas a pagar e receber, com recorrência e baixa com um clique.'],
      ['novo', 'Metas, orçamento do mês e reserva de emergência.'],
      ['novo', 'Cartões de crédito com limite, fatura e gastos por categoria.'],
      ['novo', 'Manual de operação dentro do sistema, com busca e impressão.'],
      ['novo', 'Número de versão visível no sistema e histórico de novidades nesta página.']
    ]
  }
];

window.GFP_VERSAO = GFP_VERSAO;
window.GFP_HISTORICO = GFP_HISTORICO;

/* Qualquer elemento com data-versao recebe "Versão 1.0.0". */
function mostrarVersaoNaTela() {
  document.querySelectorAll('[data-versao]').forEach(el => {
    el.textContent = `Versão ${GFP_VERSAO.numero}`;
    el.title = `GFP ${GFP_VERSAO.numero} — publicada em ${GFP_VERSAO.data.split('-').reverse().join('/')}`;
  });
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mostrarVersaoNaTela);
  else mostrarVersaoNaTela();
}

/* Versão do GFP Familiar — fonte única.
   Toda entrega em produção muda o número aqui e ganha uma entrada no topo do
   HISTORICO. O teste tests/gfp.test.mjs confere que este número é o mesmo do
   api/package.json e do cache do service worker (sw.js), para ninguém
   publicar uma versão pela metade.

   Regra do número (X.Y.Z):
   - X muda quando o sistema muda de forma que o cliente precisa reaprender
     algo, ou quando dados antigos precisam ser convertidos;
   - Y muda quando entra funcionalidade nova;
   - Z muda com correção de erro ou ajuste pequeno, sem funcionalidade nova. */

const GFP_VERSAO = { numero: '1.1.0', data: '2026-09-28' };

const GFP_HISTORICO = [
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
      ['novo', 'Família com administrador, adultos, dependentes e somente leitura, cada um vendo só o que deve.'],
      ['novo', 'Central da família com saldo, entradas, saídas, comparação com o mês anterior, gráficos e alertas.'],
      ['novo', 'Lançamentos com filtro por coluna, seleção em lote, exclusão por período e exportação.'],
      ['novo', 'Importação de extrato de qualquer banco: OFX, CSV, TXT e PDF, inclusive protegido por senha.'],
      ['novo', 'Importação de fatura de cartão, aproveitando as categorias do próprio emissor.'],
      ['novo', 'Transferência entre contas do mesmo titular, sem inflar entradas e saídas.'],
      ['novo', 'Cadastros de contas, bancos, agências, fornecedores, clientes e categorias.'],
      ['novo', 'Calendário de contas a pagar e receber, com recorrência e baixa com um clique.'],
      ['novo', 'Metas, orçamento do mês e reserva de emergência.'],
      ['novo', 'Cartões de crédito com limite, fatura e participação de cada membro.'],
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
    el.title = `GFP Familiar ${GFP_VERSAO.numero} — publicada em ${GFP_VERSAO.data.split('-').reverse().join('/')}`;
  });
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mostrarVersaoNaTela);
  else mostrarVersaoNaTela();
}

/* Casos de teste do GFP Familiar.

   Escritos uma vez e executados em dois lugares: pelo navegador, em
   tests/index.html, e por `node --test`, em tests/gfp.test.mjs. O motivo é
   prático — o núcleo que estes casos cobrem (leitura de extrato, leitura de
   fatura e matemática de empréstimo) roda no navegador, e é lá que ele precisa
   estar certo; o Node entra para o dia em que houver CI.

   Cada caso recebe `v` (verificar) e usa os módulos globais já carregados. */

const CASOS_GFP = [

  /* ---------- leitura de valores e datas ---------- */

  ['paraCentavos entende os formatos que os bancos usam', v => {
    const { paraCentavos } = GFPExtrato;
    v(paraCentavos('R$ 1.234,56') === 123456, 'real com milhar e vírgula');
    v(paraCentavos('-842,90') === -84290, 'negativo com sinal');
    v(paraCentavos('(1.234,56)') === -123456, 'negativo entre parênteses');
    v(paraCentavos('1,234.56') === 123456, 'formato americano');
    v(paraCentavos('150,00 D') === -15000, 'débito marcado com D');
    v(paraCentavos('') === null, 'texto vazio não vira zero');
  }],

  ['paraDataIso aceita as escritas de data do extrato', v => {
    const { paraDataIso } = GFPExtrato;
    v(paraDataIso('05/08/2026') === '2026-08-05', 'dia/mês/ano');
    v(paraDataIso('2026-08-05') === '2026-08-05', 'já em ISO');
    v(paraDataIso('5 ago 2026') === '2026-08-05', 'mês por extenso');
    v(paraDataIso('31/02/2026') === null, '31 de fevereiro não existe');
    v(paraDataIso('') === null, 'vazio não vira data');
  }],

  /* ---------- extrato em PDF ---------- */

  ['extrato em PDF separa lançamento de saldo e respeita o sinal', v => {
    const texto = [
      'Extrato Período: 01/08/2026 a 31/08/2026',
      'SALDO ANTERIOR 1.200,00',
      '05/08 PIX ENVIADO JOAO -150,00 1.050,00',
      '06/08 SALARIO EMPRESA 3.500,00 4.550,00',
      'SALDO FINAL 4.428,10'
    ].join('\n');
    const r = GFPExtrato.lerPdf(texto);
    v(r.linhas.length === 2, `duas linhas de movimento, veio ${r.linhas.length}`);
    v(r.linhas[0].amountCents === 15000, 'usou o lançamento, não o saldo ao lado');
    v(r.linhas[0].type === 'expense', 'valor negativo é saída');
    v(r.linhas[1].type === 'income', 'valor positivo é entrada');
    v(r.linhas[0].occurredOn === '2026-08-05', 'ano veio do cabeçalho');
  }],

  ['extrato sem sinal decide entrada e saída pela palavra da linha', v => {
    const texto = [
      'Relatório 2026',
      '18/08/2026 Transferência enviada para João Despesa R$ 60,00',
      '18/08/2026 Transferência recebida de Maria Receita R$ 500,00',
      '18/08/2026 Pagamento de fatura Despesa R$ 102,24'
    ].join('\n');
    const r = GFPExtrato.lerPdf(texto);
    v(r.linhas.length === 3, `três lançamentos, veio ${r.linhas.length}`);
    v(r.linhas[0].type === 'expense', '"enviada/Despesa" é saída');
    v(r.linhas[1].type === 'income', '"recebida/Receita" é entrada');
    // Regressão: "Pagamento de fatura" já foi engolido por um filtro de totais.
    v(r.linhas[2].amountCents === 10224, '"Pagamento de fatura" é lançamento, não total');
  }],

  ['linhas de fechamento não viram lançamento', v => {
    const texto = ['01/08 SALDO ANTERIOR 1.000,00', '02/08 TOTAL DO PERÍODO 500,00',
      '03/08 COMPRA REAL 25,00'].join('\n');
    const r = GFPExtrato.lerPdf(texto);
    v(r.linhas.length === 1, `só a compra real entra, veio ${r.linhas.length}`);
    v(r.linhas[0].amountCents === 2500, 'e com o valor certo');
  }],

  /* ---------- fatura de cartão ---------- */

  ['fatura agrupada por seção herda a categoria do título', v => {
    const texto = ['Fatura setembro 2026', 'Vencimento 10/09/2026',
      'Alimentação', '12/08 SUPERMERCADO XPTO 189,90', '15/08 RESTAURANTE 76,40',
      'Transporte', '16/08 POSTO IPIRANGA 220,00', 'TOTAL DA FATURA 486,30'].join('\n');
    const r = GFPFatura.lerFaturaCartao(texto);
    v(r.compras.length === 3, `três compras, veio ${r.compras.length}`);
    v(r.compras[0].sourceCategory === 'Alimentação', 'primeira compra na seção Alimentação');
    v(r.compras[2].sourceCategory === 'Transporte', 'terceira compra já na seção Transporte');
    v(r.categoriasVistas.length === 2, 'duas categorias de origem reconhecidas');
  }],

  ['fatura reconhece a compra parcelada', v => {
    const texto = ['Fatura 2026', '18/08 UBER *TRIP PARC 2/3 45,00'].join('\n');
    const r = GFPFatura.lerFaturaCartao(texto);
    v(r.compras.length === 1, 'a compra entrou');
    v(r.compras[0].installments === 3, `três parcelas, veio ${r.compras[0].installments}`);
  }],

  ['ruído da fatura real não vira categoria', v => {
    // Textos lidos de uma fatura do Itaú de verdade que chegaram à tela como
    // se fossem categoria: rótulo de campo, nome do titular, pedaço de frase.
    ['Sacador Avalista:', 'VALDENICIO MELLO A BARBO(final 8279)', 'parcelas.',
      'Continua...', 'Total da fatura', 'Vencimento', 'Página 2'
    ].forEach(texto => {
      v(!GFPFatura.pareceTituloDeCategoria(texto), `"${texto}" não devia ser categoria`);
    });
    ['Alimentação', 'Transporte', 'Serviços', 'Casa e decoração'].forEach(texto => {
      v(GFPFatura.pareceTituloDeCategoria(texto), `"${texto}" devia ser categoria`);
    });
  }],

  ['categoria do Itaú é separada da praça do estabelecimento', v => {
    // A mesma fatura mostrou que DIVERSOS, MORADIA e VESTUÁRIO são categorias
    // de verdade do emissor — o que atrapalhava era o sufixo da cidade.
    const casos = [
      ['DIVERSOS .PINHAIS', 'DIVERSOS'],
      ['MORADIA .OSASCO', 'MORADIA'],
      ['DIVERSOS .RIO DE JANEIR', 'DIVERSOS'],
      ['DIVERSOS .', 'DIVERSOS'],
      ['VESTUÁRIO .', 'VESTUÁRIO'],
      // Ponto colado é abreviação do próprio emissor e faz parte do nome.
      ['TURISMO E ENTRETENIM.', 'TURISMO E ENTRETENIM.']
    ];
    casos.forEach(([entrada, esperado]) => {
      const saida = GFPFatura.categoriaDoTitulo(entrada);
      v(saida === esperado, `"${entrada}" deveria virar "${esperado}", veio "${saida}"`);
      v(GFPFatura.pareceTituloDeCategoria(entrada), `"${entrada}" devia ser aceita como categoria`);
    });
  }],

  ['de-para traduz a categoria do emissor para a do GFP', v => {
    const compras = [
      { sourceCategory: 'Restaurantes', category: '' },
      { sourceCategory: 'Combustível', category: '' },
      { sourceCategory: 'Nunca vista', category: '' }
    ];
    const r = GFPFatura.aplicarDePara(compras, { Restaurantes: 'Alimentação', Combustível: 'Transporte' });
    v(r[0].category === 'Alimentação', 'traduziu a primeira');
    v(r[1].category === 'Transporte', 'traduziu a segunda');
    v(r[2].category === '', 'categoria sem tradução fica em branco, não inventa');
  }],

  /* ---------- empréstimos ---------- */

  ['parcela pela Price bate com o cálculo à mão', v => {
    // 10.000,00 em 12x a 2% a.m. = 945,60
    v(GFPEmprestimos.parcelaPrice(1000000, 12, 0.02) === 94560, 'parcela de 945,60');
    v(GFPEmprestimos.parcelaPrice(120000, 12, 0) === 10000, 'sem juros divide igual');
  }],

  ['a taxa é recuperada a partir da parcela', v => {
    const taxa = GFPEmprestimos.taxaPelaParcela(1000000, 12, 94560);
    v(Math.abs(taxa - 0.02) < 0.0001, `esperado ~2% ao mês, veio ${(taxa * 100).toFixed(4)}%`);
    v(GFPEmprestimos.taxaPelaParcela(120000, 12, 10000) === 0, 'parcela sem juros devolve taxa zero');
  }],

  ['o cronograma fecha o principal ao centavo', v => {
    const g = GFPEmprestimos.gerarParcelas({
      principalCents: 1000000, parcelas: 12, taxaMensal: 0.02, primeiraEm: '2026-01-31'
    });
    const amortizado = g.parcelas.reduce((t, p) => t + p.amortizacao_cents, 0);
    const juros = g.parcelas.reduce((t, p) => t + p.juros_cents, 0);
    const total = g.parcelas.reduce((t, p) => t + p.valor_cents, 0);
    v(g.parcelas.length === 12, 'doze parcelas');
    v(amortizado === 1000000, `amortização fecha o principal, veio ${amortizado}`);
    v(g.parcelas[11].saldo_depois_cents === 0, 'saldo zera na última');
    v(total - 1000000 === juros, 'total menos principal é exatamente o juro');
  }],

  ['vencimento mantém o dia e respeita mês curto', v => {
    const g = GFPEmprestimos.gerarParcelas({
      principalCents: 1000000, parcelas: 4, taxaMensal: 0.02, primeiraEm: '2026-01-31'
    });
    const datas = g.parcelas.map(p => p.vence_em);
    v(datas[0] === '2026-01-31', 'primeira na data informada');
    v(datas[1] === '2026-02-28', `fevereiro cai no último dia, veio ${datas[1]}`);
    v(datas[2] === '2026-03-31', 'março volta ao dia 31');
    v(datas[3] === '2026-04-30', 'abril tem 30');
  }],

  ['a economia da antecipação é o que deixou de ser pago', v => {
    const g = GFPEmprestimos.gerarParcelas({
      principalCents: 1000000, parcelas: 12, taxaMensal: 0.02, primeiraEm: '2026-01-31'
    });
    g.parcelas.slice(0, 3).forEach(p => { p.paga = true; p.pago_cents = p.valor_cents; });
    const semAntecipar = GFPEmprestimos.resumoDoContrato(1000000, g.parcelas);
    v(semAntecipar.economia_cents === 0, 'pagando o valor cheio não há economia');

    // Duas parcelas de 945,60 quitadas por 900,00 cada.
    [3, 4].forEach(i => { g.parcelas[i].paga = true; g.parcelas[i].pago_cents = 90000; });
    const depois = GFPEmprestimos.resumoDoContrato(1000000, g.parcelas);
    v(depois.economia_cents === 9120, `economia de 91,20, veio ${(depois.economia_cents / 100).toFixed(2)}`);
    v(depois.parcelas_pagas === 5, 'cinco parcelas quitadas');
    v(depois.saldo_devedor_cents > 0, 'ainda há saldo a pagar');
  }],

  ['contrato sem taxa informada usa o valor da parcela', v => {
    const g = GFPEmprestimos.gerarParcelas({
      principalCents: 1000000, parcelas: 12, parcelaCents: 94560, primeiraEm: '2026-03-10'
    });
    v(Math.abs(g.taxaMensal - 0.02) < 0.0001, 'deduziu a taxa de ~2%');
    v(g.parcelas.length === 12, 'e gerou o cronograma inteiro');
  }],

  ['cadastro incompleto não gera cronograma torto', v => {
    const semData = GFPEmprestimos.gerarParcelas({ principalCents: 1000000, parcelas: 12, taxaMensal: 0.02 });
    v(!!semData.erro, 'sem a data da primeira parcela, recusa');
    const semTaxaNemParcela = GFPEmprestimos.gerarParcelas({
      principalCents: 1000000, parcelas: 12, primeiraEm: '2026-01-10'
    });
    v(!!semTaxaNemParcela.erro, 'sem taxa e sem parcela, recusa');
  }]
];

if (typeof window !== 'undefined') window.CASOS_GFP = CASOS_GFP;
if (typeof module !== 'undefined' && module.exports) module.exports = CASOS_GFP;

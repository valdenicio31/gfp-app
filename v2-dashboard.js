/* Central do GFP: todo número desta tela sai dos lançamentos, da agenda,
   das metas e do orçamento da própria conta. Nada aqui é fixo — quando entra
   uma movimentação, a tela recarrega e os painéis mudam junto. */

const pnl = { dados: null, mes: new Date().getMonth() + 1, ano: new Date().getFullYear(),
  // O gráfico mês a mês tem ano próprio: dá para olhar 2025 inteiro sem
  // tirar o resto do painel do mês corrente.
  serieAno: new Date().getFullYear(), carregando: false, erro: '', demo: false,
  // 'geral' é o painel do mês; 'receitas' e 'despesas' são os painéis do ano corrente.
  aba: 'geral',
  // Recorte por banco e conta: vazio é tudo consolidado. 'none' são as contas sem banco.
  banco: '', conta: '' };
const PNL_SEM_BANCO = 'none';

const NIVEIS = { ruim: '🔴', atencao: '🟡', bom: '🟢', info: '🔵' };

function painelDemonstracao() {
  const serie = [];
  const base = [[820, 610], [790, 705], [880, 640], [830, 690], [910, 720], [860, 655],
    [900, 780], [940, 700], [880, 745], [950, 690], [1020, 810], [980, 715]];
  for (let m = 1; m <= 12; m += 1) {
    const [entra, sai] = base[m - 1];
    // No ano corrente os meses que ainda não chegaram ficam zerados, como na base real.
    const futuro = pnl.serieAno === pnl.ano && m > pnl.mes;
    serie.push({ ym: `${pnl.serieAno}-${String(m).padStart(2, '0')}`, mes: m, ano: pnl.serieAno,
      receitas_cents: futuro ? 0 : entra * 1000, despesas_cents: futuro ? 0 : sai * 1000 });
  }
  pnl.dados = {
    hoje: new Date().toLocaleDateString('sv-SE'), year: pnl.ano, month: pnl.mes,
    contas: [{ id: 'd1', name: 'Nubank · corrente', balance_cents: 875000, bank_id: 'b1', banco: 'Nubank' },
      { id: 'd2', name: 'Itaú · corrente', balance_cents: 320000, bank_id: 'b2', banco: 'Itaú' },
      { id: 'd3', name: 'Dinheiro', balance_cents: 18000, bank_id: null, banco: null }],
    saldo_total_cents: 1213000,
    mes: { receitas_cents: 980000, despesas_cents: 715000, resultado_cents: 265000, quantos: 34 },
    mes_anterior: { receitas_cents: 1020000, despesas_cents: 810000, resultado_cents: 210000 },
    serie_ano: pnl.serieAno,
    transferencias: { total_cents: 420000, quantas: 3, pares: [
      { origem: 'Itaú · corrente', destino: 'Nubank · corrente', total_cents: 300000, quantas: 2 },
      { origem: 'Nubank · corrente', destino: 'Dinheiro', total_cents: 120000, quantas: 1 }] },
    serie_meses: serie,
    serie_anos: [{ ano: pnl.ano - 1, receitas_cents: 10800000, despesas_cents: 8400000 },
      { ano: pnl.ano, receitas_cents: 7600000, despesas_cents: 5900000 }],
    por_categoria: [
      { category: 'Casa', type: 'expense', total_cents: 262990, quantos: 4 },
      { category: 'Alimentação', type: 'expense', total_cents: 189500, quantos: 11 },
      { category: 'Transporte', type: 'expense', total_cents: 127000, quantos: 6 },
      { category: 'Educação', type: 'expense', total_cents: 90000, quantos: 2 },
      { category: 'Saúde', type: 'expense', total_cents: 45510, quantos: 3 },
      { category: 'Salário', type: 'income', total_cents: 980000, quantos: 2 }],
    por_fornecedor: [
      { supplier: 'Imobiliária Central', total_cents: 250000, quantos: 1 },
      { supplier: 'Supermercado Extra', total_cents: 148000, quantos: 4 },
      { supplier: 'Posto Ipiranga', total_cents: 97000, quantos: 3 },
      { supplier: 'Colégio Ápice', total_cents: 90000, quantos: 1 },
      { supplier: 'Padaria do Bairro', total_cents: 41500, quantos: 7 },
      { supplier: 'Vivo Fibra', total_cents: 12990, quantos: 1 }],
    agenda: { a_pagar_cents: 240990, a_receber_cents: 0, pago_cents: 430000, quantas_atrasadas: 1,
      atrasadas: [{ id: 'd1', due_on: `${pnl.ano}-${String(pnl.mes).padStart(2, '0')}-05`, kind: 'payable', description: 'Internet', amount_cents: 12990 }],
      proximas: [{ id: 'd2', due_on: `${pnl.ano}-${String(pnl.mes).padStart(2, '0')}-20`, kind: 'payable', description: 'Plano de saúde', amount_cents: 98000 }] },
    orcamento: [
      { id: 'o1', category: 'Alimentação', limit_cents: 180000, realizado_cents: 189500 },
      { id: 'o2', category: 'Casa', limit_cents: 320000, realizado_cents: 262990 },
      { id: 'o3', category: 'Transporte', limit_cents: 180000, realizado_cents: 127000 }],
    metas: { quantas: 3, ativas: 2, concluidas: 1, guardado_cents: 6300000, objetivo_cents: 9000000, proximas: [] },
    reserva: { id: 'r1', name: 'Reserva de emergência', target_cents: 5000000, current_cents: 3600000, monthly_target_cents: 100000 },
    cartoes: [{ id: 'c1', name: 'Nubank', last_four: '4417', limit_cents: 1000000, invoice_cents: 189000, due_day: 12 }],
    alertas: [
      { nivel: 'ruim', titulo: 'Alimentação passou do limite do mês', detalhe: '105% do planejado já foi gasto', onde: 'metas' },
      { nivel: 'ruim', titulo: '1 conta venceu e não foi baixada', detalhe: 'Internet (05)', onde: 'calendario' },
      { nivel: 'atencao', titulo: '1 conta vence nos próximos dias', detalhe: 'Plano de saúde (20)', onde: 'calendario' }]
  };

  /* Painéis de receitas e de despesas: o ano corrente e os últimos cinco. */
  const hoje = new Date(), anoHoje = hoje.getFullYear(), mesHoje = hoje.getMonth() + 1;
  const mesesDoAno = base.map(([entra, sai], i) => ({ ano: anoHoje, mes: i + 1, ym: `${anoHoje}-${String(i + 1).padStart(2, '0')}`,
    receitas_cents: i + 1 > mesHoje ? 0 : entra * 1000, despesas_cents: i + 1 > mesHoje ? 0 : sai * 1000 }));
  const totalDe = campo => mesesDoAno.reduce((t, m) => t + m[campo], 0);
  const repartir = (total, partes) => partes.map(([category, peso, quantos]) => ({ category, total_cents: Math.round(total * peso), quantos: quantos * mesHoje }));
  pnl.dados.contas_todas = pnl.dados.contas.map(c => ({ id: c.id, name: c.name, bank_id: c.bank_id, banco: c.banco }));
  pnl.dados.filtro = { account_id: null, bank_id: null };
  pnl.dados.ano_atual = {
    ano: anoHoje, meses: mesesDoAno,
    receitas: { total_cents: totalDe('receitas_cents'), quantos: 3 * mesHoje,
      por_tipo: repartir(totalDe('receitas_cents'), [['Salário', 0.82, 1], ['Freelance', 0.12, 1], ['Rendimentos', 0.06, 1]]) },
    despesas: { total_cents: totalDe('despesas_cents'), quantos: 26 * mesHoje,
      por_tipo: repartir(totalDe('despesas_cents'), [['Casa', 0.37, 4], ['Alimentação', 0.26, 11], ['Transporte', 0.17, 6], ['Educação', 0.13, 2], ['Saúde', 0.07, 3]]) },
    ultimos_anos: [[7900000, 6700000], [8600000, 7100000], [9500000, 7800000], [10800000, 8400000]]
      .map(([receitas_cents, despesas_cents], i) => ({ ano: anoHoje - 4 + i, receitas_cents, despesas_cents }))
      .concat({ ano: anoHoje, receitas_cents: totalDe('receitas_cents'), despesas_cents: totalDe('despesas_cents') })
  };
  recortarDemonstracao();
}

/* Na demonstração não há lançamento de verdade para filtrar: o recorte por
   banco ou conta mostra as contas escolhidas e reduz os números na proporção
   do saldo delas, só para a tela responder ao filtro. */
function recortarDemonstracao() {
  const d = pnl.dados;
  if (!pnl.banco && !pnl.conta) return;
  const dentro = c => (!pnl.conta || c.id === pnl.conta)
    && (!pnl.banco || (pnl.banco === PNL_SEM_BANCO ? !c.bank_id : c.bank_id === pnl.banco));
  const todas = d.contas;
  d.contas = todas.filter(dentro);
  d.saldo_total_cents = d.contas.reduce((t, c) => t + c.balance_cents, 0);
  d.filtro = { account_id: pnl.conta || null, bank_id: pnl.banco || null };
  const fator = d.saldo_total_cents / (todas.reduce((t, c) => t + c.balance_cents, 0) || 1);
  const escalar = valor => {
    if (Array.isArray(valor)) return valor.forEach(escalar);
    if (!valor || typeof valor !== 'object') return;
    for (const chave of Object.keys(valor)) {
      if (chave.endsWith('_cents') && typeof valor[chave] === 'number') valor[chave] = Math.round(valor[chave] * fator);
      else escalar(valor[chave]);
    }
  };
  ['mes', 'mes_anterior', 'serie_meses', 'serie_anos', 'por_categoria', 'por_fornecedor', 'transferencias', 'ano_atual'].forEach(chave => escalar(d[chave]));
}

// Oferece os anos que têm movimento, mais o corrente e o que está aberto —
// para o ano escolhido nunca sumir da lista por não ter lançamento nenhum.
function anosParaOGrafico(d) {
  const atual = new Date().getFullYear();
  const anos = new Set([atual, pnl.serieAno, d?.serie_ano].filter(Number.isInteger));
  (d?.serie_anos || []).forEach(linha => anos.add(Number(linha.ano)));
  return [...anos].filter(ano => ano >= 2000 && ano <= 2100).sort((a, b) => b - a);
}

async function carregarPainel() {
  pnl.carregando = true; pnl.erro = '';
  desenharPainel();
  try {
    const demonstracao = Boolean(window.demoMode || !sessionStorage.getItem('gfp_token'));
    // banco e conta escolhidos na demonstração não existem na conta de verdade, e vice-versa
    if (pnl.dados && demonstracao !== pnl.demo) { pnl.banco = ''; pnl.conta = ''; }
    if (demonstracao) {
      pnl.demo = true;
      painelDemonstracao();
    } else {
      pnl.demo = false;
      const [dados, categorias] = await Promise.all([
        request(`/dashboard?year=${pnl.ano}&month=${pnl.mes}&serie_ano=${pnl.serieAno}${pnl.conta ? `&account_id=${encodeURIComponent(pnl.conta)}` : ''}${pnl.banco ? `&bank_id=${encodeURIComponent(pnl.banco)}` : ''}`, { headers: authHeaders(), cache: 'no-store' }),
        request('/categories', { headers: authHeaders(), cache: 'no-store' })
      ]);
      pnl.dados = dados;
      lanc.categorias = categorias || lanc.categorias;
    }
  } catch (falha) {
    pnl.erro = typeof mensagemAmigavel === 'function' ? mensagemAmigavel(falha.message) : falha.message;
  }
  pnl.carregando = false;
  desenharPainel();
}
window.recarregarPainel = () => { if (document.body.classList.contains('tela-central')) carregarPainel(); };

/* ---------- pedacinhos de desenho ---------- */

const variacao = (agora, antes) => {
  if (!antes) return null;
  return Math.round(((Number(agora) - Number(antes)) / Math.abs(Number(antes))) * 100);
};
const setinha = (valor, bomSubir) => {
  if (valor === null || valor === 0) return '<small>igual ao mês anterior</small>';
  const subiu = valor > 0;
  const bom = subiu === bomSubir;
  return `<small class="${bom ? 'bom' : 'ruim'}">${subiu ? '▲' : '▼'} ${Math.abs(valor)}% ${subiu ? 'acima' : 'abaixo'} do mês anterior</small>`;
};

/* Colunas de receitas e despesas, desenhadas com divs — sem biblioteca nenhuma. */
function barrasDoPeriodo(linhas, rotulo) {
  const teto = Math.max(...linhas.flatMap(l => [Number(l.receitas_cents), Number(l.despesas_cents)]), 1);
  return `<div class="pnl-grafico">
    ${linhas.map(linha => {
      const entra = Number(linha.receitas_cents), sai = Number(linha.despesas_cents);
      return `<div class="pnl-col" title="${rotulo(linha)}: receitas ${reais(entra)}, despesas ${reais(sai)}">
        <div class="pnl-duplo">
          <i class="entra" style="height:${Math.max((entra / teto) * 100, entra ? 2 : 0)}%"></i>
          <i class="sai" style="height:${Math.max((sai / teto) * 100, sai ? 2 : 0)}%"></i>
        </div>
        <span>${rotulo(linha)}</span>
      </div>`;
    }).join('')}
  </div>`;
}

/* Uma série só — receitas ou despesas — com o valor escrito em cima de cada barra. */
const valorCurto = cents => {
  const v = Math.abs(Number(cents)) / 100;
  if (v >= 1e6) return `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (v >= 1e3) return `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
};
function barrasDeUmaSerie(linhas, campo, classe, rotulo) {
  const teto = Math.max(...linhas.map(l => Number(l[campo])), 1);
  return `<div class="pnl-grafico uma">
    ${linhas.map(linha => {
      const valor = Number(linha[campo]);
      return `<div class="pnl-col" title="${rotulo(linha)}: ${reais(valor)}">
        <b class="pnl-valor">${valor ? valorCurto(valor) : ''}</b>
        <div class="pnl-duplo"><i class="${classe}" style="height:${Math.max((valor / teto) * 100, valor ? 2 : 0)}%"></i></div>
        <span>${rotulo(linha)}</span>
      </div>`;
    }).join('')}
  </div>`;
}

function listaDeFatias(linhas, campoNome, total, comChip, vazio = 'Nada lançado neste mês ainda.') {
  if (!linhas.length) return `<div class="lanc-vazio">${vazio}</div>`;
  return `<div class="pnl-fatias">${linhas.map(linha => {
    const valor = Number(linha.total_cents);
    const parte = total ? Math.round((valor / total) * 100) : 0;
    return `<div class="pnl-fatia">
      <span class="pnl-fatia-nome">${comChip && typeof chipCategoria === 'function' ? chipCategoria(linha[campoNome]) : `<b>${seguro(linha[campoNome])}</b>`}</span>
      <div class="pnl-trilha"><i style="width:${Math.max(parte, 1)}%"></i></div>
      <span class="pnl-fatia-valor"><b>${reais(valor)}</b><small>${parte}% · ${linha.quantos} lanç.</small></span>
    </div>`;
  }).join('')}</div>`;
}

/* ---------- abas e recorte por banco e conta ---------- */

// Bancos e contas para o filtro: sempre a lista inteira, mesmo com recorte aplicado.
function contasParaOFiltro(d) { return d.contas_todas || d.contas || []; }
function bancosParaOFiltro(d) {
  const contas = contasParaOFiltro(d);
  const bancos = new Map();
  contas.forEach(c => { if (c.bank_id) bancos.set(c.bank_id, c.banco || 'Banco sem nome'); });
  const lista = [...bancos].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (lista.length && contas.some(c => !c.bank_id)) lista.push({ id: PNL_SEM_BANCO, nome: 'Sem banco (dinheiro e outros)' });
  return lista;
}
const contasDoBancoNoPainel = (d, banco) => contasParaOFiltro(d)
  .filter(c => !banco || (banco === PNL_SEM_BANCO ? !c.bank_id : c.bank_id === banco));

function barraDoPainel(d) {
  const bancos = bancosParaOFiltro(d);
  const contas = contasDoBancoNoPainel(d, pnl.banco);
  const aba = (id, rotulo) => `<button role="tab" data-aba="${id}" aria-selected="${pnl.aba === id}">${rotulo}</button>`;
  const recortado = Boolean(pnl.banco || pnl.conta);
  const nomeDoRecorte = pnl.conta
    ? contasParaOFiltro(d).find(c => c.id === pnl.conta)?.name
    : bancos.find(b => b.id === pnl.banco)?.nome;
  return `
    <div class="pnl-barra">
      <div class="pnl-abas" role="tablist" aria-label="Painéis da Central">
        ${aba('geral', '🏠 Visão geral')}${aba('receitas', '💰 Receitas')}${aba('despesas', '💸 Despesas')}
      </div>
      ${contasParaOFiltro(d).length ? `<div class="lanc-recorte pnl-recorte">
        ${bancos.length ? `<label>Banco
          <select id="pnlBanco">
            <option value="">Todos os bancos</option>
            ${bancos.map(b => `<option value="${seguro(b.id)}" ${pnl.banco === b.id ? 'selected' : ''}>${seguro(b.nome)}</option>`).join('')}
          </select></label>` : ''}
        <label>Conta
          <select id="pnlConta">
            <option value="">${pnl.banco ? 'Todas as contas do banco' : 'Todas as contas (consolidado)'}</option>
            ${contas.map(c => `<option value="${seguro(c.id)}" ${pnl.conta === c.id ? 'selected' : ''}>${seguro(c.name)}</option>`).join('')}
          </select></label>
      </div>` : ''}
    </div>
    ${recortado ? `<div class="pnl-recorte-aviso">
      <span>Mostrando só <b>${seguro(nomeDoRecorte || 'o recorte escolhido')}</b>: saldo, receitas, despesas, gráficos e transferências.
        Contas a pagar, metas, orçamento e cartões continuam sendo de todas as contas.</span>
      <button id="pnlConsolidar">Ver tudo consolidado</button>
    </div>` : ''}`;
}

/* ---------- painéis de Receitas e de Despesas ---------- */

/* Sempre o ano corrente — por tipo e mês a mês — e os últimos cinco anos.
   "Tipo" é a categoria do lançamento. */
function painelDoAno(d, qual) {
  const ano = d.ano_atual;
  if (!ano) return '<div class="lanc-vazio"><b>Painel indisponível</b>O servidor ainda não enviou estes números. Use Atualizar em alguns instantes.</div>';
  const receitas = qual === 'receitas';
  const lado = receitas ? ano.receitas : ano.despesas;
  const campo = receitas ? 'receitas_cents' : 'despesas_cents';
  const classe = receitas ? 'entra' : 'sai';
  const nome = receitas ? 'Receitas' : 'Despesas';
  const nomeMinusculo = nome.toLowerCase();

  // A média considera os meses que já começaram: dividir por doze no meio do ano puxaria o número para baixo.
  const hoje = new Date();
  const mesesCorridos = hoje.getFullYear() === ano.ano ? hoje.getMonth() + 1 : 12;
  const media = Math.round(lado.total_cents / mesesCorridos);
  const maior = ano.meses.reduce((melhor, m) => (m[campo] > melhor[campo] ? m : melhor), ano.meses[0]);
  const anos = ano.ultimos_anos;
  const totalCincoAnos = anos.reduce((t, a) => t + a[campo], 0);

  return `
    <div class="pnl-kpis quatro">
      <article class="pnl-kpi ${receitas ? 'verde' : 'vermelho'}">
        <span>${nome} em ${ano.ano}</span><strong>${reais(lado.total_cents)}</strong>
        <small>${lado.quantos} ${lado.quantos === 1 ? 'lançamento' : 'lançamentos'} no ano</small>
      </article>
      <article class="pnl-kpi">
        <span>Média por mês</span><strong>${reais(media)}</strong>
        <small>${mesesCorridos === 12 ? 'nos doze meses' : `de janeiro a ${MESES_NOME[mesesCorridos - 1].toLowerCase()}`}</small>
      </article>
      <article class="pnl-kpi">
        <span>${receitas ? 'Mês de maior receita' : 'Mês de maior despesa'}</span><strong>${maior[campo] ? MESES_NOME[maior.mes - 1] : '—'}</strong>
        <small>${maior[campo] ? reais(maior[campo]) : 'sem movimento no ano'}</small>
      </article>
      <article class="pnl-kpi roxo">
        <span>Últimos 5 anos</span><strong>${reais(totalCincoAnos)}</strong>
        <small>${anos[0].ano} a ${anos[anos.length - 1].ano}</small>
      </article>
    </div>

    <div class="pnl-duas">
      <section class="pnl-bloco">
        <div class="met-cabeca"><div><h3>🏷️ ${nome} por tipo</h3><p>Por categoria, em ${ano.ano}.</p></div></div>
        ${listaDeFatias(lado.por_tipo, 'category', lado.total_cents, true, `Nenhuma ${receitas ? 'receita' : 'despesa'} lançada em ${ano.ano} ainda.`)}
      </section>
      <section class="pnl-bloco">
        <div class="met-cabeca"><div><h3>📊 ${nome} por mês</h3><p>Janeiro a dezembro de ${ano.ano}.</p></div></div>
        ${barrasDeUmaSerie(ano.meses, campo, classe, linha => MESES_NOME[linha.mes - 1].slice(0, 3).toLowerCase())}
      </section>
    </div>

    <section class="pnl-bloco">
      <div class="met-cabeca"><div><h3>📅 ${nome} dos últimos 5 anos</h3><p>${anos[0].ano} a ${anos[anos.length - 1].ano}. O ano corrente conta só até hoje.</p></div></div>
      ${barrasDeUmaSerie(anos, campo, classe, linha => String(linha.ano))}
      <div class="pnl-anos">${anos.map((linha, i) => {
        const antes = i ? anos[i - 1][campo] : 0;
        const mudou = antes ? Math.round(((linha[campo] - antes) / antes) * 100) : null;
        // subir é bom para receita e ruim para despesa
        const tom = mudou === null || mudou === 0 ? 'neutro' : (mudou > 0) === receitas ? 'bom' : 'ruim';
        return `<span><b>${linha.ano}</b> ${nomeMinusculo} de ${reais(linha[campo])} · <em class="${tom}">${mudou === null ? 'sem ano anterior para comparar' : mudou === 0 ? 'igual ao ano anterior' : `${mudou > 0 ? '▲' : '▼'} ${Math.abs(mudou)}% sobre ${linha.ano - 1}`}</em></span>`;
      }).join('')}</div>
    </section>`;
}

/* ---------- a tela ---------- */

function desenharPainel() {
  const alvo = document.querySelector('#telaCentral');
  if (!alvo) return;
  if (pnl.carregando && !pnl.dados) {
    alvo.innerHTML = '<div class="lanc-tabela"><div class="lanc-vazio">Carregando os seus números…</div></div>';
    return;
  }
  if (pnl.erro && !pnl.dados) {
    alvo.innerHTML = `<div class="lanc-falha"><div>${svg('alerta')}<span><b>Não consegui carregar o painel</b><small>${seguro(pnl.erro)}</small></span></div><button id="pnlTentarDeNovo">Tentar de novo</button></div>`;
    alvo.querySelector('#pnlTentarDeNovo').addEventListener('click', carregarPainel);
    return;
  }
  const d = pnl.dados;
  if (!d) return;

  const despesasCat = d.por_categoria.filter(c => c.type === 'expense');
  const receitasCat = d.por_categoria.filter(c => c.type === 'income');
  const totalDespesas = despesasCat.reduce((t, c) => t + Number(c.total_cents), 0);
  const totalReceitas = receitasCat.reduce((t, c) => t + Number(c.total_cents), 0);
  const totalFornecedores = d.por_fornecedor.reduce((t, f) => t + Number(f.total_cents), 0);
  const semNada = !d.mes.quantos && !contasParaOFiltro(d).length;

  const anoDosPaineis = d.ano_atual?.ano || new Date().getFullYear();
  const titulo = pnl.aba === 'receitas' ? `Receitas de ${anoDosPaineis}` : pnl.aba === 'despesas' ? `Despesas de ${anoDosPaineis}` : `${MESES_NOME[d.month - 1]} de ${d.year}`;

  alvo.innerHTML = `
    <div class="pnl-topo">
      <div class="lanc-head">
        <small>SEU PAINEL</small>
        <h2>${titulo}</h2>
        <p>${pnl.aba === 'geral'
          ? 'Tudo aqui vem dos seus lançamentos — a cada movimentação nova, estes números mudam.'
          : `Por tipo e mês a mês, sempre no ano atual, e o total de cada um dos últimos cinco anos.`}${pnl.demo ? ' <b>Dados de demonstração.</b>' : ''}</p>
      </div>
      <div class="pnl-periodo">
        ${pnl.aba === 'geral' ? `<button id="pnlMesAnterior" title="Mês anterior">◀</button>
        <span>${MESES_NOME[d.month - 1]} ${d.year}</span>
        <button id="pnlMesSeguinte" title="Mês seguinte">▶</button>` : ''}
        <button class="pnl-atualizar" id="pnlAtualizar">${svg('atualizar', 'ico-s')}Atualizar</button>
      </div>
    </div>

    ${barraDoPainel(d)}

    ${pnl.erro ? `<div class="lanc-falha"><div>${svg('alerta')}<span><b>Os números podem estar velhos</b><small>${seguro(pnl.erro)}</small></span></div><button id="pnlTentarDeNovo">Tentar de novo</button></div>` : ''}

    ${semNada ? `<div class="pnl-comeco">
      <b>Você ainda não tem movimentação</b>
      <span>Cadastre uma conta e importe um extrato — no minuto seguinte todos os painéis desta tela se preenchem sozinhos.</span>
      <div><button data-ir="lancamentos">🧾 Ir para Lançamentos</button><button data-ir="cadastros">🗂️ Cadastrar conta</button></div>
    </div>` : ''}

    ${pnl.aba === 'geral' ? `
    <div class="pnl-kpis">
      <article class="pnl-kpi roxo">
        <span>Saldo somando as contas</span><strong>${reais(d.saldo_total_cents)}</strong>
        <small>${d.contas.length ? `${d.contas.length} ${d.contas.length === 1 ? 'conta' : 'contas'} · saldo de hoje` : 'nenhuma conta cadastrada'}</small>
      </article>
      <article class="pnl-kpi verde">
        <span>Receitas do mês</span><strong>${reais(d.mes.receitas_cents)}</strong>
        ${setinha(variacao(d.mes.receitas_cents, d.mes_anterior.receitas_cents), true)}
      </article>
      <article class="pnl-kpi vermelho">
        <span>Despesas do mês</span><strong>${reais(d.mes.despesas_cents)}</strong>
        ${setinha(variacao(d.mes.despesas_cents, d.mes_anterior.despesas_cents), false)}
      </article>
      <article class="pnl-kpi ${d.mes.resultado_cents >= 0 ? 'azul' : 'vermelho'}">
        <span>${d.mes.resultado_cents >= 0 ? 'Sobrou no mês' : 'Faltou no mês'}</span><strong>${reais(Math.abs(d.mes.resultado_cents))}</strong>
        <small>${d.mes.quantos} ${d.mes.quantos === 1 ? 'lançamento' : 'lançamentos'} no mês</small>
      </article>
      <article class="pnl-kpi ${d.agenda.quantas_atrasadas ? 'vermelho' : ''}">
        <span>Contas a pagar em aberto</span><strong>${reais(d.agenda.a_pagar_cents)}</strong>
        <small class="${d.agenda.quantas_atrasadas ? 'ruim' : ''}">${d.agenda.quantas_atrasadas
          ? `${d.agenda.quantas_atrasadas} ${d.agenda.quantas_atrasadas === 1 ? 'vencida' : 'vencidas'}`
          : 'nada vencido'}${d.agenda.a_receber_cents ? ` · ${reais(d.agenda.a_receber_cents)} a receber` : ''}</small>
      </article>
    </div>

    ${d.contas.length ? `<div class="pnl-contas">${d.contas.map(conta => `
      <span class="pnl-conta ${Number(conta.balance_cents) < 0 ? 'negativa' : ''}">
        ${seguro(conta.name)}<em>${reais(conta.balance_cents)}</em></span>`).join('')}</div>` : ''}

    ${d.transferencias && d.transferencias.quantas ? `
    <section class="pnl-bloco">
      <div class="met-cabeca">
        <div><h3>🔁 Transferências entre suas contas</h3>
          <p>${d.transferencias.quantas} ${d.transferencias.quantas === 1 ? 'transferência' : 'transferências'} no mês,
            somando ${reais(d.transferencias.total_cents)}. Dinheiro que mudou de banco — não conta como receita nem como despesa.</p></div>
      </div>
      <div class="pnl-transferencias">
        ${d.transferencias.pares.map(par => `
          <div class="pnl-transf-linha">
            <span>${seguro(par.origem)}</span>
            <span class="pnl-transf-seta" aria-hidden="true">→</span>
            <span>${seguro(par.destino)}</span>
            <b>${reais(par.total_cents)}</b>
            <small>${par.quantas}x</small>
          </div>`).join('')}
      </div>
    </section>` : ''}

    <section class="pnl-bloco">
      <div class="met-cabeca">
        <div><h3>📊 Receitas x despesas, mês a mês</h3><p>Janeiro a dezembro de ${d.serie_ano || pnl.serieAno}.</p></div>
        <div class="pnl-cabeca-dir">
          <label class="pnl-ano-escolha">Ano
            <select id="pnlSerieAno">
              ${anosParaOGrafico(d).map(ano => `<option value="${ano}" ${ano === (d.serie_ano || pnl.serieAno) ? 'selected' : ''}>${ano}</option>`).join('')}
            </select>
          </label>
          <div class="pnl-legenda"><span><i class="entra"></i>Receitas</span><span><i class="sai"></i>Despesas</span></div>
        </div>
      </div>
      ${barrasDoPeriodo(d.serie_meses, linha => MESES_NOME[linha.mes - 1].slice(0, 3).toLowerCase())}
    </section>

    ${d.serie_anos.length > 1 ? `<section class="pnl-bloco">
      <div class="met-cabeca">
        <div><h3>📅 Receitas x despesas, ano a ano</h3><p>O ano corrente conta só até hoje.</p></div>
        <div class="pnl-legenda"><span><i class="entra"></i>Receitas</span><span><i class="sai"></i>Despesas</span></div>
      </div>
      ${barrasDoPeriodo(d.serie_anos, linha => String(linha.ano))}
      <div class="pnl-anos">${d.serie_anos.map(linha => {
        const sobra = Number(linha.receitas_cents) - Number(linha.despesas_cents);
        return `<span><b>${linha.ano}</b> receitas ${reais(linha.receitas_cents)} · despesas ${reais(linha.despesas_cents)} · <em class="${sobra >= 0 ? 'bom' : 'ruim'}">${sobra >= 0 ? 'sobrou' : 'faltou'} ${reais(Math.abs(sobra))}</em></span>`;
      }).join('')}</div>
    </section>` : ''}

    <div class="pnl-duas">
      <section class="pnl-bloco">
        <div class="met-cabeca"><div><h3>🏷️ Para onde foi o dinheiro</h3><p>Despesas do mês por categoria.</p></div></div>
        ${listaDeFatias(despesasCat, 'category', totalDespesas, true)}
      </section>
      <section class="pnl-bloco">
        <div class="met-cabeca"><div><h3>🏪 Quem mais recebeu</h3><p>Despesas do mês por fornecedor.</p></div></div>
        ${d.por_fornecedor.length
          ? listaDeFatias(d.por_fornecedor, 'supplier', totalFornecedores, false)
          : '<div class="lanc-vazio"><b>Nenhum fornecedor identificado</b>Na importação do extrato eu descubro o fornecedor de cada linha — depois disso este painel se preenche.</div>'}
      </section>
    </div>

    ${receitasCat.length ? `<section class="pnl-bloco">
      <div class="met-cabeca"><div><h3>💰 De onde veio o dinheiro</h3><p>Receitas do mês por categoria.</p></div></div>
      ${listaDeFatias(receitasCat, 'category', totalReceitas, true)}
    </section>` : ''}

    <div class="pnl-duas">
      <section class="pnl-bloco">
        <div class="met-cabeca"><div><h3>🔔 Pedindo atenção</h3><p>Calculado dos seus próprios números.</p></div></div>
        <div class="pnl-alertas">${d.alertas.map(alerta => `
          <div class="pnl-alerta ${seguro(alerta.nivel)}" ${alerta.onde ? `data-ir="${seguro(alerta.onde)}" role="button" tabindex="0"` : ''}>
            <i>${NIVEIS[alerta.nivel] || '🔵'}</i>
            <span><b>${seguro(alerta.titulo)}</b>${alerta.detalhe ? `<small>${seguro(alerta.detalhe)}</small>` : ''}</span>
            ${alerta.onde ? '<em>ver →</em>' : ''}
          </div>`).join('')}</div>
      </section>

      <section class="pnl-bloco">
        <div class="met-cabeca"><div><h3>🎯 Metas, orçamento e reserva</h3><p>O resumo do planejamento.</p></div>
          <button class="met-novo" data-ir="metas">Abrir metas</button></div>
        <div class="pnl-planos">
          <div class="pnl-plano">
            <span>Guardado nas metas</span>
            <b>${reais(d.metas.guardado_cents)}${d.metas.objetivo_cents ? ` <small>de ${reais(d.metas.objetivo_cents)}</small>` : ''}</b>
            <div class="met-barra"><i class="${d.metas.objetivo_cents && d.metas.guardado_cents >= d.metas.objetivo_cents ? 'bom' : ''}" style="width:${d.metas.objetivo_cents ? Math.min(Math.round((d.metas.guardado_cents / d.metas.objetivo_cents) * 100), 100) : 0}%"></i></div>
            <small>${d.metas.quantas ? `${d.metas.ativas} ${d.metas.ativas === 1 ? 'meta ativa' : 'metas ativas'}${d.metas.concluidas ? ` · ${d.metas.concluidas} ${d.metas.concluidas === 1 ? 'concluída' : 'concluídas'}` : ''}` : 'nenhuma meta cadastrada'}</small>
          </div>
          <div class="pnl-plano">
            <span>Reserva de emergência</span>
            <b>${d.reserva ? reais(d.reserva.current_cents) : reais(0)}${d.reserva ? ` <small>de ${reais(d.reserva.target_cents)}</small>` : ''}</b>
            <div class="met-barra"><i class="${d.reserva && d.reserva.current_cents >= d.reserva.target_cents ? 'bom' : ''}" style="width:${d.reserva && d.reserva.target_cents ? Math.min(Math.round((d.reserva.current_cents / d.reserva.target_cents) * 100), 100) : 0}%"></i></div>
            <small>${d.reserva ? 'seu colchão para o imprevisto' : 'ainda não criada'}</small>
          </div>
        </div>
        ${d.orcamento.length ? `<div class="pnl-orcamento">${d.orcamento.map(limite => {
          const uso = Number(limite.limit_cents) ? Math.round((Number(limite.realizado_cents) / Number(limite.limit_cents)) * 100) : 0;
          const cor = uso >= 100 ? 'ruim' : uso >= 75 ? 'atencao' : 'bom';
          return `<div class="pnl-orc">
            <span>${typeof chipCategoria === 'function' ? chipCategoria(limite.category) : seguro(limite.category)}</span>
            <div class="met-barra"><i class="${cor}" style="width:${Math.min(uso, 100)}%"></i></div>
            <b class="${cor}">${uso}%</b>
            <small>${reais(limite.realizado_cents)} de ${reais(limite.limit_cents)}</small>
          </div>`;
        }).join('')}</div>` : '<div class="pnl-sem-orcamento">Nenhum limite definido para este mês. <button data-ir="metas">Definir limites</button></div>'}
      </section>
    </div>

    ${d.agenda.atrasadas.length || d.agenda.proximas.length ? `<section class="pnl-bloco">
      <div class="met-cabeca"><div><h3>📅 Vencimentos que pedem ação</h3><p>Vencidas primeiro, depois as dos próximos cinco dias.</p></div>
        <button class="met-novo" data-ir="calendario">Abrir calendário</button></div>
      <div class="cal-lista">${[...d.agenda.atrasadas.map(p => ({ ...p, vencida: true })), ...d.agenda.proximas].map(p => `
        <div class="cal-item ${p.vencida ? 'atrasada' : ''}">
          <span class="cal-quando"><b>${dataBr(p.due_on).slice(0, 5)}</b><small>${p.vencida ? 'venceu' : 'vence'}</small></span>
          <span class="cal-quem"><b>${seguro(p.description)}</b><small>${p.kind === 'receivable' ? 'a receber' : 'a pagar'}${p.category ? ` · ${seguro(p.category)}` : ''}</small></span>
          <span class="cal-cat"></span>
          <span class="cal-valor ${p.kind === 'receivable' ? 'receber' : 'pagar'}">${p.kind === 'receivable' ? '+' : '−'} ${reais(p.amount_cents).replace('R$', '').trim()}</span>
          <button class="cal-baixar" data-ir="calendario">Abrir</button>
        </div>`).join('')}</div>
    </section>` : ''}` : painelDoAno(d, pnl.aba)}`;

  ligarEventosPainel();
  ajustarCabecalho(d);
}

/* O cabeçalho da página deixa de trazer a frase fixa e passa a dizer o que os
   alertas realmente encontraram. */
function ajustarCabecalho(d) {
  const pedindo = d.alertas.filter(a => a.nivel === 'ruim' || a.nivel === 'atencao').length;
  const frase = document.querySelector('header p');
  if (frase) {
    frase.textContent = pedindo
      ? `${pedindo === 1 ? '1 ponto pede' : `${pedindo} pontos pedem`} atenção neste mês — o painel abaixo mostra quais.`
      : 'Contas em dia, orçamento respeitado e saldos positivos neste mês.';
  }
  const sino = document.querySelector('.header-actions button i');
  if (sino) {
    sino.textContent = String(pedindo);
    sino.hidden = pedindo === 0;
  }
}

function ligarEventosPainel() {
  const tela = document.querySelector('#telaCentral');
  tela.querySelector('#pnlTentarDeNovo')?.addEventListener('click', carregarPainel);
  tela.querySelector('#pnlAtualizar')?.addEventListener('click', carregarPainel);
  tela.querySelectorAll('[data-aba]').forEach(botao => botao.addEventListener('click', () => {
    pnl.aba = botao.dataset.aba;
    desenharPainel();
  }));
  tela.querySelector('#pnlBanco')?.addEventListener('change', evento => {
    pnl.banco = evento.target.value;
    pnl.conta = '';   // a conta escolhida pode não ser desse banco
    carregarPainel();
  });
  tela.querySelector('#pnlConta')?.addEventListener('change', evento => {
    pnl.conta = evento.target.value;
    carregarPainel();
  });
  tela.querySelector('#pnlConsolidar')?.addEventListener('click', () => {
    pnl.banco = ''; pnl.conta = '';
    carregarPainel();
  });
  tela.querySelector('#pnlSerieAno')?.addEventListener('change', evento => {
    pnl.serieAno = Number(evento.target.value) || pnl.serieAno;
    carregarPainel();
  });
  tela.querySelector('#pnlMesAnterior')?.addEventListener('click', () => {
    pnl.mes -= 1; if (pnl.mes < 1) { pnl.mes = 12; pnl.ano -= 1; }
    carregarPainel();
  });
  tela.querySelector('#pnlMesSeguinte')?.addEventListener('click', () => {
    pnl.mes += 1; if (pnl.mes > 12) { pnl.mes = 1; pnl.ano += 1; }
    carregarPainel();
  });
  const irPara = destino => {
    const botao = document.querySelector(`.sidebar nav [data-tela="${destino}"]`)
      || document.querySelector(`.sidebar nav [data-open-${destino}]`);
    if (botao) botao.click();
  };
  tela.querySelectorAll('[data-ir]').forEach(elemento => {
    elemento.addEventListener('click', () => irPara(elemento.dataset.ir));
    elemento.addEventListener('keydown', evento => {
      if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); irPara(elemento.dataset.ir); }
    });
  });
}

/* ---------- entrada na tela ---------- */

function abrirTelaCentral() {
  document.body.classList.remove('tela-lancamentos', 'tela-cadastros', 'tela-metas', 'tela-calendario', 'tela-ajuda', 'tela-emprestimos');
  document.body.classList.add('tela-central');
  document.querySelectorAll('.sidebar nav button').forEach(botao =>
    botao.classList.toggle('active', botao.dataset.tela === 'central'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  carregarPainel();
}
function fecharTelaCentral() { document.body.classList.remove('tela-central'); }
window.abrirTelaCentral = abrirTelaCentral;

document.querySelector('[data-tela="central"]')?.addEventListener('click', abrirTelaCentral);
document.querySelectorAll('.sidebar nav button:not([data-tela="central"])').forEach(botao =>
  botao.addEventListener('click', fecharTelaCentral));

/* Rede de segurança: se a sessão mudar por outro caminho (login, demonstração,
   sair), o painel se refaz sozinho em vez de deixar número velho na tela. */
let sessaoVista = `${sessionStorage.getItem('gfp_token') || ''}|${window.demoMode ? 1 : 0}`;
setInterval(() => {
  const agora = `${sessionStorage.getItem('gfp_token') || ''}|${window.demoMode ? 1 : 0}`;
  if (agora === sessaoVista) return;
  sessaoVista = agora;
  if (document.body.classList.contains('tela-central')) carregarPainel();
}, 1500);

/* A Central é a tela de entrada: assim que a página carrega, ela já é a que aparece. */
document.body.classList.add('tela-central');
if (document.querySelector('#telaCentral')) carregarPainel();

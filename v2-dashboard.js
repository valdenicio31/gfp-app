/* Central do GFP Familiar: todo número desta tela sai dos lançamentos, da agenda,
   das metas e do orçamento da própria família. Nada aqui é fixo — quando entra
   uma movimentação, a tela recarrega e os painéis mudam junto. */

const pnl = { dados: null, mes: new Date().getMonth() + 1, ano: new Date().getFullYear(), carregando: false, erro: '', demo: false };

const NIVEIS = { ruim: '🔴', atencao: '🟡', bom: '🟢', info: '🔵' };

function painelDemonstracao() {
  const serie = [];
  const base = [[820, 610], [790, 705], [880, 640], [830, 690], [910, 720], [860, 655],
    [900, 780], [940, 700], [880, 745], [950, 690], [1020, 810], [980, 715]];
  for (let i = 11; i >= 0; i -= 1) {
    const data = new Date(pnl.ano, pnl.mes - 1 - i, 1);
    const [entra, sai] = base[11 - i];
    serie.push({ ym: `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`, mes: data.getMonth() + 1, ano: data.getFullYear(), receitas_cents: entra * 1000, despesas_cents: sai * 1000 });
  }
  pnl.dados = {
    hoje: new Date().toLocaleDateString('sv-SE'), year: pnl.ano, month: pnl.mes,
    contas: [{ id: 'd1', name: 'Nubank · corrente', balance_cents: 875000, banco: 'Nubank' },
      { id: 'd2', name: 'Itaú · corrente', balance_cents: 320000, banco: 'Itaú' },
      { id: 'd3', name: 'Dinheiro', balance_cents: 18000, banco: null }],
    saldo_total_cents: 1213000,
    mes: { receitas_cents: 980000, despesas_cents: 715000, resultado_cents: 265000, quantos: 34 },
    mes_anterior: { receitas_cents: 1020000, despesas_cents: 810000, resultado_cents: 210000 },
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
}

async function carregarPainel() {
  pnl.carregando = true; pnl.erro = '';
  desenharPainel();
  try {
    if (window.demoMode || !sessionStorage.getItem('gfp_token')) {
      pnl.demo = true;
      painelDemonstracao();
    } else {
      pnl.demo = false;
      const [dados, categorias] = await Promise.all([
        request(`/dashboard?year=${pnl.ano}&month=${pnl.mes}`, { headers: authHeaders(), cache: 'no-store' }),
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
      return `<div class="pnl-col" title="${rotulo(linha)}: entrou ${reais(entra)}, saiu ${reais(sai)}">
        <div class="pnl-duplo">
          <i class="entra" style="height:${Math.max((entra / teto) * 100, entra ? 2 : 0)}%"></i>
          <i class="sai" style="height:${Math.max((sai / teto) * 100, sai ? 2 : 0)}%"></i>
        </div>
        <span>${rotulo(linha)}</span>
      </div>`;
    }).join('')}
  </div>`;
}

function listaDeFatias(linhas, campoNome, total, comChip) {
  if (!linhas.length) return '<div class="lanc-vazio">Nada lançado neste mês ainda.</div>';
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
  const semNada = !d.mes.quantos && !d.contas.length;

  alvo.innerHTML = `
    <div class="pnl-topo">
      <div class="lanc-head">
        <small>PAINEL DA FAMÍLIA</small>
        <h2>${MESES_NOME[d.month - 1]} de ${d.year}</h2>
        <p>Tudo aqui vem dos seus lançamentos — a cada movimentação nova, estes números mudam.${pnl.demo ? ' <b>Dados de demonstração.</b>' : ''}</p>
      </div>
      <div class="pnl-periodo">
        <button id="pnlMesAnterior" title="Mês anterior">◀</button>
        <span>${MESES_NOME[d.month - 1]} ${d.year}</span>
        <button id="pnlMesSeguinte" title="Mês seguinte">▶</button>
        <button class="pnl-atualizar" id="pnlAtualizar">${svg('atualizar', 'ico-s')}Atualizar</button>
      </div>
    </div>

    ${pnl.erro ? `<div class="lanc-falha"><div>${svg('alerta')}<span><b>Os números podem estar velhos</b><small>${seguro(pnl.erro)}</small></span></div><button id="pnlTentarDeNovo">Tentar de novo</button></div>` : ''}

    ${semNada ? `<div class="pnl-comeco">
      <b>Sua família ainda não tem movimentação</b>
      <span>Cadastre uma conta e importe um extrato — no minuto seguinte todos os painéis desta tela se preenchem sozinhos.</span>
      <div><button data-ir="lancamentos">🧾 Ir para Lançamentos</button><button data-ir="cadastros">🗂️ Cadastrar conta</button></div>
    </div>` : ''}

    <div class="pnl-kpis">
      <article class="pnl-kpi roxo">
        <span>Saldo somando as contas</span><strong>${reais(d.saldo_total_cents)}</strong>
        <small>${d.contas.length ? `${d.contas.length} ${d.contas.length === 1 ? 'conta' : 'contas'} · saldo de hoje` : 'nenhuma conta cadastrada'}</small>
      </article>
      <article class="pnl-kpi verde">
        <span>Entrou no mês</span><strong>${reais(d.mes.receitas_cents)}</strong>
        ${setinha(variacao(d.mes.receitas_cents, d.mes_anterior.receitas_cents), true)}
      </article>
      <article class="pnl-kpi vermelho">
        <span>Saiu no mês</span><strong>${reais(d.mes.despesas_cents)}</strong>
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

    <section class="pnl-bloco">
      <div class="met-cabeca">
        <div><h3>📊 Entrou x saiu, mês a mês</h3><p>Os doze meses até ${MESES_NOME[d.month - 1].toLowerCase()}.</p></div>
        <div class="pnl-legenda"><span><i class="entra"></i>Entrou</span><span><i class="sai"></i>Saiu</span></div>
      </div>
      ${barrasDoPeriodo(d.serie_meses, linha => `${MESES_NOME[linha.mes - 1].slice(0, 3).toLowerCase()}${linha.mes === 1 || linha === d.serie_meses[0] ? `/${String(linha.ano).slice(2)}` : ''}`)}
    </section>

    ${d.serie_anos.length > 1 ? `<section class="pnl-bloco">
      <div class="met-cabeca">
        <div><h3>📅 Entrou x saiu, ano a ano</h3><p>O ano corrente conta só até hoje.</p></div>
        <div class="pnl-legenda"><span><i class="entra"></i>Entrou</span><span><i class="sai"></i>Saiu</span></div>
      </div>
      ${barrasDoPeriodo(d.serie_anos, linha => String(linha.ano))}
      <div class="pnl-anos">${d.serie_anos.map(linha => {
        const sobra = Number(linha.receitas_cents) - Number(linha.despesas_cents);
        return `<span><b>${linha.ano}</b> entrou ${reais(linha.receitas_cents)} · saiu ${reais(linha.despesas_cents)} · <em class="${sobra >= 0 ? 'bom' : 'ruim'}">${sobra >= 0 ? 'sobrou' : 'faltou'} ${reais(Math.abs(sobra))}</em></span>`;
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
            <small>${d.reserva ? 'o colchão da família' : 'ainda não criada'}</small>
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
    </section>` : ''}`;

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
  document.body.classList.remove('tela-lancamentos', 'tela-cadastros', 'tela-metas', 'tela-calendario', 'tela-ajuda');
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

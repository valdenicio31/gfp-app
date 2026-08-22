/* Calendário do mês e agenda de contas a pagar e a receber do GFP Familiar.
   A agenda guarda o compromisso ("aluguel, todo dia 10"); o calendário mostra
   os vencimentos do mês e, com um clique em "Pagar", a previsão vira lançamento. */

const cal = {
  ano: new Date().getFullYear(), mes: new Date().getMonth() + 1,
  lancamentos: [], previstas: [], faturas: [], metas: [], resumo: {},
  agenda: [], diaAberto: '', carregando: false, erro: '', demo: false
};

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DIAS_SEMANA_LONGO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const TODA_SEMANA = ['todo domingo', 'toda segunda-feira', 'toda terça-feira', 'toda quarta-feira', 'toda quinta-feira', 'toda sexta-feira', 'todo sábado'];
const hojeISO = () => new Date().toLocaleDateString('sv-SE');
const diasDoMes = (ano, mes) => new Date(ano, mes, 0).getDate();
const dataDoDia = (ano, mes, dia) => `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
const semanaDe = iso => new Date(`${iso}T12:00:00`).getDay();

/* ---------- dados ---------- */

function calendarioDemonstracao() {
  const d = dia => dataDoDia(cal.ano, cal.mes, Math.min(dia, diasDoMes(cal.ano, cal.mes)));
  cal.previstas = [
    { id: 'demo-1', due_on: d(5), kind: 'payable', description: 'Escola', amount_cents: 180000, category: 'Educação', conta_nome: 'Nubank', recurrence: 'monthly', pago: true },
    { id: 'demo-2', due_on: d(5), kind: 'receivable', description: 'Salário', amount_cents: 700000, category: 'Salário', conta_nome: 'Nubank', recurrence: 'monthly', pago: true },
    { id: 'demo-3', due_on: d(10), kind: 'payable', description: 'Aluguel', amount_cents: 250000, category: 'Casa', supplier: 'Imobiliária Central', conta_nome: 'Nubank', recurrence: 'monthly', pago: false },
    { id: 'demo-4', due_on: d(15), kind: 'payable', description: 'Internet', amount_cents: 12990, category: 'Casa', supplier: 'Vivo Fibra', conta_nome: 'Nubank', recurrence: 'monthly', pago: false },
    { id: 'demo-5', due_on: d(20), kind: 'payable', description: 'Plano de saúde', amount_cents: 98000, category: 'Saúde', conta_nome: 'Itaú', recurrence: 'monthly', pago: false }
  ];
  cal.lancamentos = [
    { id: 'demo-l1', occurred_on: d(3), type: 'expense', description: 'Supermercado', amount_cents: 48900, category: 'Alimentação', conta_nome: 'Nubank' },
    { id: 'demo-l2', occurred_on: d(5), type: 'income', description: 'Salário', amount_cents: 700000, category: 'Salário', conta_nome: 'Nubank' },
    { id: 'demo-l3', occurred_on: d(12), type: 'expense', description: 'Posto Ipiranga', amount_cents: 27000, category: 'Transporte', conta_nome: 'Nubank' }
  ];
  cal.faturas = [{ id: 'demo-c1', name: 'Nubank', last_four: '4417', due_day: 12, invoice_cents: 189000, due_on: d(12) }];
  cal.metas = [{ id: 'demo-m1', title: 'Viagem em família', emoji: '✈️', deadline: d(28), target_cents: 2000000, current_cents: 1500000 }];
  cal.agenda = cal.previstas.map(p => ({ ...p, day_of_month: Number(p.due_on.slice(8, 10)), is_active: true, first_due_on: p.due_on }));
  cal.resumo = {
    entradas_cents: 700000, saidas_cents: 75900,
    a_pagar_cents: 250000 + 12990 + 98000, a_receber_cents: 0,
    pago_cents: 180000, faturas_cents: 189000
  };
}

async function carregarCalendario() {
  cal.carregando = true; cal.erro = '';
  desenharCalendario();
  try {
    if (window.demoMode || !sessionStorage.getItem('gfp_token')) {
      cal.demo = true;
      calendarioDemonstracao();
    } else {
      cal.demo = false;
      const [mes, agenda, contas, categorias] = await Promise.all([
        request(`/calendar?year=${cal.ano}&month=${cal.mes}`, { headers: authHeaders(), cache: 'no-store' }),
        request('/scheduled-bills', { headers: authHeaders(), cache: 'no-store' }),
        request('/accounts', { headers: authHeaders(), cache: 'no-store' }),
        request('/categories', { headers: authHeaders(), cache: 'no-store' })
      ]);
      cal.lancamentos = mes.lancamentos || [];
      cal.previstas = mes.previstas || [];
      cal.faturas = mes.faturas || [];
      cal.metas = mes.metas || [];
      cal.resumo = mes.resumo || {};
      cal.agenda = agenda || [];
      lanc.contas = contas || lanc.contas;
      lanc.categorias = categorias || lanc.categorias;
    }
  } catch (falha) {
    cal.erro = typeof mensagemAmigavel === 'function' ? mensagemAmigavel(falha.message) : falha.message;
  }
  cal.carregando = false;
  desenharCalendario();
}

/* ---------- o que acontece em cada dia ---------- */

function itensDoDia(iso) {
  return {
    previstas: cal.previstas.filter(p => p.due_on === iso),
    lancamentos: cal.lancamentos.filter(l => String(l.occurred_on).slice(0, 10) === iso),
    faturas: cal.faturas.filter(f => f.due_on === iso),
    metas: cal.metas.filter(m => m.deadline === iso)
  };
}
const atrasada = previsao => !previsao.pago && previsao.due_on < hojeISO();
const emAberto = () => cal.previstas.filter(p => !p.pago).sort((a, b) => (a.due_on < b.due_on ? -1 : 1));

/* ---------- desenho ---------- */

function desenharCalendario() {
  const alvo = document.querySelector('#telaCalendario');
  if (!alvo) return;
  const r = cal.resumo || {};
  const atrasados = cal.previstas.filter(atrasada);

  alvo.innerHTML = `
    <div class="lanc-head">
      <small>AGENDA DA FAMÍLIA</small>
      <h2>Calendário de ${MESES_NOME[cal.mes - 1]} de ${cal.ano}</h2>
      <p>O que entra, o que sai e o que vence — com um clique para transformar a conta prevista em lançamento.${cal.demo ? ' <b>Dados de demonstração.</b>' : ''}</p>
    </div>

    ${cal.erro ? `<div class="lanc-falha"><div>${svg('alerta')}<span><b>Não consegui carregar</b><small>${seguro(cal.erro)}</small></span></div><button id="calTentarDeNovo">Tentar de novo</button></div>` : ''}

    <div class="cal-barra">
      <button id="calMesAnterior" title="Mês anterior">◀</button>
      <b>${MESES_NOME[cal.mes - 1]} ${cal.ano}</b>
      <button id="calMesSeguinte" title="Mês seguinte">▶</button>
      <button class="cal-hoje" id="calHoje">Hoje</button>
      <button class="cal-nova" id="calNovaPrevista">${svg('mais', 'ico-s')}Nova conta prevista</button>
    </div>

    <div class="cal-resumo">
      <div class="receber"><span>A receber no mês</span><strong>${reais(r.a_receber_cents || 0)}</strong></div>
      <div class="pagar"><span>A pagar no mês</span><strong>${reais(r.a_pagar_cents || 0)}</strong></div>
      <div class="pago"><span>Já baixado</span><strong>${reais(r.pago_cents || 0)}</strong></div>
      <div><span>Entradas lançadas</span><strong>${reais(r.entradas_cents || 0)}</strong></div>
      <div><span>Saídas lançadas</span><strong>${reais(r.saidas_cents || 0)}</strong></div>
    </div>

    ${atrasados.length ? `<div class="cal-atraso">${svg('alerta', 'ico-s')}
      <span><b>${atrasados.length === 1 ? '1 conta venceu e não foi baixada' : `${atrasados.length} contas venceram e não foram baixadas`}</b>
      ${atrasados.slice(0, 3).map(p => `${seguro(p.description)} (${dataBr(p.due_on)})`).join(' · ')}${atrasados.length > 3 ? ' …' : ''}</span></div>` : ''}

    ${cal.carregando ? '<div class="lanc-tabela"><div class="lanc-vazio">Carregando…</div></div>' : desenharGrade()}

    <section class="cal-bloco">
      <div class="met-cabeca">
        <div><h3>⏳ Vencimentos em aberto neste mês</h3><p>Clique em pagar ou receber e o lançamento é criado com a categoria e o fornecedor da previsão.</p></div>
      </div>
      ${desenharEmAberto()}
    </section>

    <section class="cal-bloco">
      <div class="met-cabeca">
        <div><h3>🔁 Contas previstas cadastradas</h3><p>A regra que se repete todo mês, toda semana ou uma vez por ano.</p></div>
        <button class="met-novo" id="calNovaPrevista2">${svg('mais', 'ico-s')}Nova conta prevista</button>
      </div>
      ${desenharAgenda()}
    </section>`;

  ligarEventosCalendario();
}

function desenharGrade() {
  const total = diasDoMes(cal.ano, cal.mes);
  const vazios = semanaDe(dataDoDia(cal.ano, cal.mes, 1));
  const hoje = hojeISO();
  const celulas = [];
  for (let i = 0; i < vazios; i += 1) celulas.push('<div class="cal-dia fora"></div>');
  for (let dia = 1; dia <= total; dia += 1) {
    const iso = dataDoDia(cal.ano, cal.mes, dia);
    const { previstas, lancamentos, faturas, metas } = itensDoDia(iso);
    const marcas = [
      ...previstas.map(p => `<span class="cal-marca ${p.kind === 'receivable' ? 'receber' : 'pagar'} ${p.pago ? 'baixada' : atrasada(p) ? 'atrasada' : ''}">
        ${p.pago ? '✓' : p.kind === 'receivable' ? '↓' : '↑'} ${seguro(p.description)}<em>${reais(p.amount_cents)}</em></span>`),
      ...faturas.map(f => `<span class="cal-marca fatura">💳 ${seguro(f.name)}<em>${reais(f.invoice_cents)}</em></span>`),
      ...metas.map(m => `<span class="cal-marca meta">${seguro(m.emoji || '🎯')} ${seguro(m.title)}</span>`),
      ...(lancamentos.length ? [`<span class="cal-marca lancado">${lancamentos.length} ${lancamentos.length === 1 ? 'lançamento' : 'lançamentos'}</span>`] : [])
    ];
    celulas.push(`
      <div class="cal-dia ${iso === hoje ? 'hoje' : ''} ${marcas.length ? 'cheio' : ''}" data-dia="${iso}" role="button" tabindex="0"
        aria-label="${dia} de ${MESES_NOME[cal.mes - 1]}, ${marcas.length} ${marcas.length === 1 ? 'item' : 'itens'}">
        <b>${dia}</b>
        <div class="cal-marcas">${marcas.slice(0, 3).join('')}${marcas.length > 3 ? `<span class="cal-mais">+${marcas.length - 3}</span>` : ''}</div>
      </div>`);
  }
  const sobra = (7 - (celulas.length % 7)) % 7;
  for (let i = 0; i < sobra; i += 1) celulas.push('<div class="cal-dia fora"></div>');
  return `<div class="cal-grade">
    ${DIAS_SEMANA.map(nome => `<div class="cal-cabeca">${nome}</div>`).join('')}
    ${celulas.join('')}
  </div>`;
}

function desenharEmAberto() {
  const abertos = emAberto();
  if (!abertos.length) {
    return `<div class="lanc-vazio"><b>Nada em aberto neste mês</b>${cal.previstas.length ? 'Tudo o que vencia já foi baixado. 🎉' : 'Cadastre as contas que se repetem — aluguel, escola, internet — e elas aparecem aqui todo mês.'}</div>`;
  }
  return `<div class="cal-lista">${abertos.map(p => `
    <div class="cal-item ${atrasada(p) ? 'atrasada' : ''}">
      <span class="cal-quando"><b>${dataBr(p.due_on).slice(0, 5)}</b><small>${DIAS_SEMANA[semanaDe(p.due_on)]}</small></span>
      <span class="cal-quem">
        <b>${seguro(p.description)}</b>
        <small>${p.supplier ? `${seguro(p.supplier)} · ` : ''}${p.conta_nome ? seguro(p.conta_nome) : 'sem conta definida'}${atrasada(p) ? ' · <i>vencida</i>' : ''}</small>
      </span>
      <span class="cal-cat">${typeof chipCategoria === 'function' ? chipCategoria(p.category) : seguro(p.category || '')}</span>
      <span class="cal-valor ${p.kind === 'receivable' ? 'receber' : 'pagar'}">${p.kind === 'receivable' ? '+' : '−'} ${reais(p.amount_cents).replace('R$', '').trim()}</span>
      <button class="cal-baixar" data-pagar="${seguro(p.id)}" data-vencimento="${p.due_on}">${p.kind === 'receivable' ? 'Recebi' : 'Paguei'}</button>
    </div>`).join('')}</div>`;
}

function textoDaRepeticao(regra) {
  if (regra.recurrence === 'once') return `uma vez, em ${dataBr(regra.first_due_on)}`;
  if (regra.recurrence === 'weekly') return TODA_SEMANA[Number(regra.weekday ?? semanaDe(regra.first_due_on))];
  if (regra.recurrence === 'yearly') return `todo ano, em ${String(regra.day_of_month).padStart(2, '0')}/${String(regra.month_of_year).padStart(2, '0')}`;
  return `todo dia ${regra.day_of_month}`;
}

function desenharAgenda() {
  if (!cal.agenda.length) {
    return `<div class="lanc-vazio"><b>Nenhuma conta prevista</b>Comece pelas fixas: aluguel, escola, internet, plano de saúde, e o salário do lado de quem recebe.</div>`;
  }
  return `<div class="cal-lista agenda">${cal.agenda.map(regra => `
    <div class="cal-item">
      <span class="cal-tipo ${regra.kind === 'receivable' ? 'receber' : 'pagar'}">${regra.kind === 'receivable' ? 'A receber' : 'A pagar'}</span>
      <span class="cal-quem">
        <b>${seguro(regra.description)}</b>
        <small>${textoDaRepeticao(regra)}${regra.conta_nome ? ` · ${seguro(regra.conta_nome)}` : ''}${regra.ends_on ? ` · até ${dataBr(regra.ends_on)}` : ''}</small>
      </span>
      <span class="cal-cat">${typeof chipCategoria === 'function' ? chipCategoria(regra.category) : seguro(regra.category || '')}</span>
      <span class="cal-valor ${regra.kind === 'receivable' ? 'receber' : 'pagar'}">${reais(regra.amount_cents)}</span>
      <span class="lanc-acoes">
        <button data-editar-prevista="${seguro(regra.id)}" title="Alterar">${svg('lapis', 'ico-s')}</button>
        <button class="remover" data-apagar-prevista="${seguro(regra.id)}" title="Apagar">${svg('lixeira', 'ico-s')}</button>
      </span>
    </div>`).join('')}</div>`;
}

/* ---------- o dia por dentro ---------- */

function abrirDia(iso) {
  const { previstas, lancamentos, faturas, metas } = itensDoDia(iso);
  const nada = !previstas.length && !lancamentos.length && !faturas.length && !metas.length;
  const fundo = abrirCaixa(`
    <div><h3>${Number(iso.slice(8, 10))} de ${MESES_NOME[Number(iso.slice(5, 7)) - 1].toLowerCase()}</h3>
      <p class="sub">${DIAS_SEMANA_LONGO[semanaDe(iso)]}${iso === hojeISO() ? ' · hoje' : ''}</p></div>
    <div class="cal-dia-detalhe">
      ${nada ? '<div class="lanc-vazio">Nada marcado neste dia.</div>' : ''}
      ${previstas.length ? `<div class="cal-grupo"><small>CONTAS PREVISTAS</small>${previstas.map(p => `
        <div class="cal-det ${p.pago ? 'baixada' : atrasada(p) ? 'atrasada' : ''}">
          <span><b>${seguro(p.description)}</b><small>${p.kind === 'receivable' ? 'a receber' : 'a pagar'}${p.conta_nome ? ` · ${seguro(p.conta_nome)}` : ''}${p.pago ? ' · já baixada' : atrasada(p) ? ' · vencida' : ''}</small></span>
          <em class="${p.kind === 'receivable' ? 'receber' : 'pagar'}">${reais(p.amount_cents)}</em>
          ${p.pago
            ? `<button data-desfazer="${seguro(p.id)}" data-vencimento="${p.due_on}">Desfazer</button>`
            : `<button class="principal" data-pagar="${seguro(p.id)}" data-vencimento="${p.due_on}">${p.kind === 'receivable' ? 'Recebi' : 'Paguei'}</button>`}
        </div>`).join('')}</div>` : ''}
      ${faturas.length ? `<div class="cal-grupo"><small>FATURA DE CARTÃO</small>${faturas.map(f => `
        <div class="cal-det"><span><b>💳 ${seguro(f.name)} ••${seguro(f.last_four)}</b><small>vence hoje</small></span><em class="pagar">${reais(f.invoice_cents)}</em></div>`).join('')}</div>` : ''}
      ${metas.length ? `<div class="cal-grupo"><small>PRAZO DE META</small>${metas.map(m => `
        <div class="cal-det"><span><b>${seguro(m.emoji || '🎯')} ${seguro(m.title)}</b><small>${reais(m.current_cents)} de ${reais(m.target_cents)}</small></span></div>`).join('')}</div>` : ''}
      ${lancamentos.length ? `<div class="cal-grupo"><small>LANÇAMENTOS DO DIA</small>${lancamentos.map(l => `
        <div class="cal-det"><span><b>${seguro(l.description)}</b><small>${seguro(l.conta_nome || '')}${l.category ? ` · ${seguro(l.category)}` : ''}</small></span>
          <em class="${l.type === 'income' ? 'receber' : 'pagar'}">${l.type === 'income' ? '+' : '−'} ${reais(l.amount_cents).replace('R$', '').trim()}</em></div>`).join('')}</div>` : ''}
    </div>
    <div class="pe"><button data-fechar="1">Fechar</button></div>`, 'media');
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  fundo.querySelectorAll('[data-pagar]').forEach(b => b.addEventListener('click', () => confirmarBaixa(b.dataset.pagar, b.dataset.vencimento)));
  fundo.querySelectorAll('[data-desfazer]').forEach(b => b.addEventListener('click', () => desfazerBaixa(b.dataset.desfazer, b.dataset.vencimento)));
}

/* ---------- pagar e desfazer ---------- */

function confirmarBaixa(id, vencimento) {
  const previsao = cal.previstas.find(p => p.id === id && p.due_on === vencimento)
    || cal.agenda.find(p => p.id === id);
  if (!previsao) return;
  const receber = previsao.kind === 'receivable';
  const contas = lanc.contas || [];
  const fundo = abrirCaixa(`
    <div><h3>${receber ? 'Recebi' : 'Paguei'}: ${seguro(previsao.description)}</h3>
      <p class="sub">Vencimento em ${dataBr(vencimento)}. Vou criar o lançamento com a categoria e o fornecedor da previsão.</p></div>
    <div class="campos">
      <label>Valor de verdade (R$)<input id="calValor" type="number" step="0.01" min="0.01" value="${(Number(previsao.amount_cents) / 100).toFixed(2)}"></label>
      <label>${receber ? 'Data em que recebeu' : 'Data em que pagou'}<input id="calQuando" type="date" value="${vencimento}"></label>
      <label class="largo">${receber ? 'Conta que recebeu' : 'Conta de onde saiu'}<select id="calConta">
        ${contas.map(conta => `<option value="${seguro(conta.id)}" ${conta.id === previsao.account_id ? 'selected' : ''}>${seguro(conta.name)}</option>`).join('')}
      </select></label>
    </div>
    <p class="lanc-erro" id="calErro"></p>
    <div class="pe"><button data-fechar="1">Cancelar</button><button class="principal" id="calConfirmar">${receber ? 'Confirmar recebimento' : 'Confirmar pagamento'}</button></div>`);
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  const botao = fundo.querySelector('#calConfirmar');
  botao.addEventListener('click', async () => {
    const erro = fundo.querySelector('#calErro');
    erro.textContent = '';
    const valor = Math.round(Number(String(fundo.querySelector('#calValor').value).replace(',', '.')) * 100);
    const conta = fundo.querySelector('#calConta').value;
    if (!(valor > 0)) { erro.textContent = 'Informe o valor.'; return; }
    if (!conta) { erro.textContent = 'Cadastre uma conta antes de baixar a previsão.'; return; }
    botao.disabled = true;
    try {
      if (cal.demo) { notify('🟡 No modo demonstração nada é gravado'); fecharCaixa(); return; }
      await request(`/scheduled-bills/${id}/pay`, { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ dueOn: vencimento, amountCents: valor, accountId: conta, occurredOn: fundo.querySelector('#calQuando').value || vencimento }) });
      fecharCaixa();
      notify(receber ? '🟢 Recebimento lançado' : '🟢 Pagamento lançado');
      await carregarCalendario();
      if (typeof carregarLancamentos === 'function' && document.body.classList.contains('tela-lancamentos')) carregarLancamentos();
    } catch (falha) {
      botao.disabled = false;
      erro.textContent = falha.message;
    }
  });
}

function desfazerBaixa(id, vencimento) {
  const fundo = abrirCaixa(`
    <div class="aviso"><i>!</i><div><h3>Desfazer a baixa de ${dataBr(vencimento)}?</h3>
      <p class="sub">O lançamento criado é apagado, o saldo da conta volta ao que era e o vencimento fica em aberto de novo.</p></div></div>
    <p class="lanc-erro" id="calErroDesfazer"></p>
    <div class="pe"><button data-fechar="1">Cancelar</button><button class="perigo" id="calConfirmarDesfazer">${svg('lixeira', 'ico-s')}Desfazer</button></div>`);
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  const botao = fundo.querySelector('#calConfirmarDesfazer');
  botao.addEventListener('click', async () => {
    botao.disabled = true;
    try {
      if (cal.demo) { notify('🟡 No modo demonstração nada é gravado'); fecharCaixa(); return; }
      await request(`/scheduled-bills/${id}/pay?dueOn=${vencimento}`, { method: 'DELETE', headers: authHeaders() });
      fecharCaixa();
      notify('🟢 Baixa desfeita');
      await carregarCalendario();
    } catch (falha) {
      botao.disabled = false;
      fundo.querySelector('#calErroDesfazer').textContent = falha.message;
    }
  });
}

/* ---------- cadastro da conta prevista ---------- */

function formPrevista(regra) {
  const contas = lanc.contas || [];
  const hoje = hojeISO();
  const repeticao = regra?.recurrence || 'monthly';
  const fundo = abrirCaixa(`
    <div><h3>${regra ? 'Alterar conta prevista' : 'Nova conta prevista'}</h3>
      <p class="sub">A regra que se repete. Todo mês ela aparece no calendário e você baixa com um clique.</p></div>
    <div class="campos">
      <label>Tipo<select id="calTipo">
        <option value="payable" ${regra?.kind === 'receivable' ? '' : 'selected'}>A pagar</option>
        <option value="receivable" ${regra?.kind === 'receivable' ? 'selected' : ''}>A receber</option>
      </select></label>
      <label>Valor (R$)<input id="calCampoValor" type="number" step="0.01" min="0.01" value="${regra ? (Number(regra.amount_cents) / 100).toFixed(2) : ''}" placeholder="2500,00"></label>
      <label class="largo">Descrição<input id="calDescricao" maxlength="160" value="${seguro(regra?.description || '')}" placeholder="Ex.: Aluguel"></label>
      <label>Categoria<select id="calCategoria">${typeof opcoesDeCategoria === 'function' ? opcoesDeCategoria(regra?.category) : ''}</select></label>
      <label>Fornecedor ou cliente<input id="calFornecedor" maxlength="120" value="${seguro(regra?.supplier || '')}" placeholder="Ex.: Imobiliária Central"></label>
      <label class="largo">Conta${contas.length ? '' : ' (cadastre uma conta primeiro)'}<select id="calCampoConta">
        <option value="">Escolher na hora de pagar</option>
        ${contas.map(conta => `<option value="${seguro(conta.id)}" ${conta.id === regra?.account_id ? 'selected' : ''}>${seguro(conta.name)}</option>`).join('')}
      </select></label>
      <label>Repete<select id="calRepeticao">
        <option value="monthly" ${repeticao === 'monthly' ? 'selected' : ''}>Todo mês</option>
        <option value="weekly" ${repeticao === 'weekly' ? 'selected' : ''}>Toda semana</option>
        <option value="yearly" ${repeticao === 'yearly' ? 'selected' : ''}>Uma vez por ano</option>
        <option value="once" ${repeticao === 'once' ? 'selected' : ''}>Só uma vez</option>
      </select></label>
      <label>Primeiro vencimento<input id="calPrimeiro" type="date" value="${seguro(regra?.first_due_on || hoje)}"></label>
      <label id="calCaixaDia">Dia do mês<input id="calDia" type="number" min="1" max="31" value="${regra?.day_of_month || Number((regra?.first_due_on || hoje).slice(8, 10))}"></label>
      <label id="calCaixaSemana">Dia da semana<select id="calSemana">
        ${DIAS_SEMANA_LONGO.map((nome, i) => `<option value="${i}" ${Number(regra?.weekday ?? semanaDe(regra?.first_due_on || hoje)) === i ? 'selected' : ''}>${nome}</option>`).join('')}
      </select></label>
      <label id="calCaixaMes">Mês<select id="calMesAno">
        ${MESES_NOME.map((nome, i) => `<option value="${i + 1}" ${Number(regra?.month_of_year || Number((regra?.first_due_on || hoje).slice(5, 7))) === i + 1 ? 'selected' : ''}>${nome}</option>`).join('')}
      </select></label>
      <label class="largo">Até quando (opcional)<input id="calAte" type="date" value="${seguro(regra?.ends_on || '')}"></label>
    </div>
    <p class="lanc-erro" id="calErroForm"></p>
    <div class="pe"><button data-fechar="1">Cancelar</button><button class="principal" id="calSalvar">Salvar</button></div>`, 'media');

  const ajustarCampos = () => {
    const escolha = fundo.querySelector('#calRepeticao').value;
    fundo.querySelector('#calCaixaDia').hidden = escolha === 'weekly' || escolha === 'once';
    fundo.querySelector('#calCaixaSemana').hidden = escolha !== 'weekly';
    fundo.querySelector('#calCaixaMes').hidden = escolha !== 'yearly';
  };
  fundo.querySelector('#calRepeticao').addEventListener('change', ajustarCampos);
  ajustarCampos();
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);

  const botao = fundo.querySelector('#calSalvar');
  botao.addEventListener('click', async () => {
    const erro = fundo.querySelector('#calErroForm');
    erro.textContent = '';
    const descricao = fundo.querySelector('#calDescricao').value.trim();
    const valor = Math.round(Number(String(fundo.querySelector('#calCampoValor').value).replace(',', '.')) * 100);
    const repete = fundo.querySelector('#calRepeticao').value;
    const primeiro = fundo.querySelector('#calPrimeiro').value;
    if (descricao.length < 2) { erro.textContent = 'Dê um nome à conta (ex.: Aluguel).'; return; }
    if (!(valor > 0)) { erro.textContent = 'Informe o valor previsto.'; return; }
    if (!primeiro) { erro.textContent = 'Informe o primeiro vencimento.'; return; }
    const dados = {
      kind: fundo.querySelector('#calTipo').value,
      description: descricao,
      amountCents: valor,
      category: fundo.querySelector('#calCategoria').value || null,
      supplier: fundo.querySelector('#calFornecedor').value.trim() || null,
      accountId: fundo.querySelector('#calCampoConta').value || null,
      recurrence: repete,
      firstDueOn: primeiro,
      endsOn: fundo.querySelector('#calAte').value || null,
      dayOfMonth: repete === 'monthly' || repete === 'yearly' ? Number(fundo.querySelector('#calDia').value) : null,
      weekday: repete === 'weekly' ? Number(fundo.querySelector('#calSemana').value) : null,
      monthOfYear: repete === 'yearly' ? Number(fundo.querySelector('#calMesAno').value) : null
    };
    botao.disabled = true;
    try {
      if (cal.demo) { notify('🟡 No modo demonstração nada é gravado'); fecharCaixa(); return; }
      await request(regra ? `/scheduled-bills/${regra.id}` : '/scheduled-bills',
        { method: regra ? 'PATCH' : 'POST', headers: authHeaders(), body: JSON.stringify(dados) });
      fecharCaixa();
      notify(regra ? '🟢 Conta prevista alterada' : '🟢 Conta prevista cadastrada');
      await carregarCalendario();
    } catch (falha) {
      botao.disabled = false;
      erro.textContent = falha.message;
    }
  });
}

function apagarPrevista(regra) {
  const fundo = abrirCaixa(`
    <div class="aviso"><i>!</i><div><h3>Apagar “${seguro(regra.description)}”?</h3>
      <p class="sub">Se essa conta já teve pagamentos baixados, ela sai da agenda mas os lançamentos ficam no histórico.</p></div></div>
    <p class="lanc-erro" id="calErroApagar"></p>
    <div class="pe"><button data-fechar="1">Cancelar</button><button class="perigo" id="calConfirmarApagar">${svg('lixeira', 'ico-s')}Apagar</button></div>`);
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  const botao = fundo.querySelector('#calConfirmarApagar');
  botao.addEventListener('click', async () => {
    botao.disabled = true;
    try {
      if (cal.demo) { notify('🟡 No modo demonstração nada é apagado'); fecharCaixa(); return; }
      const resposta = await request(`/scheduled-bills/${regra.id}`, { method: 'DELETE', headers: authHeaders() });
      fecharCaixa();
      notify(resposta.desativada ? '🟢 Conta tirada da agenda (o histórico ficou)' : '🟢 Conta prevista apagada');
      await carregarCalendario();
    } catch (falha) {
      botao.disabled = false;
      fundo.querySelector('#calErroApagar').textContent = falha.message;
    }
  });
}

/* ---------- eventos ---------- */

function ligarEventosCalendario() {
  const tela = document.querySelector('#telaCalendario');
  const regraDe = id => cal.agenda.find(r => r.id === id);

  tela.querySelector('#calTentarDeNovo')?.addEventListener('click', carregarCalendario);
  tela.querySelector('#calNovaPrevista').addEventListener('click', () => formPrevista(null));
  tela.querySelector('#calNovaPrevista2')?.addEventListener('click', () => formPrevista(null));
  tela.querySelector('#calMesAnterior').addEventListener('click', () => {
    cal.mes -= 1; if (cal.mes < 1) { cal.mes = 12; cal.ano -= 1; }
    carregarCalendario();
  });
  tela.querySelector('#calMesSeguinte').addEventListener('click', () => {
    cal.mes += 1; if (cal.mes > 12) { cal.mes = 1; cal.ano += 1; }
    carregarCalendario();
  });
  tela.querySelector('#calHoje').addEventListener('click', () => {
    const agora = new Date();
    cal.ano = agora.getFullYear(); cal.mes = agora.getMonth() + 1;
    carregarCalendario();
  });

  tela.querySelectorAll('.cal-dia[data-dia]').forEach(celula => {
    celula.addEventListener('click', () => abrirDia(celula.dataset.dia));
    celula.addEventListener('keydown', evento => {
      if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); abrirDia(celula.dataset.dia); }
    });
  });
  tela.querySelectorAll('[data-pagar]').forEach(b => b.addEventListener('click', evento => {
    evento.stopPropagation();
    confirmarBaixa(b.dataset.pagar, b.dataset.vencimento);
  }));
  tela.querySelectorAll('[data-editar-prevista]').forEach(b => b.addEventListener('click', () => formPrevista(regraDe(b.dataset.editarPrevista))));
  tela.querySelectorAll('[data-apagar-prevista]').forEach(b => b.addEventListener('click', () => apagarPrevista(regraDe(b.dataset.apagarPrevista))));
}

/* ---------- entrada na tela ---------- */

function abrirTelaCalendario() {
  document.body.classList.remove('tela-lancamentos', 'tela-cadastros', 'tela-metas', 'tela-ajuda');
  document.body.classList.add('tela-calendario');
  document.querySelectorAll('.sidebar nav button').forEach(botao =>
    botao.classList.toggle('active', botao.dataset.tela === 'calendario'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  carregarCalendario();
}
function fecharTelaCalendario() { document.body.classList.remove('tela-calendario'); }
window.abrirTelaCalendario = abrirTelaCalendario;

document.querySelector('[data-tela="calendario"]')?.addEventListener('click', abrirTelaCalendario);
document.querySelectorAll('.sidebar nav button:not([data-tela="calendario"])').forEach(botao =>
  botao.addEventListener('click', fecharTelaCalendario));

/* Empréstimos do GFP — consignado, pessoal, CDC, financiamento.

   A matemática é a de v2-emprestimos-calculo.js (Tabela Price, testada):
   o cadastro gera o cronograma aqui na tela e a API confere antes de gravar.

   Pagar uma parcela segue a regra "vincular ou criar": o sistema procura nos
   lançamentos um débito do mesmo valor perto do vencimento — em geral o que
   veio no extrato importado — e oferece ligar a parcela a ele. Não havendo,
   cria a despesa na conta. Assim o pagamento nunca entra duas vezes. */

const emp = { contratos: [], contas: [], detalhe: null, carregando: false, erro: '', demo: false };

const TIPOS_EMPRESTIMO = {
  consignado: 'Consignado', pessoal: 'Pessoal', cdc: 'CDC', financiamento: 'Financiamento',
  cheque_especial: 'Cheque especial', outro: 'Outro'
};
const hojeIso = () => new Date().toLocaleDateString('sv-SE');
const taxaTexto = taxa => `${(Number(taxa) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% a.m.`;
const taxaAnual = taxa => `${((Math.pow(1 + Number(taxa), 12) - 1) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% a.a.`;
const podeMexer = () => !['dependent', 'viewer'].includes(window.currentProfileRole);
const erroAmigavel = falha => (typeof mensagemAmigavel === 'function' ? mensagemAmigavel(falha.message) : falha.message);

/* O que a parcela paga custou de verdade — a mesma conta de custoDaParcela
   em api/src/emprestimos.js: desconto de antecipação sai dos juros e vira
   economia; valor pago a mais (multa) entra como juro. */
function custoDaParcelaPaga(p) {
  if (!p.paid_on) return { pago_cents: 0, juros_pagos_cents: 0, economia_cents: 0 };
  const valor = Number(p.amount_cents), pago = Number(p.paid_cents ?? p.amount_cents), juros = Number(p.interest_cents || 0);
  return { pago_cents: pago, juros_pagos_cents: Math.min(Math.max(juros + (pago - valor), 0), pago), economia_cents: Math.max(valor - pago, 0) };
}

/* O mesmo resumo que a API calcula (api/src/emprestimos.js → resumir). */
function resumirLocal(contrato) {
  const parcelas = contrato.parcelas || [];
  const pagas = parcelas.filter(p => p.paid_on);
  const abertas = parcelas.filter(p => !p.paid_on).sort((a, b) => a.due_on.localeCompare(b.due_on));
  const soma = (lista, f) => lista.reduce((s, p) => s + Number(f(p) || 0), 0);
  const total = soma(parcelas, p => p.amount_cents);
  return {
    principal_cents: contrato.principal_cents, total_contratado_cents: total,
    juros_total_cents: Math.max(total - contrato.principal_cents, 0),
    juros_pagos_cents: soma(pagas, p => custoDaParcelaPaga(p).juros_pagos_cents),
    juros_a_pagar_cents: soma(abertas, p => p.interest_cents),
    pago_cents: soma(pagas, p => custoDaParcelaPaga(p).pago_cents),
    economia_cents: soma(pagas, p => custoDaParcelaPaga(p).economia_cents),
    parcelas_pagas: pagas.length, parcelas_a_pagar: abertas.length, parcelas_total: parcelas.length,
    saldo_devedor_cents: soma(abertas, p => p.amount_cents),
    parcelas_atrasadas: abertas.filter(p => p.due_on < hojeIso()).length,
    proxima_parcela: abertas[0] ? { number: abertas[0].number, due_on: abertas[0].due_on, amount_cents: abertas[0].amount_cents } : null
  };
}

// Contratos gravados antes destes campos existirem na resposta da API.
const parcelasAPagar = r => r.parcelas_a_pagar ?? (r.parcelas_total - r.parcelas_pagas);
const jurosAPagar = r => r.juros_a_pagar_cents ?? Math.max(r.juros_total_cents - r.juros_pagos_cents, 0);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/* ---------- dados ---------- */

// Cronograma no formato da API, a partir do cálculo da tela.
function cronogramaDaApi(gerado) {
  return gerado.parcelas.map(p => ({
    id: `p${p.numero}`, number: p.numero, due_on: p.vence_em, amount_cents: p.valor_cents,
    interest_cents: p.juros_cents, amortization_cents: p.amortizacao_cents, balance_after_cents: p.saldo_depois_cents,
    paid_on: null, paid_cents: null, payment_mode: null, transaction_id: null
  }));
}

function emprestimosDemonstracao() {
  const hoje = new Date();
  // A próxima parcela em aberto vence daqui a 5 dias, para a demonstração mostrar o aviso.
  const mesesAtras = m => new Date(hoje.getFullYear(), hoje.getMonth() - m, hoje.getDate() + 5).toLocaleDateString('sv-SE');
  const montar = (id, dados, pagas) => {
    const gerado = GFPEmprestimos.gerarParcelas({ principalCents: dados.principal_cents, parcelas: dados.installments_count, taxaMensal: dados.monthly_rate, primeiraEm: dados.first_due_on });
    const parcelas = cronogramaDaApi(gerado).map((p, i) => (i < pagas
      ? { ...p, paid_on: p.due_on, paid_cents: i === pagas - 1 && dados.desconto_cents ? p.amount_cents - dados.desconto_cents : p.amount_cents,
          payment_mode: i === pagas - 1 ? 'linked' : 'created' } : p));
    delete dados.desconto_cents;
    const contrato = { id, status: 'active', category: 'Empréstimos', installment_cents: gerado.parcelaCents, conta_nome: 'Conta corrente', account_id: 'demo-conta', notes: null, ...dados, parcelas };
    return { ...contrato, resumo: resumirLocal(contrato) };
  };
  emp.contas = [{ id: 'demo-conta', name: 'Conta corrente' }];
  emp.contratos = [
    montar('demo-l1', { name: 'Consignado Caixa', lender: 'Caixa', kind: 'consignado', principal_cents: 2500000, installments_count: 48, monthly_rate: 0.0172, first_due_on: mesesAtras(14), desconto_cents: 9800 }, 14),
    montar('demo-l2', { name: 'Pessoal Nubank', lender: 'Nubank', kind: 'pessoal', principal_cents: 600000, installments_count: 12, monthly_rate: 0.0349, first_due_on: mesesAtras(3) }, 3)
  ];
}

async function carregarEmprestimos() {
  emp.carregando = true; emp.erro = '';
  desenharEmprestimos();
  try {
    if (window.demoMode || !sessionStorage.getItem('gfp_token')) {
      emp.demo = true;
      if (!emp.contratos.length || !String(emp.contratos[0].id).startsWith('demo')) emprestimosDemonstracao();
    } else {
      emp.demo = false;
      const escopo = window.currentProfileRole === 'admin' ? '?scope=family' : '';
      const [contratos, contas] = await Promise.all([
        request('/loans', { headers: authHeaders(), cache: 'no-store' }),
        request(`/accounts${escopo}`, { headers: authHeaders(), cache: 'no-store' })
      ]);
      emp.contratos = contratos || [];
      emp.contas = contas || [];
      if (emp.detalhe) await abrirContrato(emp.detalhe.id, false);
    }
  } catch (falha) {
    emp.erro = erroAmigavel(falha);
  }
  emp.carregando = false;
  desenharEmprestimos();
}

async function abrirContrato(id, redesenhar = true) {
  if (emp.demo) {
    emp.detalhe = emp.contratos.find(c => c.id === id) || null;
  } else {
    try {
      emp.detalhe = await request(`/loans/${id}`, { headers: authHeaders(), cache: 'no-store' });
    } catch (falha) {
      notify(`🔴 ${erroAmigavel(falha)}`);
      emp.detalhe = null;
    }
  }
  if (redesenhar) { desenharEmprestimos(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
}

/* ---------- desenho ---------- */

function situacaoDaParcela(p) {
  if (p.paid_on) {
    const como = { linked: 'ligada ao extrato', created: 'lançada na conta', marked: 'marcada como paga' }[p.payment_mode] || '';
    return { classe: 'paga', texto: `Paga em ${dataBr(p.paid_on)}`, detalhe: como };
  }
  const dias = Math.round((Date.parse(p.due_on) - Date.parse(hojeIso())) / 864e5);
  if (dias < 0) return { classe: 'atrasada', texto: `Atrasada ${-dias} dia${dias === -1 ? '' : 's'}`, detalhe: '' };
  if (dias <= 5) return { classe: 'breve', texto: dias === 0 ? 'Vence hoje' : `Vence em ${dias} dia${dias === 1 ? '' : 's'}`, detalhe: '' };
  return { classe: 'aberta', texto: 'Em aberto', detalhe: '' };
}

function desenharEmprestimos() {
  const alvo = document.querySelector('#telaEmprestimos');
  if (!alvo) return;
  alvo.innerHTML = emp.detalhe ? desenharDetalhe(emp.detalhe) : desenharLista();
  ligarEventosEmprestimos();
}

function desenharLista() {
  const ativos = emp.contratos.filter(c => c.status === 'active');
  // O que já aconteceu soma todos os contratos, inclusive os quitados; o que
  // ainda vem pela frente, só os ativos.
  const validos = emp.contratos.filter(c => c.status !== 'cancelled');
  const soma = (lista, f) => lista.reduce((s, c) => s + Number(f(c) || 0), 0);
  const devedor = soma(ativos, c => c.resumo.saldo_devedor_cents);
  const limite = new Date(Date.now() + 30 * 864e5).toLocaleDateString('sv-SE');
  const proximas = ativos.filter(c => c.resumo.proxima_parcela && c.resumo.proxima_parcela.due_on <= limite);
  const pagas = soma(validos, c => c.resumo.parcelas_pagas);
  const aPagar = soma(ativos, c => parcelasAPagar(c.resumo));

  return `
    <div class="lanc-head">
      <small>SUAS DÍVIDAS</small>
      <h2>Empréstimos e financiamentos</h2>
      <p>Cada contrato com o cronograma completo: quantas parcelas já foram e quantas faltam, quanto de juros você já pagou e quanto economizou antecipando.${emp.demo ? ' <b>Dados de demonstração.</b>' : ''}</p>
    </div>
    ${emp.erro ? `<div class="lanc-falha"><div>${svg('alerta')}<span><b>Não consegui carregar</b><small>${seguro(emp.erro)}</small></span></div><button id="empTentarDeNovo">Tentar de novo</button></div>` : ''}
    <div class="met-resumo cinco">
      <div><span>Saldo devedor</span><strong>${reais(devedor)}</strong><small>${plural(ativos.length, 'contrato ativo', 'contratos ativos')}</small></div>
      <div><span>Parcelas já pagas</span><strong>${pagas}</strong><small>${reais(soma(validos, c => c.resumo.pago_cents))} pagos até hoje</small></div>
      <div><span>Parcelas que faltam pagar</span><strong>${aPagar}</strong><small>${reais(proximas.reduce((s, c) => s + c.resumo.proxima_parcela.amount_cents, 0))} vencem nos próximos 30 dias</small></div>
      <div><span>Juros já pagos</span><strong>${reais(soma(validos, c => c.resumo.juros_pagos_cents))}</strong><small>${reais(soma(ativos, c => jurosAPagar(c.resumo)))} de juros ainda a pagar</small></div>
      <div><span>Economia pagando adiantado</span><strong>${reais(soma(validos, c => c.resumo.economia_cents))}</strong><small>desconto das antecipações</small></div>
    </div>
    <section class="met-bloco">
      <div class="met-cabeca">
        <div><h3>🏦 Contratos</h3><p>Clique em um contrato para ver as parcelas e dar baixa.</p></div>
        ${podeMexer() ? `<button class="met-novo" id="empNovo">${svg('mais', 'ico-s')}Novo empréstimo</button>` : ''}
      </div>
      ${emp.carregando ? '<div class="lanc-vazio">Carregando…</div>' : desenharCartoes()}
    </section>
    ${emp.carregando || !emp.contratos.length ? '' : desenharListagem()}`;
}

/* Um contrato por linha: a parcela da vez, o que já foi pago, os juros e a
   economia. É a mesma informação dos cartões, lado a lado para comparar. */
function desenharListagem() {
  const validos = emp.contratos.filter(c => c.status !== 'cancelled');
  const soma = f => validos.reduce((s, c) => s + Number(f(c) || 0), 0);
  return `
    <section class="met-bloco">
      <div class="met-cabeca"><div><h3>📋 Listagem dos contratos</h3>
        <p>O vencimento e o valor são os da próxima parcela em aberto; pago, juros e economizado somam as parcelas já pagas.</p></div></div>
      <div class="emp-tabela-rolo"><table class="emp-tabela emp-listagem">
        <thead><tr><th>Contrato</th><th>Data de vencimento</th><th>Parcela / total</th><th class="num">Valor da parcela</th>
          <th class="num">Valor pago</th><th class="num">Valor de juros</th><th class="num">Valor economizado</th></tr></thead>
        <tbody>${emp.contratos.map(c => {
          const r = c.resumo, prox = r.proxima_parcela, cancelado = c.status === 'cancelled';
          const situacao = c.status === 'settled' ? 'Quitado' : cancelado ? 'Cancelado' : '';
          return `<tr class="${cancelado ? 'cancelado' : ''}" data-abrir-contrato="${seguro(c.id)}" tabindex="0">
            <td><b>${seguro(c.name)}</b><small>${seguro(TIPOS_EMPRESTIMO[c.kind] || c.kind)}${c.lender ? ` · ${seguro(c.lender)}` : ''}</small></td>
            <td>${prox && !cancelado ? `${dataBr(prox.due_on)}${prox.due_on < hojeIso() ? '<small class="ruim">em atraso</small>' : ''}` : `<span class="emp-selo ${seguro(c.status)}">${situacao || '—'}</span>`}</td>
            <td>${prox && !cancelado ? `${prox.number}/${r.parcelas_total}` : `${r.parcelas_pagas}/${r.parcelas_total}`}<small>${plural(r.parcelas_pagas, 'paga', 'pagas')} · ${cancelado ? 'cancelado' : plural(parcelasAPagar(r), 'falta', 'faltam')}</small></td>
            <td class="num">${prox && !cancelado ? reais(prox.amount_cents) : '—'}</td>
            <td class="num">${reais(r.pago_cents)}</td>
            <td class="num">${reais(r.juros_pagos_cents)}</td>
            <td class="num ${r.economia_cents ? 'bom' : ''}">${reais(r.economia_cents)}</td>
          </tr>`;
        }).join('')}</tbody>
        ${validos.length > 1 ? `<tfoot><tr><td colspan="4">Total${validos.length < emp.contratos.length ? ' (sem os cancelados)' : ''}</td>
          <td class="num">${reais(soma(c => c.resumo.pago_cents))}</td><td class="num">${reais(soma(c => c.resumo.juros_pagos_cents))}</td>
          <td class="num">${reais(soma(c => c.resumo.economia_cents))}</td></tr></tfoot>` : ''}
      </table></div>
    </section>`;
}

function desenharCartoes() {
  if (!emp.contratos.length) {
    return `<div class="lanc-vazio"><b>Nenhum empréstimo cadastrado</b>Use “Novo empréstimo” e informe o valor, as parcelas e a taxa — ou o valor da parcela, que o sistema descobre a taxa.</div>`;
  }
  return `<div class="emp-lista">${emp.contratos.map(c => {
    const r = c.resumo;
    const atrasadas = r.parcelas_atrasadas || 0;
    const encerrado = c.status !== 'active';
    return `
      <article class="emp-contrato ${encerrado ? 'encerrado' : ''}" data-abrir-contrato="${seguro(c.id)}" tabindex="0">
        <div class="emp-topo">
          <div><b>${seguro(c.name)}</b><small>${seguro(TIPOS_EMPRESTIMO[c.kind] || c.kind)}${c.lender ? ` · ${seguro(c.lender)}` : ''} · ${taxaTexto(c.monthly_rate)}</small></div>
          <span class="emp-selo ${c.status}">${c.status === 'settled' ? 'Quitado' : c.status === 'cancelled' ? 'Cancelado' : `${r.parcelas_pagas}/${r.parcelas_total}`}</span>
        </div>
        <div class="met-barra"><i class="${c.status === 'settled' ? 'bom' : ''}" style="width:${r.parcelas_total ? Math.round(r.parcelas_pagas / r.parcelas_total * 100) : 0}%"></i></div>
        <div class="emp-numeros">
          <div><span>Saldo devedor</span><strong>${reais(r.saldo_devedor_cents)}</strong></div>
          <div><span>Próxima parcela</span><strong>${r.proxima_parcela ? `${reais(r.proxima_parcela.amount_cents)} · ${diaMes(r.proxima_parcela.due_on)}` : '—'}</strong></div>
          <div><span>Parcelas pagas</span><strong>${r.parcelas_pagas} de ${r.parcelas_total}</strong></div>
          <div><span>Faltam pagar</span><strong>${encerrado ? '—' : parcelasAPagar(r)}</strong></div>
        </div>
        ${atrasadas ? `<p class="emp-alerta">🔴 ${atrasadas} parcela${atrasadas > 1 ? 's' : ''} em atraso</p>` : ''}
      </article>`;
  }).join('')}</div>`;
}

function desenharDetalhe(c) {
  const r = c.resumo || resumirLocal(c);
  return `
    <div class="lanc-head">
      <button class="emp-voltar" id="empVoltar">← Todos os empréstimos</button>
      <small>${seguro(TIPOS_EMPRESTIMO[c.kind] || c.kind)}${c.lender ? ` · ${seguro(c.lender)}` : ''}</small>
      <h2>${seguro(c.name)}</h2>
      <p>${reais(c.principal_cents)} em ${c.installments_count}x de ${reais(c.installment_cents)} · ${taxaTexto(c.monthly_rate)} (${taxaAnual(c.monthly_rate)})${c.conta_nome ? ` · paga pela conta ${seguro(c.conta_nome)}` : ''}${emp.demo ? ' · <b>demonstração</b>' : ''}</p>
      ${podeMexer() ? `<div class="emp-acoes-contrato">
        <button id="empEditar">${svg('lapis', 'ico-s')}Alterar dados</button>
        ${c.status === 'cancelled' ? '<button id="empReativar">Reativar</button>' : c.status === 'active' ? '<button id="empCancelar">Marcar como cancelado</button>' : ''}
        <button class="remover" id="empApagar">${svg('lixeira', 'ico-s')}Apagar</button>
      </div>` : ''}
    </div>
    <div class="met-resumo">
      <div><span>Parcelas já pagas</span><strong>${r.parcelas_pagas} de ${r.parcelas_total}</strong><small>${reais(r.pago_cents)} pagos até hoje</small></div>
      <div><span>Parcelas que faltam pagar</span><strong>${parcelasAPagar(r)}</strong><small>saldo devedor de ${reais(r.saldo_devedor_cents)}</small></div>
      <div><span>Juros já pagos</span><strong>${reais(r.juros_pagos_cents)}</strong><small>${reais(jurosAPagar(r))} ainda a pagar · ${reais(r.juros_total_cents)} no contrato</small></div>
      <div><span>Economia pagando adiantado</span><strong>${reais(r.economia_cents)}</strong><small>total contratado de ${reais(r.total_contratado_cents)}</small></div>
    </div>
    <section class="met-bloco">
      <div class="met-cabeca"><div><h3>📅 Parcelas</h3><p>${r.parcelas_pagas} de ${r.parcelas_total} pagas, ${plural(parcelasAPagar(r), 'falta', 'faltam')}. Para antecipar, dê baixa informando o valor com desconto que o banco cobrou.</p></div></div>
      <div class="emp-tabela-rolo"><table class="emp-tabela">
        <thead><tr><th>Parcela</th><th>Vencimento</th><th class="num">Valor da parcela</th><th class="num">Valor pago</th><th class="num">Juros</th><th class="num">Economizado</th><th class="num">Amortização</th><th class="num">Saldo depois</th><th>Situação</th><th></th></tr></thead>
        <tbody>${(c.parcelas || []).map(p => {
          const s = situacaoDaParcela(p);
          const custo = custoDaParcelaPaga(p);
          return `<tr class="${s.classe}">
            <td>${p.number}/${r.parcelas_total}</td><td>${dataBr(p.due_on)}</td>
            <td class="num">${reais(p.amount_cents)}</td>
            <td class="num">${p.paid_on ? reais(custo.pago_cents) : '—'}</td>
            <td class="num">${reais(p.paid_on ? custo.juros_pagos_cents : p.interest_cents)}${p.paid_on && custo.juros_pagos_cents !== Number(p.interest_cents) ? `<small>previsto ${reais(p.interest_cents)}</small>` : ''}</td>
            <td class="num ${custo.economia_cents ? 'bom' : ''}">${p.paid_on ? reais(custo.economia_cents) : '—'}</td>
            <td class="num">${reais(p.amortization_cents)}</td><td class="num">${reais(p.balance_after_cents)}</td>
            <td><span class="emp-situacao ${s.classe}">${s.texto}</span>${s.detalhe ? `<small>${s.detalhe}</small>` : ''}</td>
            <td><span class="lanc-acoes">${!podeMexer() || c.status === 'cancelled' ? '' : p.paid_on
              ? `<button data-desfazer="${p.number}" title="Desfazer a baixa">Desfazer</button>`
              : `<button class="emp-pagar" data-pagar="${p.number}">Pagar</button><button data-corrigir="${p.number}" title="Corrigir valor ou data">${svg('lapis', 'ico-s')}</button>`}</span></td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot><tr><td colspan="2">Total</td><td class="num">${reais(r.total_contratado_cents)}</td><td class="num">${reais(r.pago_cents)}</td>
          <td class="num">${reais(r.juros_pagos_cents)}<small>pagos</small></td><td class="num">${reais(r.economia_cents)}</td><td colspan="4"></td></tr></tfoot>
      </table></div>
    </section>`;
}

/* ---------- cadastro ---------- */

function opcoesDeConta(atual) {
  return `<option value="">(escolher na hora de pagar)</option>` +
    emp.contas.map(c => `<option value="${seguro(c.id)}" ${c.id === atual ? 'selected' : ''}>${seguro(c.name)}</option>`).join('');
}

function formContrato() {
  const fundo = abrirCaixa(`
    <div><h3>Novo empréstimo</h3>
      <p class="sub">Informe o valor, as parcelas e a taxa — ou o valor da parcela, que o sistema descobre a taxa. O cronograma é gerado na hora pela Tabela Price, que é como os bancos calculam.</p></div>
    <div class="campos">
      <label class="largo">Nome<input id="empNome" maxlength="80" placeholder="Ex.: Consignado Caixa"></label>
      <label>Banco ou credor<input id="empCredor" maxlength="80" placeholder="Ex.: Caixa"></label>
      <label>Tipo<select id="empTipo">${Object.entries(TIPOS_EMPRESTIMO).map(([k, v]) => `<option value="${k}" ${k === 'pessoal' ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Valor emprestado (R$)<input id="empValor" type="number" min="0.01" step="0.01" placeholder="0,00"></label>
      <label>Número de parcelas<input id="empParcelas" type="number" min="1" max="600" step="1" placeholder="Ex.: 48"></label>
      <label>Eu sei<select id="empSei"><option value="taxa">a taxa de juros</option><option value="parcela">o valor da parcela</option></select></label>
      <label id="empCampoTaxa">Taxa ao mês (%)<input id="empTaxa" type="number" min="0" step="0.01" placeholder="Ex.: 1,72"></label>
      <label id="empCampoParcela" hidden>Valor da parcela (R$)<input id="empParcela" type="number" min="0.01" step="0.01" placeholder="0,00"></label>
      <label>1ª parcela vence em<input id="empPrimeira" type="date" value="${hojeIso()}"></label>
      <label>Conta que paga<select id="empConta">${opcoesDeConta('')}</select></label>
      <label>Parcelas já pagas antes de hoje<input id="empJaPagas" type="number" min="0" step="1" value="0"></label>
      <label class="largo">Observações (opcional)<input id="empNotas" maxlength="400" placeholder="Ex.: contrato 123456, desconto em folha"></label>
    </div>
    <div class="emp-previa" id="empPrevia"><span>Preencha valor, parcelas e taxa (ou parcela) para ver o cronograma.</span></div>
    <p class="lanc-erro" id="empErro"></p>
    <div class="pe"><button data-fechar="1">Cancelar</button><button class="principal" id="empSalvar" disabled>Cadastrar empréstimo</button></div>`, 'emp-caixa');

  const campo = id => fundo.querySelector(`#${id}`);
  let calculo = null;
  // Contrato antigo: sugere como pagas as parcelas que já venceram, até a pessoa mexer no campo.
  let mexeuJaPagas = false;
  campo('empJaPagas').addEventListener('input', () => { mexeuJaPagas = true; });
  const calcular = () => {
    const sabeTaxa = campo('empSei').value === 'taxa';
    campo('empCampoTaxa').hidden = !sabeTaxa;
    campo('empCampoParcela').hidden = sabeTaxa;
    const principal = Math.round(Number(campo('empValor').value) * 100);
    const n = Math.trunc(Number(campo('empParcelas').value));
    const taxa = campo('empTaxa').value === '' ? NaN : Number(campo('empTaxa').value) / 100;
    const parcela = Math.round(Number(campo('empParcela').value) * 100);
    calculo = null;
    if (principal > 0 && n > 0 && n <= 600 && campo('empPrimeira').value && (sabeTaxa ? taxa >= 0 : parcela > 0)) {
      const gerado = GFPEmprestimos.gerarParcelas({ principalCents: principal, parcelas: n, primeiraEm: campo('empPrimeira').value, ...(sabeTaxa ? { taxaMensal: taxa } : { parcelaCents: parcela }) });
      if (!gerado.erro) calculo = { principal, gerado };
    }
    if (calculo && !mexeuJaPagas) campo('empJaPagas').value = calculo.gerado.parcelas.filter(p => p.vence_em < hojeIso()).length;
    const previa = campo('empPrevia');
    campo('empSalvar').disabled = !calculo;
    if (!calculo) { previa.innerHTML = '<span>Preencha valor, parcelas e taxa (ou parcela) para ver o cronograma.</span>'; return; }
    const lista = calculo.gerado.parcelas;
    const total = lista.reduce((s, p) => s + p.valor_cents, 0);
    const linha = p => `<tr><td>${p.numero}</td><td>${dataBr(p.vence_em)}</td><td class="num">${reais(p.valor_cents)}</td><td class="num">${reais(p.juros_cents)}</td><td class="num">${reais(p.saldo_depois_cents)}</td></tr>`;
    const mostrar = lista.length <= 6 ? lista : [...lista.slice(0, 3), null, ...lista.slice(-2)];
    previa.innerHTML = `
      <div class="emp-previa-numeros">
        <div><span>Parcela</span><strong>${reais(calculo.gerado.parcelaCents)}</strong></div>
        <div><span>Taxa</span><strong>${taxaTexto(calculo.gerado.taxaMensal)}</strong><small>${taxaAnual(calculo.gerado.taxaMensal)}</small></div>
        <div><span>Total a pagar</span><strong>${reais(total)}</strong></div>
        <div><span>Juros no contrato</span><strong>${reais(total - calculo.principal)}</strong></div>
      </div>
      <table class="emp-tabela mini"><thead><tr><th>Nº</th><th>Vence</th><th class="num">Parcela</th><th class="num">Juros</th><th class="num">Saldo</th></tr></thead>
        <tbody>${mostrar.map(p => (p ? linha(p) : '<tr class="reticencias"><td colspan="5">…</td></tr>')).join('')}</tbody></table>`;
  };
  fundo.querySelectorAll('input,select').forEach(el => el.addEventListener('input', calcular));
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);

  campo('empSalvar').addEventListener('click', async () => {
    const erro = campo('empErro');
    const nome = campo('empNome').value.trim();
    if (nome.length < 2) return (erro.textContent = 'Dê um nome ao empréstimo.');
    if (!calculo) return (erro.textContent = 'Confira valor, parcelas e taxa.');
    const jaPagas = Math.trunc(Number(campo('empJaPagas').value) || 0);
    if (jaPagas < 0 || jaPagas > calculo.gerado.parcelas.length) return (erro.textContent = 'Parcelas já pagas não pode passar do total.');
    const g = calculo.gerado;
    const corpo = {
      name: nome, lender: campo('empCredor').value.trim(), kind: campo('empTipo').value,
      principalCents: calculo.principal, monthlyRate: g.taxaMensal, installmentCents: g.parcelaCents,
      firstDueOn: campo('empPrimeira').value, accountId: campo('empConta').value || null,
      notes: campo('empNotas').value.trim(), alreadyPaid: jaPagas,
      installments: g.parcelas.map(p => ({ number: p.numero, dueOn: p.vence_em, amountCents: p.valor_cents, interestCents: p.juros_cents, balanceAfterCents: p.saldo_depois_cents }))
    };
    if (emp.demo) {
      const parcelas = cronogramaDaApi(g).map((p, i) => (i < jaPagas ? { ...p, paid_on: p.due_on, paid_cents: p.amount_cents, payment_mode: 'marked' } : p));
      const conta = emp.contas.find(c => c.id === corpo.accountId);
      const novo = { id: `demo-${Date.now()}`, status: 'active', name: nome, lender: corpo.lender, kind: corpo.kind, principal_cents: corpo.principalCents, installments_count: parcelas.length, monthly_rate: g.taxaMensal, installment_cents: g.parcelaCents, first_due_on: corpo.firstDueOn, account_id: corpo.accountId, conta_nome: conta?.name || null, category: 'Empréstimos', parcelas };
      novo.resumo = resumirLocal(novo);
      emp.contratos.unshift(novo);
      fecharCaixa(); notify('🟢 Empréstimo simulado cadastrado');
      return desenharEmprestimos();
    }
    const botao = campo('empSalvar');
    botao.disabled = true; botao.textContent = 'Cadastrando…';
    try {
      const criado = await request('/loans', { method: 'POST', headers: authHeaders(), body: JSON.stringify(corpo) });
      fecharCaixa(); notify('🟢 Empréstimo cadastrado');
      await abrirContrato(criado.id, false);
      await carregarEmprestimos();
    } catch (falha) {
      botao.disabled = false; botao.textContent = 'Cadastrar empréstimo';
      erro.textContent = erroAmigavel(falha);
    }
  });
}

function formDadosDoContrato(c) {
  const fundo = abrirCaixa(`
    <div><h3>Alterar dados do empréstimo</h3><p class="sub">Valor, parcelas e taxa não mudam aqui: para corrigir uma parcela, use o lápis na linha dela.</p></div>
    <div class="campos">
      <label class="largo">Nome<input id="empNome" maxlength="80" value="${seguro(c.name)}"></label>
      <label>Banco ou credor<input id="empCredor" maxlength="80" value="${seguro(c.lender || '')}"></label>
      <label>Tipo<select id="empTipo">${Object.entries(TIPOS_EMPRESTIMO).map(([k, v]) => `<option value="${k}" ${k === c.kind ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Conta que paga<select id="empConta">${opcoesDeConta(c.account_id)}</select></label>
      <label>Categoria dos pagamentos<input id="empCategoria" maxlength="40" value="${seguro(c.category || 'Empréstimos')}"></label>
      <label class="largo">Observações<input id="empNotas" maxlength="400" value="${seguro(c.notes || '')}"></label>
    </div>
    <p class="lanc-erro" id="empErro"></p>
    <div class="pe"><button data-fechar="1">Cancelar</button><button class="principal" id="empSalvar">Salvar</button></div>`);
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  fundo.querySelector('#empSalvar').addEventListener('click', () => {
    const v = id => fundo.querySelector(`#${id}`).value.trim();
    salvarContrato(c, { name: v('empNome'), lender: v('empCredor'), kind: v('empTipo'), accountId: v('empConta') || null, category: v('empCategoria'), notes: v('empNotas') }, fundo.querySelector('#empErro'));
  });
}

async function salvarContrato(c, mudancas, erro) {
  if (emp.demo) {
    Object.assign(c, { ...mudancas, account_id: mudancas.accountId ?? c.account_id });
    if (mudancas.status) c.status = mudancas.status;
    fecharCaixa(); notify('🟢 Alteração simulada');
    return desenharEmprestimos();
  }
  try {
    await request(`/loans/${c.id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(mudancas) });
    fecharCaixa(); notify('🟢 Empréstimo atualizado');
    await carregarEmprestimos();
  } catch (falha) {
    if (erro) erro.textContent = erroAmigavel(falha); else notify(`🔴 ${erroAmigavel(falha)}`);
  }
}

function confirmarApagar(c) {
  const fundo = abrirCaixa(`
    <div class="aviso"><i>!</i><div><h3>Apagar ${seguro(c.name)}?</h3>
      <p class="sub">O contrato e o cronograma somem. Os lançamentos que já existem continuam na conta. Se alguma parcela foi paga por lançamento, desfaça as baixas antes — ou marque o contrato como cancelado.</p></div></div>
    <p class="lanc-erro" id="empErro"></p>
    <div class="pe"><button data-fechar="1">Voltar</button><button class="perigo" id="empConfirmar">${svg('lixeira', 'ico-s')}Apagar empréstimo</button></div>`);
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  fundo.querySelector('#empConfirmar').addEventListener('click', async () => {
    if (emp.demo) {
      emp.contratos = emp.contratos.filter(x => x.id !== c.id);
      emp.detalhe = null; fecharCaixa(); notify('🟢 Empréstimo simulado apagado');
      return desenharEmprestimos();
    }
    try {
      await request(`/loans/${c.id}`, { method: 'DELETE', headers: authHeaders() });
      emp.detalhe = null; fecharCaixa(); notify('🟢 Empréstimo apagado');
      await carregarEmprestimos();
    } catch (falha) {
      fundo.querySelector('#empErro').textContent = erroAmigavel(falha);
    }
  });
}

/* ---------- parcelas ---------- */

async function formPagar(c, p) {
  let candidatos = [];
  if (emp.demo) {
    // Na demonstração, finge que o extrato já trouxe o débito, para mostrar o vínculo.
    candidatos = [{ id: 'demo-debito', description: `DEB ${String(c.lender || c.name).toUpperCase()} PARCELA`, occurred_on: p.due_on,
      conta_nome: 'Conta corrente', amount_cents: p.amount_cents, exato: true, dias: 0 }];
  } else {
    try { candidatos = await request(`/loans/${c.id}/installments/${p.number}/candidates`, { headers: authHeaders(), cache: 'no-store' }); }
    catch { candidatos = []; }
  }
  const temCandidato = candidatos.length > 0;
  const fundo = abrirCaixa(`
    <div><h3>Pagar a parcela ${p.number}/${c.installments_count}</h3>
      <p class="sub">${seguro(c.name)} · vence em ${dataBr(p.due_on)} · ${reais(p.amount_cents)}</p></div>
    ${temCandidato ? `
      <div class="emp-escolha">
        <b>Achei nos seus lançamentos um débito que parece ser este pagamento:</b>
        ${candidatos.map((l, i) => `<label class="emp-opcao"><input type="radio" name="empModo" value="link:${seguro(l.id)}" ${i === 0 ? 'checked' : ''}>
          <span><b>${seguro(l.description)}</b><small>${dataBr(l.occurred_on)} · ${seguro(l.conta_nome || '')} · ${l.exato ? 'mesmo valor' : 'valor parecido'}${l.dias ? ` · ${l.dias} dia${l.dias > 1 ? 's' : ''} do vencimento` : ''}</small></span>
          <strong>${reais(l.amount_cents)}</strong></label>`).join('')}
        <p class="emp-dica">Vincular não cria nada novo: a parcela passa a apontar para esse lançamento, e o pagamento não entra duas vezes no mês.</p>
      </div>` : `<p class="emp-dica">Não encontrei nos lançamentos um débito deste valor perto do vencimento. Se o extrato ainda não foi importado, você pode importar antes e voltar aqui.</p>`}
    <label class="emp-opcao"><input type="radio" name="empModo" value="create" ${temCandidato ? '' : 'checked'}>
      <span><b>Criar o lançamento de despesa</b><small>O valor sai da conta escolhida, com a categoria do contrato.</small></span></label>
    <div class="campos" id="empCamposCriar">
      <label>Conta<select id="empContaPg">${emp.contas.map(x => `<option value="${seguro(x.id)}" ${x.id === c.account_id ? 'selected' : ''}>${seguro(x.name)}</option>`).join('')}</select></label>
      <label>Data do pagamento<input id="empDataPg" type="date" value="${p.due_on <= hojeIso() ? p.due_on : hojeIso()}"></label>
      <label class="largo">Valor pago (R$)<input id="empValorPg" type="number" min="0.01" step="0.01" value="${(p.amount_cents / 100).toFixed(2)}"><small class="emp-dica">Antecipou? Informe o valor com desconto que o banco cobrou: a diferença aparece como economia.</small></label>
    </div>
    <label class="emp-opcao"><input type="radio" name="empModo" value="mark">
      <span><b>Só marcar como paga</b><small>Para parcela antiga, paga antes de o contrato estar no sistema. Não mexe em nenhuma conta.</small></span></label>
    <p class="lanc-erro" id="empErro"></p>
    <div class="pe"><button data-fechar="1">Cancelar</button><button class="principal" id="empConfirmar">Dar baixa</button></div>`, 'emp-caixa');

  const modo = () => fundo.querySelector('input[name="empModo"]:checked').value;
  const ajustar = () => { fundo.querySelector('#empCamposCriar').hidden = modo() !== 'create'; };
  fundo.querySelectorAll('input[name="empModo"]').forEach(r => r.addEventListener('change', ajustar));
  ajustar();
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  fundo.querySelector('#empConfirmar').addEventListener('click', async () => {
    const erro = fundo.querySelector('#empErro');
    const escolhido = modo();
    const valor = Math.round(Number(fundo.querySelector('#empValorPg').value) * 100);
    const data = fundo.querySelector('#empDataPg').value;
    let corpo;
    if (escolhido.startsWith('link:')) corpo = { mode: 'link', transactionId: escolhido.slice(5) };
    else if (escolhido === 'create') {
      if (!(valor > 0)) return (erro.textContent = 'Informe o valor pago.');
      if (!fundo.querySelector('#empContaPg').value) return (erro.textContent = 'Cadastre uma conta antes de lançar o pagamento.');
      corpo = { mode: 'create', accountId: fundo.querySelector('#empContaPg').value, paidOn: data, paidCents: valor };
    } else corpo = { mode: 'mark', paidOn: p.due_on };

    if (emp.demo) {
      Object.assign(p, { paid_on: corpo.paidOn || p.due_on, paid_cents: corpo.paidCents || p.amount_cents, payment_mode: { link: 'linked', create: 'created', mark: 'marked' }[corpo.mode] });
      c.resumo = resumirLocal(c);
      if (!c.resumo.proxima_parcela) c.status = 'settled';
      fecharCaixa(); notify('🟢 Baixa simulada');
      return desenharEmprestimos();
    }
    const botao = fundo.querySelector('#empConfirmar');
    botao.disabled = true; botao.textContent = 'Registrando…';
    try {
      await request(`/loans/${c.id}/installments/${p.number}/pay`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(corpo) });
      fecharCaixa();
      notify(corpo.mode === 'link' ? '🟢 Parcela ligada ao lançamento do extrato' : corpo.mode === 'create' ? '🟢 Parcela paga e lançada na conta' : '🟢 Parcela marcada como paga');
      await carregarEmprestimos();
      if (typeof recarregarPainel === 'function') recarregarPainel();
    } catch (falha) {
      botao.disabled = false; botao.textContent = 'Dar baixa';
      erro.textContent = erroAmigavel(falha);
    }
  });
}

function confirmarDesfazer(c, p) {
  const criado = p.payment_mode === 'created';
  const fundo = abrirCaixa(`
    <div><h3>Desfazer a baixa da parcela ${p.number}?</h3>
      <p class="sub">${criado ? `O lançamento que o sistema criou (${reais(p.paid_cents)}) será apagado e o valor volta para a conta.` : p.payment_mode === 'linked' ? 'O lançamento do extrato continua onde está; só deixa de estar ligado a esta parcela.' : 'A parcela volta a ficar em aberto. Nenhuma conta é alterada.'}</p></div>
    <p class="lanc-erro" id="empErro"></p>
    <div class="pe"><button data-fechar="1">Voltar</button><button class="principal" id="empConfirmar">Desfazer baixa</button></div>`);
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  fundo.querySelector('#empConfirmar').addEventListener('click', async () => {
    if (emp.demo) {
      Object.assign(p, { paid_on: null, paid_cents: null, payment_mode: null });
      c.resumo = resumirLocal(c); if (c.status === 'settled') c.status = 'active';
      fecharCaixa(); notify('🟢 Baixa simulada desfeita');
      return desenharEmprestimos();
    }
    try {
      await request(`/loans/${c.id}/installments/${p.number}/pay`, { method: 'DELETE', headers: authHeaders() });
      fecharCaixa(); notify('🟢 Baixa desfeita');
      await carregarEmprestimos();
      if (typeof recarregarPainel === 'function') recarregarPainel();
    } catch (falha) {
      fundo.querySelector('#empErro').textContent = erroAmigavel(falha);
    }
  });
}

function formCorrigir(c, p) {
  const fundo = abrirCaixa(`
    <div><h3>Corrigir a parcela ${p.number}</h3><p class="sub">Use quando o contrato ou o boleto trouxer um valor ou uma data diferente do cálculo.</p></div>
    <div class="campos">
      <label>Vencimento<input id="empVence" type="date" value="${p.due_on}"></label>
      <label>Valor (R$)<input id="empValorCor" type="number" min="0.01" step="0.01" value="${(p.amount_cents / 100).toFixed(2)}"></label>
    </div>
    <p class="lanc-erro" id="empErro"></p>
    <div class="pe"><button data-fechar="1">Cancelar</button><button class="principal" id="empConfirmar">Salvar</button></div>`);
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  fundo.querySelector('#empConfirmar').addEventListener('click', async () => {
    const dueOn = fundo.querySelector('#empVence').value;
    const amountCents = Math.round(Number(fundo.querySelector('#empValorCor').value) * 100);
    if (!dueOn || !(amountCents > 0)) return (fundo.querySelector('#empErro').textContent = 'Informe data e valor.');
    if (emp.demo) {
      const juros = Math.min(p.interest_cents, amountCents);
      Object.assign(p, { due_on: dueOn, amount_cents: amountCents, interest_cents: juros, amortization_cents: amountCents - juros });
      c.resumo = resumirLocal(c); fecharCaixa(); notify('🟢 Parcela simulada corrigida');
      return desenharEmprestimos();
    }
    try {
      await request(`/loans/${c.id}/installments/${p.number}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ dueOn, amountCents }) });
      fecharCaixa(); notify('🟢 Parcela corrigida');
      await carregarEmprestimos();
    } catch (falha) {
      fundo.querySelector('#empErro').textContent = erroAmigavel(falha);
    }
  });
}

/* ---------- eventos ---------- */

function ligarEventosEmprestimos() {
  const tela = document.querySelector('#telaEmprestimos');
  tela.querySelector('#empTentarDeNovo')?.addEventListener('click', carregarEmprestimos);
  tela.querySelector('#empNovo')?.addEventListener('click', formContrato);
  tela.querySelectorAll('[data-abrir-contrato]').forEach(cartao => {
    const abrir = () => abrirContrato(cartao.dataset.abrirContrato);
    cartao.addEventListener('click', abrir);
    cartao.addEventListener('keydown', evento => { if (evento.key === 'Enter') abrir(); });
  });
  const c = emp.detalhe;
  if (!c) return;
  const parcela = numero => (c.parcelas || []).find(p => p.number === Number(numero));
  tela.querySelector('#empVoltar').addEventListener('click', () => { emp.detalhe = null; carregarEmprestimos(); });
  tela.querySelector('#empEditar')?.addEventListener('click', () => formDadosDoContrato(c));
  tela.querySelector('#empCancelar')?.addEventListener('click', () => salvarContrato(c, { status: 'cancelled' }));
  tela.querySelector('#empReativar')?.addEventListener('click', () => salvarContrato(c, { status: 'active' }));
  tela.querySelector('#empApagar')?.addEventListener('click', () => confirmarApagar(c));
  tela.querySelectorAll('[data-pagar]').forEach(b => b.addEventListener('click', () => formPagar(c, parcela(b.dataset.pagar))));
  tela.querySelectorAll('[data-desfazer]').forEach(b => b.addEventListener('click', () => confirmarDesfazer(c, parcela(b.dataset.desfazer))));
  tela.querySelectorAll('[data-corrigir]').forEach(b => b.addEventListener('click', () => formCorrigir(c, parcela(b.dataset.corrigir))));
}

/* ---------- entrada na tela ---------- */

function abrirTelaEmprestimos() {
  [...document.body.classList].filter(nome => nome.startsWith('tela-')).forEach(nome => document.body.classList.remove(nome));
  document.body.classList.add('tela-emprestimos');
  document.querySelectorAll('.sidebar nav button').forEach(botao =>
    botao.classList.toggle('active', botao.dataset.tela === 'emprestimos'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  carregarEmprestimos();
}
function fecharTelaEmprestimos() { document.body.classList.remove('tela-emprestimos'); }
window.abrirTelaEmprestimos = abrirTelaEmprestimos;

document.querySelector('[data-tela="emprestimos"]')?.addEventListener('click', abrirTelaEmprestimos);
document.querySelectorAll('.sidebar nav button:not([data-tela="emprestimos"])').forEach(botao =>
  botao.addEventListener('click', fecharTelaEmprestimos));

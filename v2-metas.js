/* Metas, orçamento do mês e reserva de emergência do GFP Familiar.
   As metas guardam dinheiro por objetivo; o orçamento compara o planejado com
   o realizado dos próprios lançamentos; a reserva é o colchão da família. */

const met = {
  metas: [], orcamento: { items: [], month: 0, year: 0 }, reservas: [],
  mes: new Date().getMonth() + 1, ano: new Date().getFullYear(),
  carregando: false, erro: '', demo: false
};

const MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/* ---------- dados ---------- */

function metasDemonstracao() {
  met.metas = [
    { id: 'demo-m1', title: 'Viagem em família', emoji: '✈️', target_cents: 2000000, current_cents: 1500000, deadline: '2027-01-31', status: 'active', movimentos: 6, criado_por: 'Alex' },
    { id: 'demo-m2', title: 'Fundo de educação', emoji: '🎓', target_cents: 3000000, current_cents: 800000, deadline: '2028-12-31', status: 'active', movimentos: 3, criado_por: 'Alex' },
    { id: 'demo-m3', title: 'Troca do carro', emoji: '🚗', target_cents: 4000000, current_cents: 4000000, deadline: null, status: 'completed', movimentos: 9, criado_por: 'Andreia' }
  ];
  met.orcamento = { month: met.mes, year: met.ano, items: [
    { id: 'demo-o1', category: 'Alimentação', limit_cents: 220000, realizado_cents: 248000 },
    { id: 'demo-o2', category: 'Casa', limit_cents: 320000, realizado_cents: 265000 },
    { id: 'demo-o3', category: 'Transporte', limit_cents: 180000, realizado_cents: 135000 },
    { id: 'demo-o4', category: 'Lazer', limit_cents: 120000, realizado_cents: 168000 }
  ] };
  met.reservas = [{ id: 'demo-r1', name: 'Reserva de emergência', target_cents: 5000000, current_cents: 3600000, monthly_target_cents: 100000 }];
}

async function carregarMetas() {
  met.carregando = true; met.erro = '';
  desenharMetas();
  try {
    if (window.demoMode || !sessionStorage.getItem('gfp_token')) {
      met.demo = true;
      metasDemonstracao();
    } else {
      met.demo = false;
      const [metas, orcamento, reservas, categorias] = await Promise.all([
        request('/goals', { headers: authHeaders(), cache: 'no-store' }),
        request(`/budgets?month=${met.mes}&year=${met.ano}`, { headers: authHeaders(), cache: 'no-store' }),
        request('/reserves', { headers: authHeaders(), cache: 'no-store' }),
        request('/categories', { headers: authHeaders(), cache: 'no-store' })
      ]);
      met.metas = metas || [];
      met.orcamento = orcamento || { items: [], month: met.mes, year: met.ano };
      met.reservas = reservas || [];
      lanc.categorias = categorias || lanc.categorias;
    }
  } catch (falha) {
    met.erro = typeof mensagemAmigavel === 'function' ? mensagemAmigavel(falha.message) : falha.message;
  }
  met.carregando = false;
  desenharMetas();
}

/* ---------- desenho ---------- */

const pct = (parte, todo) => (!todo ? 0 : Math.min(Math.round((Number(parte) / Number(todo)) * 100), 999));
const corDoUso = usado => usado >= 100 ? 'ruim' : usado >= 75 ? 'atencao' : 'bom';

function desenharMetas() {
  const alvo = document.querySelector('#telaMetas');
  if (!alvo) return;
  const guardado = met.metas.reduce((s, m) => s + Number(m.current_cents), 0);
  const objetivo = met.metas.reduce((s, m) => s + Number(m.target_cents), 0);
  const concluidas = met.metas.filter(m => m.status === 'completed').length;

  alvo.innerHTML = `
    <div class="lanc-head">
      <small>PLANEJAMENTO DA FAMÍLIA</small>
      <h2>Metas, orçamento e reserva</h2>
      <p>Onde vocês querem chegar, quanto pode gastar em cada categoria neste mês, e o colchão para o imprevisto.${met.demo ? ' <b>Dados de demonstração.</b>' : ''}</p>
    </div>

    ${met.erro ? `<div class="lanc-falha"><div>${svg('alerta')}<span><b>Não consegui carregar</b><small>${seguro(met.erro)}</small></span></div><button id="metTentarDeNovo">Tentar de novo</button></div>` : ''}

    <div class="met-resumo">
      <div><span>Guardado nas metas</span><strong>${reais(guardado)}</strong></div>
      <div><span>Somando os objetivos</span><strong>${reais(objetivo)}</strong></div>
      <div><span>Metas concluídas</span><strong>${concluidas} de ${met.metas.length}</strong></div>
      <div><span>Na reserva</span><strong>${reais(met.reservas.reduce((s, r) => s + Number(r.current_cents), 0))}</strong></div>
    </div>

    <section class="met-bloco">
      <div class="met-cabeca">
        <div><h3>🎯 Metas da família</h3><p>Cada depósito fica registrado, com quem fez e quando.</p></div>
        <button class="met-novo" id="metNovaMeta">${svg('mais', 'ico-s')}Nova meta</button>
      </div>
      ${met.carregando ? '<div class="lanc-vazio">Carregando…</div>' : desenharCartoesDeMeta()}
    </section>

    <section class="met-bloco">
      <div class="met-cabeca">
        <div><h3>📊 Orçamento de ${MESES_NOME[met.mes - 1]} de ${met.ano}</h3><p>O planejado de cada categoria contra o que já saiu nos lançamentos.</p></div>
        <div class="met-periodo">
          <button id="metMesAnterior" title="Mês anterior">◀</button>
          <span>${MESES_NOME[met.mes - 1]} ${met.ano}</span>
          <button id="metMesSeguinte" title="Mês seguinte">▶</button>
          <button class="met-novo" id="metNovoLimite">${svg('mais', 'ico-s')}Definir limite</button>
        </div>
      </div>
      ${desenharOrcamento()}
    </section>

    <section class="met-bloco">
      <div class="met-cabeca">
        <div><h3>🛟 Reserva de emergência</h3><p>O quanto a família já tem para o imprevisto.</p></div>
        ${met.reservas.length ? '' : `<button class="met-novo" id="metNovaReserva">${svg('mais', 'ico-s')}Criar reserva</button>`}
      </div>
      ${desenharReservas()}
    </section>`;

  ligarEventosMetas();
}

function desenharCartoesDeMeta() {
  if (!met.metas.length) {
    return `<div class="lanc-vazio"><b>Nenhuma meta ainda</b>Use “Nova meta” para registrar o primeiro objetivo da família — uma viagem, a troca do carro, o fundo de educação.</div>`;
  }
  return `<div class="met-metas">${met.metas.map(meta => {
    const usado = pct(meta.current_cents, meta.target_cents);
    const falta = Math.max(Number(meta.target_cents) - Number(meta.current_cents), 0);
    const concluida = meta.status === 'completed';
    return `
      <article class="met-meta ${concluida ? 'concluida' : ''}">
        <div class="met-meta-topo">
          <span class="met-emoji">${seguro(meta.emoji || '🎯')}</span>
          <div class="met-meta-nome">
            <b>${seguro(meta.title)}</b>
            <small>${concluida ? 'Meta alcançada 🎉' : meta.deadline ? `Prazo: ${dataBr(meta.deadline)}` : 'Sem prazo definido'}</small>
          </div>
          <span class="lanc-acoes">
            <button data-editar-meta="${seguro(meta.id)}" title="Alterar">${svg('lapis', 'ico-s')}</button>
            <button class="remover" data-apagar-meta="${seguro(meta.id)}" title="Apagar">${svg('lixeira', 'ico-s')}</button>
          </span>
        </div>
        <div class="met-barra"><i class="${concluida || usado >= 100 ? 'bom' : ''}" style="width:${Math.min(usado, 100)}%"></i></div>
        <div class="met-meta-numeros">
          <span><b>${reais(meta.current_cents)}</b> de ${reais(meta.target_cents)}</span>
          <span class="met-pct">${usado}%</span>
        </div>
        <div class="met-meta-pe">
          <small>${concluida ? `${meta.movimentos || 0} ${meta.movimentos === 1 ? 'movimento' : 'movimentos'}` : `Faltam ${reais(falta)}`}</small>
          <span class="met-acoes-meta">
            <button data-depositar="${seguro(meta.id)}">Depositar</button>
            <button data-retirar="${seguro(meta.id)}">Retirar</button>
            <button data-movimentos="${seguro(meta.id)}">Movimentos</button>
          </span>
        </div>
      </article>`;
  }).join('')}</div>`;
}

function desenharOrcamento() {
  const itens = met.orcamento.items || [];
  if (!itens.length) {
    return `<div class="lanc-vazio"><b>Nenhum limite definido para este mês</b>Defina quanto a família pode gastar em cada categoria e eu comparo com os lançamentos.</div>`;
  }
  const planejado = itens.reduce((s, i) => s + Number(i.limit_cents), 0);
  const realizado = itens.reduce((s, i) => s + Number(i.realizado_cents), 0);
  return `
    <div class="met-orc-total">
      <span>Planejado <b>${reais(planejado)}</b></span>
      <span>Realizado <b class="${corDoUso(pct(realizado, planejado))}">${reais(realizado)}</b></span>
      <span>${realizado > planejado ? `Passou ${reais(realizado - planejado)}` : `Sobra ${reais(planejado - realizado)}`}</span>
    </div>
    ${itens.map(item => {
      const usado = pct(item.realizado_cents, item.limit_cents);
      return `
        <div class="met-orc-linha">
          <span class="met-orc-nome">${typeof chipCategoria === 'function' ? chipCategoria(item.category) : seguro(item.category)}</span>
          <div class="met-barra"><i class="${corDoUso(usado)}" style="width:${Math.min(usado, 100)}%"></i></div>
          <span class="met-orc-valores"><b>${reais(item.realizado_cents)}</b> de ${reais(item.limit_cents)}</span>
          <span class="met-pct ${corDoUso(usado)}">${usado}%</span>
          <span class="lanc-acoes">
            <button data-editar-limite="${seguro(item.id)}" title="Alterar limite">${svg('lapis', 'ico-s')}</button>
            <button class="remover" data-apagar-limite="${seguro(item.id)}" title="Tirar do orçamento">${svg('lixeira', 'ico-s')}</button>
          </span>
        </div>`;
    }).join('')}`;
}

function desenharReservas() {
  if (!met.reservas.length) {
    return `<div class="lanc-vazio"><b>Nenhuma reserva criada</b>A recomendação comum é juntar de três a seis meses de despesa da família.</div>`;
  }
  return `<div class="met-metas">${met.reservas.map(reserva => {
    const usado = pct(reserva.current_cents, reserva.target_cents);
    const falta = Math.max(Number(reserva.target_cents) - Number(reserva.current_cents), 0);
    const meses = Number(reserva.monthly_target_cents) > 0 ? Math.ceil(falta / Number(reserva.monthly_target_cents)) : 0;
    return `
      <article class="met-reserva">
        <div class="met-meta-topo">
          <span class="met-emoji">🛟</span>
          <div class="met-meta-nome">
            <b>${seguro(reserva.name)}</b>
            <small>${Number(reserva.monthly_target_cents) ? `Aporte planejado de ${reais(reserva.monthly_target_cents)} por mês` : 'Sem aporte mensal definido'}</small>
          </div>
          <span class="lanc-acoes">
            <button data-editar-reserva="${seguro(reserva.id)}" title="Alterar">${svg('lapis', 'ico-s')}</button>
            <button class="remover" data-apagar-reserva="${seguro(reserva.id)}" title="Desativar">${svg('lixeira', 'ico-s')}</button>
          </span>
        </div>
        <div class="met-barra"><i class="${usado >= 100 ? 'bom' : ''}" style="width:${Math.min(usado, 100)}%"></i></div>
        <div class="met-meta-numeros">
          <span><b>${reais(reserva.current_cents)}</b> de ${reais(reserva.target_cents)}</span>
          <span class="met-pct">${usado}%</span>
        </div>
        <div class="met-meta-pe">
          <small>${falta ? `Faltam ${reais(falta)}${meses ? ` · ${meses} ${meses === 1 ? 'mês' : 'meses'} no ritmo planejado` : ''}` : 'Reserva completa 🎉'}</small>
          <span class="met-acoes-meta">
            <button data-depositar-reserva="${seguro(reserva.id)}">Depositar</button>
            <button data-retirar-reserva="${seguro(reserva.id)}">Retirar</button>
          </span>
        </div>
      </article>`;
  }).join('')}</div>`;
}

/* ---------- formulários ---------- */

function caixaMetas(titulo, sub, campos, aoSalvar, textoBotao = 'Salvar') {
  const fundo = abrirCaixa(`
    <div><h3>${titulo}</h3>${sub ? `<p class="sub">${sub}</p>` : ''}</div>
    <div class="campos">${campos}</div>
    <p class="lanc-erro" id="metErro"></p>
    <div class="pe"><button data-fechar="1">Cancelar</button><button class="principal" id="metSalvar">${textoBotao}</button></div>`);
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  const botao = fundo.querySelector('#metSalvar');
  botao.addEventListener('click', async () => {
    const erro = fundo.querySelector('#metErro');
    erro.textContent = '';
    botao.disabled = true;
    try {
      if (met.demo) { notify('🟡 No modo demonstração nada é gravado'); fecharCaixa(); return; }
      if (await aoSalvar(fundo) === false) { botao.disabled = false; return; }
      fecharCaixa();
      await carregarMetas();
    } catch (falha) {
      botao.disabled = false;
      erro.textContent = falha.message;
    }
  });
  return fundo;
}

const valorEmCentavos = campo => Math.round(Number(String(campo.value).replace(/\./g, '').replace(',', '.')) * 100);

function formMeta(meta) {
  caixaMetas(meta ? 'Alterar meta' : 'Nova meta da família',
    'O quanto vocês querem juntar e até quando. Os depósitos entram depois, um a um.',
    `<label class="largo">Objetivo<input id="metTitulo" maxlength="120" value="${seguro(meta?.title || '')}" placeholder="Ex.: Viagem em família"></label>
     <label>Quanto quer juntar (R$)<input id="metAlvo" type="number" step="0.01" min="0.01" value="${meta ? (Number(meta.target_cents) / 100).toFixed(2) : ''}" placeholder="20000,00"></label>
     <label>Prazo (opcional)<input id="metPrazo" type="date" value="${seguro(meta?.deadline || '')}"></label>
     <label>Ícone<input id="metEmoji" maxlength="4" value="${seguro(meta?.emoji || '🎯')}"></label>
     <label class="largo">Observação (opcional)<input id="metObs" maxlength="600" value="${seguro(meta?.description || '')}"></label>`,
    async fundo => {
      const titulo = fundo.querySelector('#metTitulo').value.trim();
      const alvo = valorEmCentavos(fundo.querySelector('#metAlvo'));
      if (titulo.length < 2) { fundo.querySelector('#metErro').textContent = 'Dê um nome ao objetivo.'; return false; }
      if (!(alvo > 0)) { fundo.querySelector('#metErro').textContent = 'Informe quanto a família quer juntar.'; return false; }
      const dados = {
        title: titulo, targetCents: alvo,
        deadline: fundo.querySelector('#metPrazo').value || null,
        emoji: fundo.querySelector('#metEmoji').value.trim() || '🎯',
        description: fundo.querySelector('#metObs').value.trim() || null
      };
      await request(meta ? `/goals/${meta.id}` : '/goals', { method: meta ? 'PATCH' : 'POST', headers: authHeaders(), body: JSON.stringify(dados) });
      notify(meta ? '🟢 Meta alterada' : '🟢 Meta criada');
    });
}

function formMovimento({ titulo, sub, caminho, tipo, disponivel }) {
  caixaMetas(titulo, sub,
    `<label class="largo">Valor (R$)<input id="metValor" type="number" step="0.01" min="0.01" placeholder="500,00"></label>
     <label class="largo">Observação (opcional)<input id="metNota" maxlength="200" placeholder="Ex.: décimo terceiro"></label>`,
    async fundo => {
      const valor = valorEmCentavos(fundo.querySelector('#metValor'));
      if (!(valor > 0)) { fundo.querySelector('#metErro').textContent = 'Informe o valor.'; return false; }
      if (tipo === 'withdraw' && disponivel !== undefined && valor > disponivel) {
        fundo.querySelector('#metErro').textContent = `Só há ${reais(disponivel)} disponível.`;
        return false;
      }
      await request(caminho, { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ amountCents: valor, type: tipo, note: fundo.querySelector('#metNota').value.trim() || null }) });
      notify(tipo === 'deposit' ? '🟢 Depósito registrado' : '🟢 Retirada registrada');
    }, tipo === 'deposit' ? 'Depositar' : 'Retirar');
}

function formLimite(item) {
  const usadas = new Set((met.orcamento.items || []).map(i => i.category));
  const disponiveis = (typeof nomesDeCategoria === 'function' ? nomesDeCategoria() : [])
    .filter(nome => item ? true : !usadas.has(nome));
  caixaMetas(item ? `Limite de ${item.category}` : 'Definir limite do mês',
    `Vale para ${MESES_NOME[met.mes - 1]} de ${met.ano}. O realizado sai dos seus próprios lançamentos.`,
    `<label class="largo">Categoria<select id="metCategoria" ${item ? 'disabled' : ''}>
        ${item ? `<option>${seguro(item.category)}</option>` : disponiveis.map(nome => `<option>${seguro(nome)}</option>`).join('')}
      </select></label>
     <label class="largo">Quanto pode gastar no mês (R$)<input id="metLimite" type="number" step="0.01" min="0.01" value="${item ? (Number(item.limit_cents) / 100).toFixed(2) : ''}" placeholder="2000,00"></label>`,
    async fundo => {
      const limite = valorEmCentavos(fundo.querySelector('#metLimite'));
      const categoria = item ? item.category : fundo.querySelector('#metCategoria').value;
      if (!categoria) { fundo.querySelector('#metErro').textContent = 'Escolha a categoria.'; return false; }
      if (!(limite > 0)) { fundo.querySelector('#metErro').textContent = 'Informe o limite do mês.'; return false; }
      await request('/budgets', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ category: categoria, limitCents: limite, month: met.mes, year: met.ano }) });
      notify('🟢 Limite salvo');
    });
}

function formReserva(reserva) {
  caixaMetas(reserva ? 'Alterar reserva' : 'Criar reserva de emergência',
    'A recomendação comum é juntar de três a seis meses de despesa da família.',
    `<label class="largo">Nome<input id="metNome" maxlength="80" value="${seguro(reserva?.name || 'Reserva de emergência')}"></label>
     <label>Quanto quer ter (R$)<input id="metAlvo" type="number" step="0.01" min="0.01" value="${reserva ? (Number(reserva.target_cents) / 100).toFixed(2) : ''}" placeholder="50000,00"></label>
     <label>Aporte por mês (R$)<input id="metAporte" type="number" step="0.01" min="0" value="${reserva ? (Number(reserva.monthly_target_cents) / 100).toFixed(2) : '0'}"></label>`,
    async fundo => {
      const alvo = valorEmCentavos(fundo.querySelector('#metAlvo'));
      if (!(alvo > 0)) { fundo.querySelector('#metErro').textContent = 'Informe quanto a família quer ter guardado.'; return false; }
      const dados = {
        name: fundo.querySelector('#metNome').value.trim() || 'Reserva de emergência',
        targetCents: alvo,
        monthlyTargetCents: Math.max(valorEmCentavos(fundo.querySelector('#metAporte')) || 0, 0)
      };
      await request(reserva ? `/reserves/${reserva.id}` : '/reserves', { method: reserva ? 'PATCH' : 'POST', headers: authHeaders(), body: JSON.stringify(dados) });
      notify(reserva ? '🟢 Reserva alterada' : '🟢 Reserva criada');
    });
}

async function verMovimentos(meta) {
  let lista = [];
  if (!met.demo) {
    try { lista = await request(`/goals/${meta.id}/contributions`, { headers: authHeaders(), cache: 'no-store' }); }
    catch (falha) { return notify(`🔴 ${falha.message}`); }
  }
  const fundo = abrirCaixa(`
    <div><h3>${seguro(meta.emoji || '🎯')} ${seguro(meta.title)}</h3>
      <p class="sub">${reais(meta.current_cents)} de ${reais(meta.target_cents)} · ${lista.length} ${lista.length === 1 ? 'movimento' : 'movimentos'}</p></div>
    <div class="met-movimentos">
      ${lista.length ? lista.map(m => `
        <div class="met-mov">
          <span class="${m.type === 'deposit' ? 'entrada' : 'saida'}">${m.type === 'deposit' ? '+' : '−'} ${reais(m.amount_cents).replace('R$', '').trim()}</span>
          <span>${seguro(m.quem || 'família')}${m.note ? ` · ${seguro(m.note)}` : ''}</span>
          <small>${dataBr(String(m.created_at).slice(0, 10))}</small>
        </div>`).join('') : '<div class="lanc-vazio">Nenhum movimento registrado ainda.</div>'}
    </div>
    <div class="pe"><button data-fechar="1">Fechar</button></div>`, 'media');
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
}

async function apagarComConfirmacao(caminho, nome, aoTerminar) {
  const fundo = abrirCaixa(`
    <div class="aviso"><i>!</i><div><h3>Apagar ${seguro(nome)}?</h3><p class="sub">Essa ação não volta atrás.</p></div></div>
    <p class="lanc-erro" id="metErroApagar"></p>
    <div class="pe"><button data-fechar="1">Cancelar</button><button class="perigo" id="metConfirmar">${svg('lixeira', 'ico-s')}Apagar</button></div>`);
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  fundo.querySelector('#metConfirmar').addEventListener('click', async () => {
    const botao = fundo.querySelector('#metConfirmar');
    botao.disabled = true;
    try {
      if (met.demo) { notify('🟡 No modo demonstração nada é apagado'); fecharCaixa(); return; }
      await request(caminho, { method: 'DELETE', headers: authHeaders() });
      fecharCaixa();
      notify(`🟢 ${nome} apagado`);
      if (aoTerminar) aoTerminar();
      await carregarMetas();
    } catch (falha) {
      botao.disabled = false;
      fundo.querySelector('#metErroApagar').textContent = falha.message;
    }
  });
}

/* ---------- eventos ---------- */

function ligarEventosMetas() {
  const tela = document.querySelector('#telaMetas');
  const meta = id => met.metas.find(m => m.id === id);
  const reserva = id => met.reservas.find(r => r.id === id);
  const limite = id => (met.orcamento.items || []).find(i => i.id === id);

  tela.querySelector('#metTentarDeNovo')?.addEventListener('click', carregarMetas);
  tela.querySelector('#metNovaMeta').addEventListener('click', () => formMeta(null));
  tela.querySelector('#metNovoLimite').addEventListener('click', () => formLimite(null));
  tela.querySelector('#metNovaReserva')?.addEventListener('click', () => formReserva(null));

  tela.querySelector('#metMesAnterior').addEventListener('click', () => {
    met.mes -= 1; if (met.mes < 1) { met.mes = 12; met.ano -= 1; }
    carregarMetas();
  });
  tela.querySelector('#metMesSeguinte').addEventListener('click', () => {
    met.mes += 1; if (met.mes > 12) { met.mes = 1; met.ano += 1; }
    carregarMetas();
  });

  tela.querySelectorAll('[data-editar-meta]').forEach(b => b.addEventListener('click', () => formMeta(meta(b.dataset.editarMeta))));
  tela.querySelectorAll('[data-apagar-meta]').forEach(b => b.addEventListener('click', () => {
    const alvo = meta(b.dataset.apagarMeta);
    apagarComConfirmacao(`/goals/${alvo.id}`, `a meta ${alvo.title}`);
  }));
  tela.querySelectorAll('[data-depositar]').forEach(b => b.addEventListener('click', () => {
    const alvo = meta(b.dataset.depositar);
    formMovimento({ titulo: `Depositar em ${alvo.title}`, sub: `Já juntou ${reais(alvo.current_cents)} de ${reais(alvo.target_cents)}.`, caminho: `/goals/${alvo.id}/contributions`, tipo: 'deposit' });
  }));
  tela.querySelectorAll('[data-retirar]').forEach(b => b.addEventListener('click', () => {
    const alvo = meta(b.dataset.retirar);
    formMovimento({ titulo: `Retirar de ${alvo.title}`, sub: `Disponível: ${reais(alvo.current_cents)}.`, caminho: `/goals/${alvo.id}/contributions`, tipo: 'withdraw', disponivel: Number(alvo.current_cents) });
  }));
  tela.querySelectorAll('[data-movimentos]').forEach(b => b.addEventListener('click', () => verMovimentos(meta(b.dataset.movimentos))));

  tela.querySelectorAll('[data-editar-limite]').forEach(b => b.addEventListener('click', () => formLimite(limite(b.dataset.editarLimite))));
  tela.querySelectorAll('[data-apagar-limite]').forEach(b => b.addEventListener('click', () => {
    const alvo = limite(b.dataset.apagarLimite);
    apagarComConfirmacao(`/budgets/${alvo.id}`, `o limite de ${alvo.category}`);
  }));

  tela.querySelectorAll('[data-editar-reserva]').forEach(b => b.addEventListener('click', () => formReserva(reserva(b.dataset.editarReserva))));
  tela.querySelectorAll('[data-apagar-reserva]').forEach(b => b.addEventListener('click', () => {
    const alvo = reserva(b.dataset.apagarReserva);
    apagarComConfirmacao(`/reserves/${alvo.id}`, alvo.name);
  }));
  tela.querySelectorAll('[data-depositar-reserva]').forEach(b => b.addEventListener('click', () => {
    const alvo = reserva(b.dataset.depositarReserva);
    formMovimento({ titulo: `Depositar na ${alvo.name}`, sub: `Já tem ${reais(alvo.current_cents)} de ${reais(alvo.target_cents)}.`, caminho: `/reserves/${alvo.id}/movements`, tipo: 'deposit' });
  }));
  tela.querySelectorAll('[data-retirar-reserva]').forEach(b => b.addEventListener('click', () => {
    const alvo = reserva(b.dataset.retirarReserva);
    formMovimento({ titulo: `Retirar da ${alvo.name}`, sub: `Disponível: ${reais(alvo.current_cents)}.`, caminho: `/reserves/${alvo.id}/movements`, tipo: 'withdraw', disponivel: Number(alvo.current_cents) });
  }));
}

/* ---------- entrada na tela ---------- */

function abrirTelaMetas() {
  document.body.classList.remove('tela-lancamentos', 'tela-cadastros');
  document.body.classList.add('tela-metas');
  document.querySelectorAll('.sidebar nav button').forEach(botao =>
    botao.classList.toggle('active', botao.dataset.tela === 'metas'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  carregarMetas();
}
function fecharTelaMetas() { document.body.classList.remove('tela-metas'); }
window.abrirTelaMetas = abrirTelaMetas;

document.querySelector('[data-tela="metas"]')?.addEventListener('click', abrirTelaMetas);
document.querySelectorAll('.sidebar nav button:not([data-tela="metas"])').forEach(botao =>
  botao.addEventListener('click', fecharTelaMetas));

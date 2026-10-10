/* Painel do dono — a gestão dos clientes do GFP.

   Só aparece para os e-mails de dono (o servidor confere; a tela apenas
   pergunta). Mostra contas e assinaturas — quem está em teste, quem paga em
   dia, quem atrasou — e nunca as finanças de ninguém. */

const dono = { sou: false, dados: null, carregando: false, erro: '', filtro: 'todas', busca: '' };

const SITUACOES_DO_DONO = {
  ativa: { rotulo: 'Em dia', tom: 'bom' },
  atrasada: { rotulo: 'Em atraso', tom: 'atencao' },
  suspensa: { rotulo: 'Suspensa', tom: 'ruim' },
  teste: { rotulo: 'Em teste', tom: 'info' },
  teste_encerrado: { rotulo: 'Teste encerrado', tom: '' },
  cancelada: { rotulo: 'Cancelada', tom: 'atencao' },
  encerrada: { rotulo: 'Encerrada', tom: '' },
  cortesia: { rotulo: 'Cortesia', tom: 'bom' }
};
const FILTROS_DO_DONO = [
  ['todas', 'Todas', () => true],
  ['adimplentes', 'Adimplentes', c => c.situacao === 'ativa'],
  ['inadimplentes', 'Inadimplentes', c => ['atrasada', 'suspensa'].includes(c.situacao)],
  ['teste', 'Em teste', c => c.situacao === 'teste'],
  ['sem_assinar', 'Teste encerrado', c => c.situacao === 'teste_encerrado'],
  ['canceladas', 'Canceladas e encerradas', c => ['cancelada', 'encerrada'].includes(c.situacao)],
  ['cortesia', 'Cortesia', c => c.situacao === 'cortesia']
];
const dataCurta = iso => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');

/* ---------- dados ---------- */

async function conferirDono() {
  dono.sou = false;
  if (!window.demoMode && sessionStorage.getItem('gfp_token')) {
    try { dono.sou = Boolean((await request('/owner/me', { headers: authHeaders(), cache: 'no-store' })).dono); } catch { dono.sou = false; }
  }
  const botao = document.querySelector('[data-tela="dono"]');
  if (botao) botao.hidden = !dono.sou;
  if (!dono.sou && document.body.classList.contains('tela-dono')) document.querySelector('[data-tela="central"]')?.click();
}

async function carregarClientes() {
  dono.carregando = true; dono.erro = '';
  desenharDono();
  try {
    dono.dados = await request('/owner/accounts', { headers: authHeaders(), cache: 'no-store' });
  } catch (falha) {
    dono.erro = typeof mensagemAmigavel === 'function' ? mensagemAmigavel(falha.message) : falha.message;
  }
  dono.carregando = false;
  desenharDono();
}

function clientesFiltrados() {
  const teste = FILTROS_DO_DONO.find(f => f[0] === dono.filtro)?.[2] || (() => true);
  const procurado = semAcento(dono.busca.trim());
  return (dono.dados?.contas || []).filter(c => teste(c)
    && (!procurado || semAcento(`${c.titular || ''} ${c.email || ''} ${c.conta || ''}`).includes(procurado)));
}

/* ---------- a tela ---------- */

function detalheDaSituacao(c) {
  if (c.aguardando_pagamento) return 'aguardando o 1º pagamento';
  if (c.situacao === 'teste') return `faltam ${c.dias_restantes} ${c.dias_restantes === 1 ? 'dia' : 'dias'}`;
  if (c.situacao === 'atrasada') return `${c.dias_em_atraso ?? 0} ${c.dias_em_atraso === 1 ? 'dia' : 'dias'} de atraso · suspende em ${dataCurta(c.ate)}`;
  if (c.situacao === 'suspensa') return `${c.dias_em_atraso ?? 0} dias de atraso`;
  if (c.situacao === 'cancelada') return `acesso até ${dataCurta(c.ate)}`;
  if (c.situacao === 'ativa') return `próxima cobrança em ${c.proxima_cobranca ? dataBr(c.proxima_cobranca) : dataCurta(c.ate)}`;
  return '';
}

function desenharDono() {
  const alvo = document.querySelector('#telaDono');
  if (!alvo) return;
  if (!dono.dados) {
    alvo.innerHTML = dono.erro
      ? `<div class="lanc-falha"><div>${svg('alerta')}<span><b>Não consegui carregar os clientes</b><small>${seguro(dono.erro)}</small></span></div><button id="donoTentarDeNovo">Tentar de novo</button></div>`
      : '<div class="lanc-tabela"><div class="lanc-vazio">Carregando os clientes…</div></div>';
    alvo.querySelector('#donoTentarDeNovo')?.addEventListener('click', carregarClientes);
    return;
  }
  const r = dono.dados.resumo;
  const linhas = clientesFiltrados();
  const contagem = id => (dono.dados.contas || []).filter(FILTROS_DO_DONO.find(f => f[0] === id)[2]).length;

  alvo.innerHTML = `
    <div class="lanc-head">
      <small>PAINEL DO DONO</small>
      <h2>Clientes</h2>
      <p>As contas do GFP e a situação de cada assinatura. Aqui não aparecem lançamentos, saldos nem qualquer dado financeiro dos clientes.</p>
    </div>
    ${dono.erro ? `<div class="lanc-falha"><div>${svg('alerta')}<span><b>A lista pode estar desatualizada</b><small>${seguro(dono.erro)}</small></span></div><button id="donoTentarDeNovo">Tentar de novo</button></div>` : ''}

    <div class="met-resumo cinco">
      <div><span>Adimplentes</span><strong>${r.adimplentes}</strong><small>assinatura em dia</small></div>
      <div><span>Inadimplentes</span><strong>${r.inadimplentes}</strong><small>em atraso ou suspensos</small></div>
      <div><span>Em teste grátis</span><strong>${r.em_teste}</strong><small>${r.testes_vencendo} ${r.testes_vencendo === 1 ? 'vence' : 'vencem'} em até 5 dias</small></div>
      <div><span>Receita mensal recorrente</span><strong>${reais(r.receita_mensal_cents)}</strong><small>anual conta como 1/12 por mês</small></div>
      <div><span>Recebido neste mês</span><strong>${reais(r.recebido_no_mes_cents)}</strong><small>${r.contas_novas_no_mes} ${r.contas_novas_no_mes === 1 ? 'conta nova' : 'contas novas'} · ${r.cancelamentos_no_mes} ${r.cancelamentos_no_mes === 1 ? 'cancelamento' : 'cancelamentos'} · ${r.estornos_no_mes} ${r.estornos_no_mes === 1 ? 'estorno' : 'estornos'}</small></div>
    </div>

    <section class="met-bloco">
      <div class="met-cabeca">
        <div><h3>👥 Contas</h3><p>${r.total} ${r.total === 1 ? 'conta' : 'contas'} no total. A cobrança de quem atrasa é automática; daqui você acompanha e resolve casos de suporte.</p></div>
        <div class="dono-acoes-topo">
          <button id="donoExportar">${svg('sai', 'ico-s')}Exportar CSV</button>
          <button id="donoAtualizar">${svg('atualizar', 'ico-s')}Atualizar</button>
        </div>
      </div>
      <div class="dono-filtros">
        ${FILTROS_DO_DONO.map(([id, rotulo]) => `<button data-filtro="${id}" aria-pressed="${dono.filtro === id}">${rotulo} <i>${contagem(id)}</i></button>`).join('')}
        <input id="donoBusca" placeholder="Buscar por nome ou e-mail" value="${seguro(dono.busca)}" autocomplete="off">
      </div>
      ${dono.carregando && !linhas.length ? '<div class="lanc-vazio">Carregando…</div>' : linhas.length ? `
      <div class="emp-tabela-rolo"><table class="emp-tabela dono-tabela">
        <thead><tr><th>Cliente</th><th>Situação</th><th>Plano</th><th>Cadastro</th><th>Último pagamento</th><th class="num">Total pago</th><th></th></tr></thead>
        <tbody>${linhas.map(c => {
          const s = SITUACOES_DO_DONO[c.situacao] || { rotulo: c.situacao, tom: '' };
          const detalhe = detalheDaSituacao(c);
          return `<tr>
            <td><b>${seguro(c.titular || c.conta || '—')}</b><small>${c.email ? `<a href="mailto:${seguro(c.email)}">${seguro(c.email)}</a>` : 'sem e-mail'}</small></td>
            <td><span class="lic-selo ${s.tom}">${s.rotulo}</span>${detalhe ? `<small>${seguro(detalhe)}</small>` : ''}</td>
            <td>${c.plano === 'anual' ? 'Anual' : c.plano === 'mensal' ? 'Mensal' : '—'}</td>
            <td>${dataCurta(c.criada_em)}</td>
            <td>${dataCurta(c.ultimo_pagamento)}</td>
            <td class="num">${reais(c.total_pago_cents)}</td>
            <td><span class="lanc-acoes">
              ${['teste', 'teste_encerrado'].includes(c.situacao) ? `<button data-prorrogar="${seguro(c.id)}" title="Dar mais dias de teste grátis">+ dias de teste</button>` : ''}
              ${c.cortesia ? `<button data-cortesia="${seguro(c.id)}" data-ligar="0" title="Voltar a conta para a regra normal">Tirar cortesia</button>`
                : ['teste', 'teste_encerrado', 'encerrada'].includes(c.situacao) ? `<button data-cortesia="${seguro(c.id)}" data-ligar="1" title="Liberar sem prazo e sem cobrança">Dar cortesia</button>` : ''}
            </span></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : '<div class="lanc-vazio"><b>Nenhuma conta com esse filtro</b>Troque o filtro ou limpe a busca.</div>'}
    </section>`;

  ligarEventosDono(alvo);
}

/* ---------- ações ---------- */

function exportarClientes() {
  const linhas = clientesFiltrados();
  const cabecalho = ['Cliente', 'E-mail', 'Situação', 'Detalhe', 'Plano', 'Cadastro', 'Último pagamento', 'Total pago', 'Dias em atraso'];
  const corpo = linhas.map(c => [c.titular || c.conta || '', c.email || '', SITUACOES_DO_DONO[c.situacao]?.rotulo || c.situacao, detalheDaSituacao(c),
    c.plano || '', dataCurta(c.criada_em), dataCurta(c.ultimo_pagamento), (c.total_pago_cents / 100).toFixed(2).replace('.', ','), c.dias_em_atraso ?? '']);
  const csv = [cabecalho, ...corpo].map(colunas => colunas.map(valor => `"${String(valor).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `clientes-gfp-${new Date().toLocaleDateString('sv-SE')}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  notify(`🟢 ${linhas.length} ${linhas.length === 1 ? 'cliente exportado' : 'clientes exportados'}`);
}

function caixaDoDono({ titulo, texto, campos = '', botao, executar, sucesso }) {
  const fundo = abrirCaixa(`
    <div><h3>${titulo}</h3><p class="sub">${texto}</p></div>
    ${campos}
    <p class="lanc-erro" id="donoErro"></p>
    <div class="pe"><button data-fechar="1">Voltar</button><button class="principal" id="donoConfirmar">${botao}</button></div>`);
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  fundo.querySelector('#donoConfirmar').addEventListener('click', async evento => {
    const confirmar = evento.currentTarget;
    confirmar.disabled = true;
    try {
      await executar(fundo);
      fecharCaixa();
      notify(sucesso);
      await carregarClientes();
    } catch (falha) {
      confirmar.disabled = false;
      fundo.querySelector('#donoErro').textContent = typeof mensagemAmigavel === 'function' ? mensagemAmigavel(falha.message) : falha.message;
    }
  });
}

function ligarEventosDono(tela) {
  const conta = id => dono.dados.contas.find(c => c.id === id);
  tela.querySelector('#donoTentarDeNovo')?.addEventListener('click', carregarClientes);
  tela.querySelector('#donoAtualizar')?.addEventListener('click', carregarClientes);
  tela.querySelector('#donoExportar')?.addEventListener('click', exportarClientes);
  tela.querySelectorAll('[data-filtro]').forEach(botao => botao.addEventListener('click', () => { dono.filtro = botao.dataset.filtro; desenharDono(); }));
  tela.querySelector('#donoBusca')?.addEventListener('input', evento => {
    dono.busca = evento.target.value;
    desenharDono();
    // redesenhar troca o campo: devolve o foco e o cursor para a pessoa continuar digitando
    const campo = document.querySelector('#donoBusca');
    campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length);
  });
  tela.querySelectorAll('[data-prorrogar]').forEach(botao => botao.addEventListener('click', () => {
    const c = conta(botao.dataset.prorrogar);
    caixaDoDono({
      titulo: `Mais dias de teste para ${seguro(c.titular || c.email || 'a conta')}`,
      texto: 'Os dias contam a partir do fim do teste — ou de hoje, se ele já venceu.',
      campos: '<div class="campos"><label>Quantos dias<input id="donoDias" type="number" min="1" max="90" step="1" value="7"></label></div>',
      botao: 'Prorrogar o teste', sucesso: '🟢 Teste prorrogado',
      executar: fundo => request(`/owner/accounts/${c.id}/trial`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ dias: Math.trunc(Number(fundo.querySelector('#donoDias').value)) }) })
    });
  }));
  tela.querySelectorAll('[data-cortesia]').forEach(botao => botao.addEventListener('click', () => {
    const c = conta(botao.dataset.cortesia), ligar = botao.dataset.ligar === '1';
    caixaDoDono({
      titulo: ligar ? `Dar cortesia a ${seguro(c.titular || c.email || 'esta conta')}?` : `Tirar a cortesia de ${seguro(c.titular || c.email || 'esta conta')}?`,
      texto: ligar ? 'A conta fica liberada sem prazo e sem cobrança, até você tirar a cortesia.'
        : 'A conta volta para a regra normal. Quem nunca assinou ganha um teste grátis de 14 dias a partir de agora.',
      botao: ligar ? 'Dar cortesia' : 'Tirar cortesia', sucesso: ligar ? '🟢 Cortesia concedida' : '🟢 Cortesia retirada',
      executar: () => request(`/owner/accounts/${c.id}/courtesy`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ cortesia: ligar }) })
    });
  }));
}

/* ---------- entrada na tela ---------- */

function abrirTelaDono() {
  if (!dono.sou) return;
  [...document.body.classList].filter(nome => nome.startsWith('tela-')).forEach(nome => document.body.classList.remove(nome));
  document.body.classList.add('tela-dono');
  document.querySelectorAll('.sidebar nav button').forEach(botao =>
    botao.classList.toggle('active', botao.dataset.tela === 'dono'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (typeof mostrarLicencaNaTela === 'function') mostrarLicencaNaTela();
  carregarClientes();
}
function fecharTelaDono() { document.body.classList.remove('tela-dono'); }

document.querySelector('[data-tela="dono"]')?.addEventListener('click', abrirTelaDono);
document.querySelectorAll('.sidebar nav button:not([data-tela="dono"])').forEach(botao =>
  botao.addEventListener('click', fecharTelaDono));

/* O painel acompanha a sessão: ao entrar ou sair, a tela pergunta de novo se quem está logado é dono. */
let sessaoDoDono = null;
setInterval(() => {
  const atual = `${sessionStorage.getItem('gfp_token') || ''}|${window.demoMode ? 1 : 0}`;
  if (atual === sessaoDoDono) return;
  sessaoDoDono = atual;
  dono.dados = null;
  conferirDono();
}, 1500);

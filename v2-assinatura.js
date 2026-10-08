/* Assinatura do GFP — a situação da licença, a contratação e o cancelamento.

   A licença vem do servidor (GET /billing/license) e aparece em três lugares:
   no selo da barra lateral, numa faixa no alto das telas quando há algo a
   fazer (teste acabando, pagamento em atraso, conta só para consulta) e na
   tela Assinatura.

   O pagamento acontece na fatura do Asaas, que abre em outra aba. O GFP nunca
   vê número de cartão; o CPF informado aqui vai direto para o Asaas, porque é
   exigido para emitir a cobrança, e não fica guardado no GFP. */

const ass = { dados: null, carregando: false, erro: '', demo: false, plano: 'anual', ocupado: false };

const TEXTO_DA_SITUACAO = {
  cortesia: { selo: '🟢 Licença ativa', rotulo: 'Conta de cortesia', tom: 'bom' },
  teste: { selo: '🎁 Teste grátis', rotulo: 'Teste grátis', tom: 'info' },
  teste_encerrado: { selo: '🔒 Só consulta', rotulo: 'Teste encerrado', tom: 'ruim' },
  ativa: { selo: '🟢 Assinatura ativa', rotulo: 'Assinatura ativa', tom: 'bom' },
  atrasada: { selo: '🟡 Pagamento em atraso', rotulo: 'Pagamento em atraso', tom: 'atencao' },
  suspensa: { selo: '🔒 Só consulta', rotulo: 'Assinatura suspensa', tom: 'ruim' },
  cancelada: { selo: '🟡 Assinatura cancelada', rotulo: 'Assinatura cancelada', tom: 'atencao' },
  encerrada: { selo: '🔒 Só consulta', rotulo: 'Assinatura encerrada', tom: 'ruim' }
};
const NOME_DO_PLANO = { mensal: 'Plano mensal', anual: 'Plano anual' };
const FORMAS = { cartao: 'cartão de crédito', pix: 'Pix', boleto: 'boleto' };
const ESTADO_DO_PAGAMENTO = { pending: 'Aguardando pagamento', confirmed: 'Pago', overdue: 'Em atraso', cancelled: 'Cancelado', refunded: 'Estornado' };
const diaDe = iso => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
const dias = n => `${n} ${n === 1 ? 'dia' : 'dias'}`;
const soNumeros = texto => String(texto || '').replace(/\D/g, '');

// Os mesmos dígitos verificadores que o servidor confere (api/src/licenca.js).
function documentoParece(valor) {
  const d = soNumeros(valor);
  if (/^(\d)\1+$/.test(d)) return false;
  const digito = (base, pesos) => { const r = base.split('').reduce((s, n, i) => s + Number(n) * pesos[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  if (d.length === 11) {
    const a = digito(d.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return d.endsWith(`${a}${digito(d.slice(0, 9) + a, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])}`);
  }
  if (d.length === 14) {
    const a = digito(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return d.endsWith(`${a}${digito(d.slice(0, 12) + a, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])}`);
  }
  return false;
}

/* ---------- dados ---------- */

function licencaDemonstracao() {
  const fim = new Date(Date.now() + 9 * 864e5).toISOString();
  return {
    licenca: { situacao: 'teste', acesso: 'total', plano: null, ate: fim, dias_restantes: 9, proxima_cobranca: null, pode_desistir: false, aguardando_pagamento: false, fatura_pendente: null },
    planos: [{ id: 'mensal', nome: 'Mensal', preco_cents: 990, ciclo: 'monthly', formas: ['cartao'] },
      { id: 'anual', nome: 'Anual', preco_cents: 6990, ciclo: 'yearly', formas: ['cartao', 'pix', 'boleto'] }],
    pagamentos: [], pode_contratar: true
  };
}

async function carregarLicenca() {
  ass.carregando = true; ass.erro = '';
  try {
    if (window.demoMode || !sessionStorage.getItem('gfp_token')) {
      if (!ass.demo || !ass.dados) ass.dados = licencaDemonstracao();
      ass.demo = true;
    } else {
      ass.demo = false;
      ass.dados = await request('/billing/license', { headers: authHeaders(), cache: 'no-store' });
    }
  } catch (falha) {
    ass.erro = typeof mensagemAmigavel === 'function' ? mensagemAmigavel(falha.message) : falha.message;
  }
  ass.carregando = false;
  mostrarLicencaNaTela();
  if (document.body.classList.contains('tela-assinatura')) desenharAssinatura();
}
window.recarregarLicenca = carregarLicenca;
// O servidor recusou uma gravação porque a conta está só para consulta: a tela se atualiza.
window.licencaInativa = () => { carregarLicenca(); };

/* ---------- selo da barra lateral e faixa de aviso ---------- */

function mostrarLicencaNaTela() {
  const l = ass.dados?.licenca;
  const caixa = document.querySelector('.sidebar .license');
  if (caixa && l) {
    const texto = TEXTO_DA_SITUACAO[l.situacao] || TEXTO_DA_SITUACAO.cortesia;
    const selo = caixa.querySelector('span'), linha = caixa.querySelector('b');
    if (selo) { selo.textContent = texto.selo; selo.dataset.tom = texto.tom; }
    if (linha) {
      linha.textContent = l.situacao === 'teste' ? `Faltam ${dias(l.dias_restantes)}`
        : l.situacao === 'cortesia' ? 'Plano individual'
          : l.plano ? NOME_DO_PLANO[l.plano] || 'Plano individual' : 'Plano individual';
    }
    caixa.classList.add('clicavel');
    caixa.title = 'Abrir Assinatura';
  }

  let faixa = document.querySelector('#faixaLicenca');
  const conteudo = l ? textoDaFaixa(l) : null;
  if (!conteudo) { if (faixa) faixa.remove(); return; }
  if (!faixa) {
    faixa = document.createElement('div');
    faixa.id = 'faixaLicenca';
    document.querySelector('main header')?.insertAdjacentElement('afterend', faixa);
  }
  faixa.className = `lic-faixa ${conteudo.tom}`;
  faixa.innerHTML = `<span>${conteudo.texto}</span><button type="button" id="faixaLicencaAcao">${conteudo.botao}</button>`;
  faixa.querySelector('#faixaLicencaAcao').addEventListener('click', abrirTelaAssinatura);
}

function textoDaFaixa(l) {
  if (document.body.classList.contains('tela-assinatura')) return null;
  if (l.aguardando_pagamento) return { tom: 'info', texto: '⏳ <b>Falta pagar a sua assinatura.</b> Assim que o pagamento for confirmado, a conta é liberada sozinha.', botao: 'Abrir fatura' };
  if (l.situacao === 'teste' && l.dias_restantes <= 5) return { tom: 'info', texto: `🎁 <b>Seu teste grátis termina em ${dias(l.dias_restantes)}.</b> Depois disso a conta fica só para consulta até você assinar.`, botao: 'Ver planos' };
  if (l.situacao === 'teste_encerrado') return { tom: 'ruim', texto: '🔒 <b>Seu teste grátis terminou.</b> Você continua vendo e exportando tudo; para lançar de novo, assine.', botao: 'Assinar agora' };
  if (l.situacao === 'atrasada') return { tom: 'atencao', texto: `⚠️ <b>O pagamento da assinatura está em atraso.</b> Regularize até ${diaDe(l.ate)} para a conta não ficar só para consulta.`, botao: 'Regularizar' };
  if (l.situacao === 'suspensa') return { tom: 'ruim', texto: '🔒 <b>Assinatura suspensa por falta de pagamento.</b> Você continua vendo e exportando tudo; para lançar de novo, regularize.', botao: 'Regularizar' };
  if (l.situacao === 'encerrada') return { tom: 'ruim', texto: '🔒 <b>Sua assinatura terminou.</b> Você continua vendo e exportando tudo; para lançar de novo, assine.', botao: 'Assinar agora' };
  if (l.situacao === 'cancelada' && l.dias_restantes <= 5) return { tom: 'atencao', texto: `🟡 <b>Assinatura cancelada:</b> o acesso completo vai até ${diaDe(l.ate)}.`, botao: 'Reativar' };
  return null;
}

/* ---------- a tela ---------- */

function explicacaoDaSituacao(l) {
  switch (l.situacao) {
    case 'cortesia': return 'Sua conta está liberada sem prazo e sem cobrança.';
    case 'teste': return `Tudo liberado até ${diaDe(l.ate)} — faltam ${dias(l.dias_restantes)}. Não pedimos cartão no teste e nada é cobrado sozinho no fim.`;
    case 'teste_encerrado': return 'O teste grátis terminou. Seus dados continuam guardados: você pode ver e exportar tudo. Para voltar a lançar, escolha um plano.';
    case 'ativa': return `Tudo liberado. ${l.proxima_cobranca || l.ate ? `Próxima cobrança em ${l.proxima_cobranca ? dataBr(l.proxima_cobranca) : diaDe(l.ate)}.` : ''}`;
    case 'atrasada': return `A última cobrança não foi paga. A conta segue liberada até ${diaDe(l.ate)}; depois disso fica só para consulta.`;
    case 'suspensa': return 'A cobrança ficou mais de 10 dias em aberto. Seus dados continuam guardados: você pode ver e exportar tudo. Para voltar a lançar, pague a fatura em aberto.';
    case 'cancelada': return `A renovação foi cancelada. O acesso completo vai até ${diaDe(l.ate)}; depois disso a conta fica só para consulta.`;
    default: return 'Sua assinatura terminou. Seus dados continuam guardados: você pode ver e exportar tudo. Para voltar a lançar, escolha um plano.';
  }
}

function desenharAssinatura() {
  const alvo = document.querySelector('#telaAssinatura');
  if (!alvo) return;
  if (!ass.dados) {
    alvo.innerHTML = ass.erro
      ? `<div class="lanc-falha"><div>${svg('alerta')}<span><b>Não consegui carregar a assinatura</b><small>${seguro(ass.erro)}</small></span></div><button id="assTentarDeNovo">Tentar de novo</button></div>`
      : '<div class="lanc-tabela"><div class="lanc-vazio">Carregando a sua assinatura…</div></div>';
    alvo.querySelector('#assTentarDeNovo')?.addEventListener('click', carregarLicenca);
    return;
  }
  const { licenca: l, planos, pagamentos } = ass.dados;
  const texto = TEXTO_DA_SITUACAO[l.situacao] || TEXTO_DA_SITUACAO.cortesia;
  const podeEscolher = ['teste', 'teste_encerrado', 'encerrada', 'cancelada'].includes(l.situacao) && !l.aguardando_pagamento;
  const emCurso = ['ativa', 'atrasada', 'suspensa'].includes(l.situacao);
  const precoDe = id => planos.find(p => p.id === id)?.preco_cents || 0;

  alvo.innerHTML = `
    <div class="lanc-head">
      <small>SUA CONTA</small>
      <h2>Assinatura</h2>
      <p>A situação da sua licença, os planos e os pagamentos.${ass.demo ? ' <b>Dados de demonstração.</b>' : ''}</p>
    </div>
    ${ass.erro ? `<div class="lanc-falha"><div>${svg('alerta')}<span><b>A informação pode estar desatualizada</b><small>${seguro(ass.erro)}</small></span></div><button id="assTentarDeNovo">Tentar de novo</button></div>` : ''}

    <section class="met-bloco lic-situacao ${texto.tom}">
      <div class="lic-situacao-topo">
        <span class="lic-selo ${texto.tom}">${texto.rotulo}</span>
        ${l.plano && emCurso ? `<b>${NOME_DO_PLANO[l.plano] || ''} · ${reais(precoDe(l.plano))} ${l.plano === 'anual' ? 'por ano' : 'por mês'}</b>` : ''}
      </div>
      <p>${explicacaoDaSituacao(l)}</p>
      ${l.aguardando_pagamento ? `
        <div class="lic-aguardando">
          <b>⏳ Falta pagar o ${(NOME_DO_PLANO[l.plano_pendente] || 'plano').toLowerCase()}</b>
          <span>A fatura abre em outra aba, na página segura do Asaas. Depois do pagamento, a liberação é automática e leva alguns instantes.</span>
          <div class="lic-acoes">
            ${l.fatura_pendente ? `<a class="lic-principal" href="${seguro(l.fatura_pendente)}" target="_blank" rel="noopener">Abrir a fatura para pagar</a>` : ''}
            <button id="assAtualizar">Já paguei — atualizar</button>
            <button class="lic-discreto" id="assDesistirPendente">Desistir desta contratação</button>
          </div>
        </div>` : ''}
      ${emCurso && !l.aguardando_pagamento ? `
        <div class="lic-acoes">
          ${l.fatura_pendente && l.situacao !== 'ativa' ? `<a class="lic-principal" href="${seguro(l.fatura_pendente)}" target="_blank" rel="noopener">Abrir a fatura em aberto</a><button id="assAtualizar">Já paguei — atualizar</button>` : ''}
          ${l.pode_desistir ? '<button id="assArrepender">Desistir e receber o dinheiro de volta</button>' : ''}
          <button class="lic-discreto" id="assCancelar">Cancelar a assinatura</button>
        </div>
        ${l.pode_desistir ? '<small class="lic-nota">Você está dentro dos 7 dias de arrependimento: se desistir agora, o valor pago é estornado por inteiro.</small>' : ''}` : ''}
    </section>

    ${podeEscolher ? `
    <section class="met-bloco">
      <div class="met-cabeca"><div><h3>💜 Escolha o seu plano</h3><p>Os dois têm todas as funções. Você cancela quando quiser, por aqui mesmo, sem falar com ninguém.</p></div></div>
      ${ass.dados.pode_contratar ? `
      <div class="lic-planos">
        ${planos.map(p => `
          <label class="lic-plano ${ass.plano === p.id ? 'escolhido' : ''}">
            <input type="radio" name="assPlano" value="${seguro(p.id)}" ${ass.plano === p.id ? 'checked' : ''}>
            ${p.id === 'anual' ? '<em>Melhor preço</em>' : ''}
            <b>${seguro(p.nome)}</b>
            <strong>${reais(p.preco_cents)}<small>${p.ciclo === 'yearly' ? ' por ano' : ' por mês'}</small></strong>
            <span>${p.ciclo === 'yearly' ? `Equivale a ${reais(Math.round(p.preco_cents / 12))} por mês.` : 'Renova todo mês.'}</span>
            <span>Pagamento por ${p.formas.map(f => FORMAS[f] || f).join(', ').replace(/, ([^,]*)$/, ' ou $1')}.</span>
          </label>`).join('')}
      </div>
      <div class="campos lic-campos">
        <label>Nome completo de quem vai pagar<input id="assNome" maxlength="100" autocomplete="name" placeholder="Como está no documento"></label>
        <label>CPF ou CNPJ<input id="assDocumento" maxlength="18" inputmode="numeric" autocomplete="off" placeholder="Só os números"></label>
      </div>
      <small class="lic-nota">O CPF é exigido para emitir a cobrança e vai direto para o Asaas, que processa o pagamento; não fica guardado no GFP. Os dados do cartão você digita na página do Asaas — o GFP nunca os vê.</small>
      <p class="lanc-erro" id="assErro"></p>
      <div class="lic-acoes">
        <button class="lic-principal" id="assContratar">Contratar e ir para o pagamento</button>
        <a href="termos.html" target="_blank" rel="noopener">Termos de Uso</a>
      </div>` : '<div class="lanc-vazio"><b>A contratação está indisponível no momento</b>Tente de novo mais tarde ou escreva para contato@viaiasolucoes.com.</div>'}
    </section>` : ''}

    <section class="met-bloco">
      <div class="met-cabeca"><div><h3>🧾 Pagamentos</h3><p>As últimas cobranças da sua assinatura.</p></div></div>
      ${pagamentos.length ? `<div class="emp-tabela-rolo"><table class="emp-tabela">
        <thead><tr><th>Vencimento</th><th>Plano</th><th class="num">Valor</th><th>Situação</th><th>Pago em</th><th></th></tr></thead>
        <tbody>${pagamentos.map(p => `<tr>
          <td>${p.due_date ? dataBr(p.due_date) : '—'}</td>
          <td>${seguro(NOME_DO_PLANO[p.plan_name] || '—')}</td>
          <td class="num">${reais(p.amount_cents)}</td>
          <td><span class="lic-selo ${p.status === 'confirmed' ? 'bom' : p.status === 'overdue' ? 'ruim' : p.status === 'pending' ? 'info' : ''}">${ESTADO_DO_PAGAMENTO[p.status] || seguro(p.status)}</span></td>
          <td>${p.paid_at ? diaDe(p.paid_at) : '—'}</td>
          <td>${p.invoice_url ? `<a href="${seguro(p.invoice_url)}" target="_blank" rel="noopener">${['pending', 'overdue'].includes(p.status) ? 'Pagar' : 'Ver fatura'}</a>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>`
        : '<div class="lanc-vazio">Nenhuma cobrança por enquanto.</div>'}
    </section>`;

  ligarEventosAssinatura(alvo);
}

/* ---------- ações ---------- */

async function contratar(tela) {
  if (ass.ocupado) return;
  const erro = tela.querySelector('#assErro');
  const nome = tela.querySelector('#assNome').value.trim();
  const documento = soNumeros(tela.querySelector('#assDocumento').value);
  if (nome.length < 3) return (erro.textContent = 'Informe o nome completo de quem vai pagar.');
  if (!documentoParece(documento)) return (erro.textContent = 'CPF ou CNPJ inválido. Confira os números.');
  erro.textContent = '';

  if (ass.demo) {
    ass.dados.licenca = { ...ass.dados.licenca, aguardando_pagamento: true, plano_pendente: ass.plano, fatura_pendente: null };
    notify('🟢 Contratação simulada — na conta de verdade a fatura abre em outra aba');
    return desenharAssinatura();
  }
  // A aba é aberta já no clique; aberta depois da resposta, o navegador bloqueia como pop-up.
  const aba = window.open('', '_blank');
  const botao = tela.querySelector('#assContratar');
  ass.ocupado = true; botao.disabled = true; botao.textContent = 'Preparando a fatura…';
  try {
    const r = await request('/billing/subscribe', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ plan: ass.plano, name: nome, cpfCnpj: documento }) });
    if (aba) aba.location = r.invoiceUrl;
    notify(aba ? '🟢 Fatura aberta em outra aba' : '🟢 Fatura pronta — use o botão para abrir');
    await carregarLicenca();
  } catch (falha) {
    if (aba) aba.close();
    botao.disabled = false; botao.textContent = 'Contratar e ir para o pagamento';
    erro.textContent = typeof mensagemAmigavel === 'function' ? mensagemAmigavel(falha.message) : falha.message;
  }
  ass.ocupado = false;
}

function confirmarAcao({ titulo, texto, botao, perigo, executar, sucesso }) {
  const fundo = abrirCaixa(`
    <div class="aviso"><i>!</i><div><h3>${titulo}</h3><p class="sub">${texto}</p></div></div>
    <p class="lanc-erro" id="assErroCaixa"></p>
    <div class="pe"><button data-fechar="1">Voltar</button><button class="${perigo ? 'perigo' : 'principal'}" id="assConfirmar">${botao}</button></div>`);
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  fundo.querySelector('#assConfirmar').addEventListener('click', async evento => {
    const confirmar = evento.currentTarget;
    confirmar.disabled = true;
    try {
      await executar();
      fecharCaixa();
      notify(sucesso);
      if (ass.demo) desenharAssinatura(); else await carregarLicenca();
      mostrarLicencaNaTela();
    } catch (falha) {
      confirmar.disabled = false;
      fundo.querySelector('#assErroCaixa').textContent = typeof mensagemAmigavel === 'function' ? mensagemAmigavel(falha.message) : falha.message;
    }
  });
}

function ligarEventosAssinatura(tela) {
  const l = ass.dados.licenca;
  tela.querySelector('#assTentarDeNovo')?.addEventListener('click', carregarLicenca);
  tela.querySelector('#assAtualizar')?.addEventListener('click', async () => {
    await carregarLicenca();
    notify(ass.dados.licenca.aguardando_pagamento || ['atrasada', 'suspensa'].includes(ass.dados.licenca.situacao)
      ? '🟡 O pagamento ainda não foi confirmado — pode levar alguns instantes' : '🟢 Assinatura atualizada');
  });
  tela.querySelectorAll('input[name="assPlano"]').forEach(opcao => opcao.addEventListener('change', () => {
    ass.plano = opcao.value;
    // guarda o que já foi digitado antes de redesenhar
    const nome = tela.querySelector('#assNome')?.value, documento = tela.querySelector('#assDocumento')?.value;
    desenharAssinatura();
    const nova = document.querySelector('#telaAssinatura');
    if (nova.querySelector('#assNome')) { nova.querySelector('#assNome').value = nome || ''; nova.querySelector('#assDocumento').value = documento || ''; }
  }));
  tela.querySelector('#assContratar')?.addEventListener('click', () => contratar(tela));
  tela.querySelector('#assDesistirPendente')?.addEventListener('click', () => confirmarAcao({
    titulo: 'Desistir desta contratação?', texto: 'A fatura em aberto é cancelada e nada é cobrado. Você pode escolher outro plano em seguida.',
    botao: 'Desistir da contratação', perigo: false, sucesso: '🟢 Contratação desfeita',
    executar: async () => {
      if (ass.demo) { ass.dados.licenca = { ...ass.dados.licenca, aguardando_pagamento: false, plano_pendente: null }; return; }
      await request('/billing/cancel', { method: 'POST', headers: authHeaders() });
    }
  }));
  tela.querySelector('#assCancelar')?.addEventListener('click', () => confirmarAcao({
    titulo: 'Cancelar a assinatura?',
    texto: `As renovações param agora. ${l.situacao === 'ativa' ? `O acesso completo continua até ${diaDe(l.ate)}, fim do período já pago.` : 'A conta fica só para consulta.'} Seus dados continuam guardados e você pode voltar quando quiser.`,
    botao: 'Cancelar a assinatura', perigo: true, sucesso: '🟢 Assinatura cancelada',
    executar: () => request('/billing/cancel', { method: 'POST', headers: authHeaders() })
  }));
  tela.querySelector('#assArrepender')?.addEventListener('click', () => confirmarAcao({
    titulo: 'Desistir e receber o dinheiro de volta?',
    texto: 'O valor pago é estornado por inteiro pela operadora — o prazo para aparecer na fatura ou na conta é o dela. A assinatura termina agora e a conta fica só para consulta.',
    botao: 'Desistir e pedir o estorno', perigo: true, sucesso: '🟢 Estorno solicitado',
    executar: () => request('/billing/refund', { method: 'POST', headers: authHeaders() })
  }));
}

/* ---------- entrada na tela ---------- */

function abrirTelaAssinatura() {
  [...document.body.classList].filter(nome => nome.startsWith('tela-')).forEach(nome => document.body.classList.remove(nome));
  document.body.classList.add('tela-assinatura');
  document.querySelectorAll('.sidebar nav button').forEach(botao =>
    botao.classList.toggle('active', botao.dataset.tela === 'assinatura'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  desenharAssinatura();
  carregarLicenca();
}
function fecharTelaAssinatura() {
  document.body.classList.remove('tela-assinatura');
  mostrarLicencaNaTela();
}
window.abrirTelaAssinatura = abrirTelaAssinatura;

document.querySelector('[data-tela="assinatura"]')?.addEventListener('click', abrirTelaAssinatura);
document.querySelectorAll('.sidebar nav button:not([data-tela="assinatura"])').forEach(botao =>
  botao.addEventListener('click', fecharTelaAssinatura));
// o selo da barra lateral leva à Assinatura, menos no botão da versão
document.querySelector('.sidebar .license')?.addEventListener('click', evento => {
  if (!evento.target.closest('[data-versao]')) abrirTelaAssinatura();
});

/* A licença acompanha a sessão: ao entrar, sair ou abrir a demonstração ela é lida de novo. */
let sessaoDaLicenca = null;
setInterval(() => {
  const atual = `${sessionStorage.getItem('gfp_token') || ''}|${window.demoMode ? 1 : 0}`;
  if (atual === sessaoDaLicenca) return;
  sessaoDaLicenca = atual;
  if (atual !== '|0') { ass.dados = null; carregarLicenca(); }
}, 1500);

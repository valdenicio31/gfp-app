/* Cadastros do GFP Familiar: contas, bancos e agências, fornecedores e clientes,
   e categorias. Tudo livre para o usuário incluir, alterar e apagar.
   Renomear no cadastro arrasta os lançamentos, então nunca ficam dois nomes. */

const cad = {
  aba: 'contas',
  contas: [], bancos: [], parceiros: [], categorias: [],
  carregando: false, erro: '', demo: false
};

const ABAS = {
  contas: { rotulo: 'Contas', icone: '🏦' },
  bancos: { rotulo: 'Bancos e agências', icone: '🏛️' },
  parceiros: { rotulo: 'Fornecedores e clientes', icone: '🤝' },
  categorias: { rotulo: 'Categorias', icone: '🏷️' }
};
const TIPOS_CONTA = { checking: 'Conta corrente', savings: 'Poupança', cash: 'Dinheiro', investment: 'Investimento' };
const TIPOS_PARCEIRO = { supplier: 'Fornecedor', client: 'Cliente', both: 'Fornecedor e cliente' };
const TIPOS_CATEGORIA = { expense: 'Despesa', income: 'Receita', both: 'Receita e despesa' };

/* ---------- dados ---------- */

function cadastrosDemonstracao() {
  cad.categorias = CATEGORIAS_PADRAO_DEMO.map((c, i) => ({ id: `demo-cat-${i}`, ...c, usos: 0, is_default: true }));
  cad.bancos = [
    { id: 'demo-banco-1', name: 'Nubank', code: '260', branches: [{ id: 'demo-ag-1', bank_id: 'demo-banco-1', number: '0001', name: 'Agência digital', contas: 1 }] },
    { id: 'demo-banco-2', name: 'Itaú', code: '341', branches: [{ id: 'demo-ag-2', bank_id: 'demo-banco-2', number: '1234', name: 'Centro', contas: 1 }] }
  ];
  cad.parceiros = [
    { id: 'demo-p-1', name: 'Assaí Atacadista', kind: 'supplier', document: '06.057.223/0001-71', category: 'Alimentação', match_terms: 'assai; assaí atacadista', usos: 2 },
    { id: 'demo-p-2', name: 'Posto Ipiranga', kind: 'supplier', document: null, category: 'Transporte', match_terms: 'ipiranga; posto ipiranga', usos: 1 },
    { id: 'demo-p-3', name: 'ViaIA Soluções', kind: 'client', document: null, category: 'Outros', match_terms: 'viaia', usos: 3 }
  ];
  cad.contas = lanc.contas.length ? lanc.contas.map(c => ({ ...c, bank_name: c.bank_name || null })) : [];
}

const CATEGORIAS_PADRAO_DEMO = [
  { name: 'Alimentação', kind: 'expense', emoji: '🍽️', color: '#9a6500', background: '#fff5d8' },
  { name: 'Casa', kind: 'expense', emoji: '🏠', color: '#0b4a8f', background: '#e8f4ff' },
  { name: 'Educação', kind: 'expense', emoji: '🎓', color: '#6b21a8', background: '#f3e8ff' },
  { name: 'Lazer', kind: 'expense', emoji: '🎉', color: '#9d1a7f', background: '#ffeafc' },
  { name: 'Saúde', kind: 'expense', emoji: '⚕️', color: '#9f1239', background: '#ffeef0' },
  { name: 'Transporte', kind: 'expense', emoji: '🚗', color: '#3730a3', background: '#eef2ff' },
  { name: 'Outros', kind: 'both', emoji: '📦', color: '#08762d', background: '#ecfff2' }
];

async function carregarCadastros() {
  cad.carregando = true;
  cad.erro = '';
  desenharCadastros();
  try {
    if (window.demoMode || !sessionStorage.getItem('gfp_token')) {
      cad.demo = true;
      cadastrosDemonstracao();
    } else {
      cad.demo = false;
      const [contas, bancos, parceiros, categorias] = await Promise.all([
        request('/accounts?scope=family', { headers: authHeaders(), cache: 'no-store' }),
        request('/banks', { headers: authHeaders(), cache: 'no-store' }),
        request('/partners', { headers: authHeaders(), cache: 'no-store' }),
        request('/categories', { headers: authHeaders(), cache: 'no-store' })
      ]);
      cad.contas = contas || []; cad.bancos = bancos || [];
      cad.parceiros = parceiros || []; cad.categorias = categorias || [];
      lanc.contas = cad.contas;
      lanc.categorias = cad.categorias;
    }
  } catch (falha) {
    cad.erro = typeof mensagemAmigavel === 'function' ? mensagemAmigavel(falha.message) : falha.message;
  }
  cad.carregando = false;
  desenharCadastros();
}

/* ---------- desenho ---------- */

function desenharCadastros() {
  const alvo = document.querySelector('#telaCadastros');
  if (!alvo) return;
  alvo.innerHTML = `
    <div class="lanc-head">
      <small>CENTRAL DE CADASTROS</small>
      <h2>Cadastros</h2>
      <p>Suas contas, bancos, agências, fornecedores, clientes e categorias — tudo livre para incluir, alterar e apagar.${cad.demo ? ' <b>Dados de demonstração.</b>' : ''}</p>
    </div>

    ${cad.erro ? `<div class="lanc-falha"><div>${svg('alerta')}<span><b>Não consegui carregar os cadastros</b><small>${seguro(cad.erro)}</small></span></div><button id="cadTentarDeNovo">Tentar de novo</button></div>` : ''}

    <div class="cad-abas">
      ${Object.entries(ABAS).map(([chave, aba]) => `
        <button class="${cad.aba === chave ? 'ativa' : ''}" data-aba="${chave}">${aba.icone} ${aba.rotulo}
          <i>${quantosNaAba(chave)}</i></button>`).join('')}
      <button class="cad-novo" id="cadNovo">${svg('mais', 'ico-s')}${rotuloDoNovo()}</button>
    </div>

    <div class="lanc-tabela">${cad.carregando ? '<div class="lanc-vazio">Carregando…</div>' : desenharAba()}</div>`;

  ligarEventosCadastros();
}

const quantosNaAba = chave => chave === 'bancos'
  ? cad.bancos.length
  : (cad[chave] || []).length;

const rotuloDoNovo = () => ({ contas: 'Nova conta', bancos: 'Novo banco', parceiros: 'Novo cadastro', categorias: 'Nova categoria' })[cad.aba];

function desenharAba() {
  if (cad.aba === 'contas') return desenharContas();
  if (cad.aba === 'bancos') return desenharBancos();
  if (cad.aba === 'parceiros') return desenharParceiros();
  return desenharCategorias();
}

const vazio = (titulo, dica) => `<div class="lanc-vazio"><b>${titulo}</b>${dica}</div>`;

function desenharContas() {
  if (!cad.contas.length) return vazio('Nenhuma conta cadastrada', 'Use “Nova conta” para incluir a conta do banco que você usa.');
  return `
    <div class="cad-linha cabecalho contas"><span>Conta</span><span>Tipo</span><span>Banco · agência · número</span><span>Visibilidade</span><span style="text-align:right">Saldo</span><span></span></div>
    ${cad.contas.map(conta => `
      <div class="cad-linha contas">
        <span class="cad-nome">${seguro(conta.name)}</span>
        <span class="cad-sub">${seguro(TIPOS_CONTA[conta.type] || conta.type || '—')}</span>
        <span class="cad-sub">${conta.bank_name
          ? `${seguro(conta.bank_name)}${conta.branch_number ? ` · ag. ${seguro(conta.branch_number)}` : ''}${conta.account_number ? ` · ${seguro(conta.account_number)}` : ''}`
          : '<em>sem banco vinculado</em>'}</span>
        <span class="cad-sub">${conta.is_private ? '🔒 só minha' : '👨‍👩‍👧‍👦 da família'}</span>
        <span class="lanc-valor ${Number(conta.balance_cents) < 0 ? 'saida' : 'entrada'}">${conta.balance_cents === undefined ? '—' : reais(conta.balance_cents)}</span>
        <span class="lanc-acoes">
          <button data-editar-conta="${seguro(conta.id)}" title="Alterar">${svg('lapis', 'ico-s')}</button>
          <button class="remover" data-apagar-conta="${seguro(conta.id)}" title="Apagar">${svg('lixeira', 'ico-s')}</button>
        </span>
      </div>`).join('')}`;
}

function desenharBancos() {
  if (!cad.bancos.length) return vazio('Nenhum banco cadastrado', 'Cadastre o banco e depois as agências que a família usa.');
  return cad.bancos.map(banco => `
    <div class="cad-banco">
      <div class="cad-banco-topo">
        <b>${seguro(banco.name)}</b>
        ${banco.code ? `<span class="cad-codigo">código ${seguro(banco.code)}</span>` : ''}
        <span class="cad-sub">${banco.branches.length === 1 ? '1 agência' : `${banco.branches.length} agências`}</span>
        <span class="lanc-acoes">
          <button data-nova-agencia="${seguro(banco.id)}" title="Nova agência">${svg('mais', 'ico-s')}</button>
          <button data-editar-banco="${seguro(banco.id)}" title="Alterar">${svg('lapis', 'ico-s')}</button>
          <button class="remover" data-apagar-banco="${seguro(banco.id)}" title="Apagar">${svg('lixeira', 'ico-s')}</button>
        </span>
      </div>
      ${banco.branches.length ? banco.branches.map(agencia => `
        <div class="cad-agencia">
          <span>Agência ${seguro(agencia.number)}${agencia.name ? ` — ${seguro(agencia.name)}` : ''}</span>
          <span class="cad-sub">${agencia.contas === 1 ? '1 conta' : `${agencia.contas || 0} contas`}</span>
          <span class="lanc-acoes"><button class="remover" data-apagar-agencia="${seguro(agencia.id)}" title="Apagar agência">${svg('lixeira', 'ico-s')}</button></span>
        </div>`).join('') : '<div class="cad-agencia vazia">Nenhuma agência cadastrada neste banco</div>'}
    </div>`).join('');
}

function desenharParceiros() {
  if (!cad.parceiros.length) return vazio('Nenhum fornecedor ou cliente cadastrado', 'Cadastre quem você paga e quem te paga — os termos de reconhecimento classificam o extrato sozinho.');
  return `
    <div class="cad-linha cabecalho parceiros"><span>Nome</span><span>Tipo</span><span>CNPJ / CPF</span><span>Categoria</span><span>Reconhece no extrato por</span><span style="text-align:right">Lanç.</span><span></span></div>
    ${cad.parceiros.map(parceiro => `
      <div class="cad-linha parceiros">
        <span class="cad-nome">${seguro(parceiro.name)}</span>
        <span class="cad-sub">${seguro(TIPOS_PARCEIRO[parceiro.kind] || parceiro.kind)}</span>
        <span class="cad-sub num">${seguro(parceiro.document || '—')}</span>
        <span>${parceiro.category ? chipDaCategoria(parceiro.category) : '<span class="cad-sub">—</span>'}</span>
        <span class="cad-termos">${parceiro.match_terms ? seguro(parceiro.match_terms) : '<em>só pelo nome</em>'}</span>
        <span class="cad-sub num" style="text-align:right">${parceiro.usos ?? 0}</span>
        <span class="lanc-acoes">
          <button data-editar-parceiro="${seguro(parceiro.id)}" title="Alterar">${svg('lapis', 'ico-s')}</button>
          <button class="remover" data-apagar-parceiro="${seguro(parceiro.id)}" title="Apagar">${svg('lixeira', 'ico-s')}</button>
        </span>
      </div>`).join('')}`;
}

function desenharCategorias() {
  if (!cad.categorias.length) return vazio('Nenhuma categoria cadastrada', 'Use “Nova categoria” para começar.');
  return `
    <div class="cad-linha cabecalho categorias"><span>Categoria</span><span>Serve para</span><span>Cores</span><span style="text-align:right">Lanç.</span><span></span></div>
    ${cad.categorias.map(categoria => `
      <div class="cad-linha categorias">
        <span>${chipDaCategoria(categoria.name, categoria)}</span>
        <span class="cad-sub">${seguro(TIPOS_CATEGORIA[categoria.kind] || categoria.kind)}</span>
        <span class="cad-cores"><i style="background:${seguro(categoria.background || '#f1eef8')}"></i><i style="background:${seguro(categoria.color || '#5b5169')}"></i>${categoria.is_default ? '<small>padrão</small>' : ''}</span>
        <span class="cad-sub num" style="text-align:right">${categoria.usos ?? 0}</span>
        <span class="lanc-acoes">
          <button data-editar-categoria="${seguro(categoria.id)}" title="Alterar">${svg('lapis', 'ico-s')}</button>
          <button class="remover" data-apagar-categoria="${seguro(categoria.id)}" title="Apagar">${svg('lixeira', 'ico-s')}</button>
        </span>
      </div>`).join('')}`;
}

// Chip da categoria usando a cor cadastrada pelo usuário.
function chipDaCategoria(nome, categoria) {
  const dados = categoria || cad.categorias.find(c => c.name === nome) || {};
  const estilo = `background:${dados.background || '#f1eef8'};color:${dados.color || '#5b5169'}`;
  return `<span class="chip" style="${estilo}">${dados.emoji ? `${seguro(dados.emoji)} ` : ''}${seguro(nome)}</span>`;
}

/* ---------- formulários ---------- */

const campo = (id, rotulo, valor = '', extra = '') => `<label>${rotulo}<input id="${id}" value="${seguro(valor)}" ${extra}></label>`;
const escolha = (id, rotulo, opcoes, atual) => `<label>${rotulo}<select id="${id}">${Object.entries(opcoes).map(([chave, texto]) => `<option value="${chave}" ${chave === atual ? 'selected' : ''}>${texto}</option>`).join('')}</select></label>`;

async function salvar(caminho, corpo, metodo = 'POST') {
  if (cad.demo) { notify('🟡 No modo demonstração o cadastro não é gravado'); return true; }
  await request(caminho, { method: metodo, headers: authHeaders(), body: JSON.stringify(corpo) });
  return true;
}

function caixaDeFormulario(titulo, sub, campos, aoSalvar, textoBotao = 'Salvar') {
  const fundo = abrirCaixa(`
    <div><h3>${titulo}</h3>${sub ? `<p class="sub">${sub}</p>` : ''}</div>
    <div class="campos">${campos}</div>
    <p class="lanc-erro" id="cadErro"></p>
    <div class="pe"><button data-fechar="1">Cancelar</button><button class="principal" id="cadSalvar">${textoBotao}</button></div>`);
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  const botao = fundo.querySelector('#cadSalvar');
  botao.addEventListener('click', async () => {
    const erro = fundo.querySelector('#cadErro');
    erro.textContent = '';
    botao.disabled = true;
    try {
      const feito = await aoSalvar(fundo);
      if (feito === false) { botao.disabled = false; return; }
      fecharCaixa();
      await carregarCadastros();
      if (typeof carregarLancamentos === 'function' && document.body.classList.contains('tela-lancamentos')) carregarLancamentos();
    } catch (falha) {
      botao.disabled = false;
      erro.textContent = falha.message;
    }
  });
  return fundo;
}

function formConta(conta) {
  const agencias = cad.bancos.flatMap(b => b.branches.map(a => [a.id, `${b.name} · ag. ${a.number}`]));
  caixaDeFormulario(conta ? 'Alterar conta' : 'Nova conta', 'A conta é onde os lançamentos entram. Vincular banco e agência é opcional.',
    `${campo('cadNome', 'Nome da conta', conta?.name || '', 'maxlength="80" placeholder="Ex.: Nubank · corrente"')}
     ${escolha('cadTipo', 'Tipo', TIPOS_CONTA, conta?.type || 'checking')}
     <label>Banco<select id="cadBanco"><option value="">(sem banco)</option>${cad.bancos.map(b => `<option value="${seguro(b.id)}" ${conta?.bank_id === b.id ? 'selected' : ''}>${seguro(b.name)}</option>`).join('')}</select></label>
     <label>Agência<select id="cadAgencia"><option value="">(sem agência)</option>${agencias.map(([id, texto]) => `<option value="${seguro(id)}" ${conta?.branch_id === id ? 'selected' : ''}>${seguro(texto)}</option>`).join('')}</select></label>
     ${campo('cadNumero', 'Número da conta', conta?.account_number || '', 'maxlength="30" placeholder="Ex.: 12345-6"')}
     ${conta ? '' : campo('cadSaldo', 'Saldo inicial (R$)', '0', 'type="number" step="0.01"')}
     <label class="largo cad-checkbox"><input type="checkbox" id="cadPrivada" ${conta?.is_private ? 'checked' : ''}>Conta só minha (não aparece para o resto da família)</label>`,
    async fundo => {
      const nome = fundo.querySelector('#cadNome').value.trim();
      if (nome.length < 2) { fundo.querySelector('#cadErro').textContent = 'Dê um nome com pelo menos 2 letras.'; return false; }
      const dados = {
        name: nome,
        type: fundo.querySelector('#cadTipo').value,
        bankId: fundo.querySelector('#cadBanco').value || null,
        branchId: fundo.querySelector('#cadAgencia').value || null,
        accountNumber: fundo.querySelector('#cadNumero').value.trim() || null,
        isPrivate: fundo.querySelector('#cadPrivada').checked
      };
      if (conta) return salvar(`/accounts/${conta.id}`, dados, 'PATCH');
      const saldo = Math.round(Number(String(fundo.querySelector('#cadSaldo').value).replace(',', '.')) * 100) || 0;
      return salvar('/accounts', { ...dados, balanceCents: saldo });
    });
}

function formBanco(banco) {
  caixaDeFormulario(banco ? 'Alterar banco' : 'Novo banco', 'O código é o número do banco (260 Nubank, 341 Itaú, 001 Banco do Brasil…).',
    `${campo('cadNome', 'Nome do banco', banco?.name || '', 'maxlength="80" placeholder="Ex.: Nubank"')}
     ${campo('cadCodigo', 'Código (opcional)', banco?.code || '', 'maxlength="10" placeholder="Ex.: 260"')}`,
    async fundo => {
      const nome = fundo.querySelector('#cadNome').value.trim();
      if (nome.length < 2) { fundo.querySelector('#cadErro').textContent = 'Informe o nome do banco.'; return false; }
      const dados = { name: nome, code: fundo.querySelector('#cadCodigo').value.trim() || null };
      return banco ? salvar(`/banks/${banco.id}`, dados, 'PATCH') : salvar('/banks', dados);
    });
}

function formAgencia(bancoId) {
  const banco = cad.bancos.find(b => b.id === bancoId);
  caixaDeFormulario('Nova agência', `Agência do banco ${seguro(banco?.name || '')}.`,
    `${campo('cadNumero', 'Número da agência', '', 'maxlength="20" placeholder="Ex.: 0001"')}
     ${campo('cadNome', 'Nome (opcional)', '', 'maxlength="80" placeholder="Ex.: Centro"')}`,
    async fundo => {
      const numero = fundo.querySelector('#cadNumero').value.trim();
      if (!numero) { fundo.querySelector('#cadErro').textContent = 'Informe o número da agência.'; return false; }
      return salvar('/bank-branches', { bankId: bancoId, number: numero, name: fundo.querySelector('#cadNome').value.trim() || null });
    });
}

function formParceiro(parceiro) {
  caixaDeFormulario(parceiro ? 'Alterar cadastro' : 'Novo fornecedor ou cliente',
    'Os termos de reconhecimento são o que aparece na descrição do extrato, separados por ponto e vírgula. Com eles a importação classifica sozinha.',
    `${campo('cadNome', 'Nome', parceiro?.name || '', 'maxlength="120" placeholder="Ex.: Assaí Atacadista"')}
     ${escolha('cadTipo', 'Tipo', TIPOS_PARCEIRO, parceiro?.kind || 'supplier')}
     ${campo('cadDocumento', 'CNPJ ou CPF (opcional)', parceiro?.document || '', 'maxlength="20" placeholder="00.000.000/0000-00"')}
     <label>Categoria dos lançamentos<select id="cadCategoria"><option value="">(sem categoria)</option>${cad.categorias.map(c => `<option ${parceiro?.category === c.name ? 'selected' : ''}>${seguro(c.name)}</option>`).join('')}</select></label>
     <label class="largo">Reconhece no extrato por<input id="cadTermos" value="${seguro(parceiro?.match_terms || '')}" maxlength="600" placeholder="assai; assaí atacadista; atacadista assai"></label>`,
    async fundo => {
      const nome = fundo.querySelector('#cadNome').value.trim();
      if (nome.length < 2) { fundo.querySelector('#cadErro').textContent = 'Informe o nome.'; return false; }
      const dados = {
        name: nome,
        kind: fundo.querySelector('#cadTipo').value,
        document: fundo.querySelector('#cadDocumento').value.trim() || null,
        category: fundo.querySelector('#cadCategoria').value || null,
        matchTerms: fundo.querySelector('#cadTermos').value.trim() || null
      };
      return parceiro ? salvar(`/partners/${parceiro.id}`, dados, 'PATCH') : salvar('/partners', dados);
    });
}

const CORES_SUGERIDAS = [['#9a6500', '#fff5d8'], ['#0b4a8f', '#e8f4ff'], ['#6b21a8', '#f3e8ff'], ['#9d1a7f', '#ffeafc'],
  ['#9f1239', '#ffeef0'], ['#3730a3', '#eef2ff'], ['#08762d', '#ecfff2'], ['#5b5169', '#f1eef8']];

function formCategoria(categoria) {
  caixaDeFormulario(categoria ? 'Alterar categoria' : 'Nova categoria',
    'O nome é o que aparece nos lançamentos e nos filtros. Renomear aqui renomeia em todos os lançamentos.',
    `${campo('cadNome', 'Nome', categoria?.name || '', 'maxlength="40" placeholder="Ex.: Pets"')}
     ${escolha('cadTipo', 'Serve para', TIPOS_CATEGORIA, categoria?.kind || 'expense')}
     ${campo('cadEmoji', 'Ícone (opcional)', categoria?.emoji || '', 'maxlength="4" placeholder="🐶"')}
     <label>Cores
       <select id="cadCores">${CORES_SUGERIDAS.map(([cor, fundo], i) =>
         `<option value="${cor}|${fundo}" ${categoria?.color === cor ? 'selected' : ''}>Combinação ${i + 1}</option>`).join('')}</select>
     </label>`,
    async fundo => {
      const nome = fundo.querySelector('#cadNome').value.trim();
      if (nome.length < 2) { fundo.querySelector('#cadErro').textContent = 'Informe o nome da categoria.'; return false; }
      const [cor, fundoCor] = fundo.querySelector('#cadCores').value.split('|');
      const dados = { name: nome, kind: fundo.querySelector('#cadTipo').value, emoji: fundo.querySelector('#cadEmoji').value.trim() || null, color: cor, background: fundoCor };
      return categoria ? salvar(`/categories/${categoria.id}`, dados, 'PATCH') : salvar('/categories', dados);
    });
}

/* ---------- exclusões ---------- */

async function apagar(caminho, nome, aoConfirmar) {
  const fundo = abrirCaixa(`
    <div class="aviso"><i>!</i><div><h3>Apagar ${seguro(nome)}?</h3><p class="sub">Essa ação não volta atrás.</p></div></div>
    <p class="lanc-erro" id="cadErro"></p>
    <div class="pe"><button data-fechar="1">Cancelar</button><button class="perigo" id="cadConfirmar">${svg('lixeira', 'ico-s')}Apagar</button></div>`);
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  fundo.querySelector('#cadConfirmar').addEventListener('click', async () => {
    const botao = fundo.querySelector('#cadConfirmar');
    botao.disabled = true;
    try {
      if (cad.demo) { notify('🟡 No modo demonstração nada é apagado de verdade'); fecharCaixa(); return; }
      await request(caminho, { method: 'DELETE', headers: authHeaders() });
      fecharCaixa();
      notify(`🟢 ${nome} apagado`);
      await carregarCadastros();
    } catch (falha) {
      botao.disabled = false;
      if (aoConfirmar) return aoConfirmar(falha, fundo);
      fundo.querySelector('#cadErro').textContent = falha.message;
    }
  });
  return fundo;
}

// Categoria em uso precisa dizer para onde vão os lançamentos.
function apagarCategoria(categoria) {
  if (!categoria.usos) return apagar(`/categories/${categoria.id}`, categoria.name);
  const outras = cad.categorias.filter(c => c.id !== categoria.id);
  caixaDeFormulario(`Apagar a categoria ${categoria.name}`,
    `${categoria.usos === 1 ? 'Existe 1 lançamento' : `Existem ${categoria.usos} lançamentos`} nesta categoria. Escolha para onde eles vão.`,
    `<label class="largo">Mover os lançamentos para
       <select id="cadDestino"><option value="">(deixar sem categoria)</option>${outras.map(c => `<option>${seguro(c.name)}</option>`).join('')}</select></label>`,
    async fundo => {
      if (cad.demo) { notify('🟡 No modo demonstração nada é apagado de verdade'); return true; }
      const destino = fundo.querySelector('#cadDestino').value;
      await request(`/categories/${categoria.id}?reassignTo=${encodeURIComponent(destino)}`, { method: 'DELETE', headers: authHeaders() });
      notify(`🟢 Categoria apagada${destino ? ` e ${categoria.usos} ${categoria.usos === 1 ? 'lançamento movido' : 'lançamentos movidos'} para ${destino}` : ''}`);
      return true;
    }, 'Apagar categoria');
}

/* ---------- eventos ---------- */

function ligarEventosCadastros() {
  const tela = document.querySelector('#telaCadastros');
  tela.querySelectorAll('[data-aba]').forEach(botao => botao.addEventListener('click', () => {
    cad.aba = botao.dataset.aba;
    desenharCadastros();
  }));
  tela.querySelector('#cadTentarDeNovo')?.addEventListener('click', carregarCadastros);
  tela.querySelector('#cadNovo').addEventListener('click', () => {
    if (cad.aba === 'contas') return formConta(null);
    if (cad.aba === 'bancos') return formBanco(null);
    if (cad.aba === 'parceiros') return formParceiro(null);
    return formCategoria(null);
  });

  const achar = (lista, id) => cad[lista].find(item => item.id === id);
  tela.querySelectorAll('[data-editar-conta]').forEach(b => b.addEventListener('click', () => formConta(achar('contas', b.dataset.editarConta))));
  tela.querySelectorAll('[data-apagar-conta]').forEach(b => b.addEventListener('click', () => {
    const conta = achar('contas', b.dataset.apagarConta);
    apagar(`/accounts/${conta.id}`, conta.name);
  }));
  tela.querySelectorAll('[data-editar-banco]').forEach(b => b.addEventListener('click', () => formBanco(achar('bancos', b.dataset.editarBanco))));
  tela.querySelectorAll('[data-apagar-banco]').forEach(b => b.addEventListener('click', () => {
    const banco = achar('bancos', b.dataset.apagarBanco);
    apagar(`/banks/${banco.id}`, banco.name);
  }));
  tela.querySelectorAll('[data-nova-agencia]').forEach(b => b.addEventListener('click', () => formAgencia(b.dataset.novaAgencia)));
  tela.querySelectorAll('[data-apagar-agencia]').forEach(b => b.addEventListener('click', () => {
    const agencia = cad.bancos.flatMap(banco => banco.branches).find(a => a.id === b.dataset.apagarAgencia);
    apagar(`/bank-branches/${agencia.id}`, `agência ${agencia.number}`);
  }));
  tela.querySelectorAll('[data-editar-parceiro]').forEach(b => b.addEventListener('click', () => formParceiro(achar('parceiros', b.dataset.editarParceiro))));
  tela.querySelectorAll('[data-apagar-parceiro]').forEach(b => b.addEventListener('click', () => {
    const parceiro = achar('parceiros', b.dataset.apagarParceiro);
    apagar(`/partners/${parceiro.id}`, parceiro.name);
  }));
  tela.querySelectorAll('[data-editar-categoria]').forEach(b => b.addEventListener('click', () => formCategoria(achar('categorias', b.dataset.editarCategoria))));
  tela.querySelectorAll('[data-apagar-categoria]').forEach(b => b.addEventListener('click', () => apagarCategoria(achar('categorias', b.dataset.apagarCategoria))));
}

/* ---------- entrada na tela ---------- */

function abrirTelaCadastros() {
  document.body.classList.remove('tela-lancamentos');
  document.body.classList.add('tela-cadastros');
  document.querySelectorAll('.sidebar nav button').forEach(botao =>
    botao.classList.toggle('active', botao.dataset.tela === 'cadastros'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  carregarCadastros();
}
function fecharTelaCadastros() {
  document.body.classList.remove('tela-cadastros');
}
window.abrirTelaCadastros = abrirTelaCadastros;

document.querySelector('[data-tela="cadastros"]')?.addEventListener('click', abrirTelaCadastros);
document.querySelectorAll('.sidebar nav button:not([data-tela="cadastros"])').forEach(botao =>
  botao.addEventListener('click', fecharTelaCadastros));

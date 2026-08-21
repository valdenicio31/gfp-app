/* Importação de extrato do GFP Familiar.
   Passo 1: escolher o arquivo e a conta. Passo 2: conferir a prévia, com
   fornecedor e categoria sugeridos e os repetidos já desmarcados.
   Passo 3: converter em lançamentos. Usa v2-extrato.js e v2-fornecedores.js. */

const imp = {
  nomeArquivo: '', formato: '', avisos: [], linhas: [], contaId: '',
  marcadas: new Set(), erro: '', ocupado: false, mostrar: 300
};

const TIPOS_ACEITOS = '.ofx,.csv,.txt,.tsv,.qfx,text/csv,text/plain';

async function textoDoArquivo(arquivo) {
  const bytes = await arquivo.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // extratos brasileiros antigos vêm em Windows-1252
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function contasDisponiveis() {
  if (lanc.contas.length) return lanc.contas;
  return [...new Map(lanc.itens.map(t => [t.account_id, { id: t.account_id, name: t.account_name }])).values()];
}

// "extrato-nubank-agosto.csv" já diz para qual conta vai.
function contaPeloNomeDoArquivo(nomeArquivo) {
  const alvo = String(nomeArquivo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const limpo = nome => String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  for (const conta of contasDisponiveis()) {
    const primeira = limpo(conta.name).split(/[^a-z0-9]+/).filter(p => p.length >= 4)[0];
    if (primeira && alvo.includes(primeira)) return conta.id;
  }
  return '';
}

/* ---------- passo 1: arquivo e conta ---------- */

function abrirImportacao() {
  imp.nomeArquivo = ''; imp.linhas = []; imp.avisos = []; imp.erro = '';
  imp.marcadas = new Set(); imp.mostrar = 300;
  const contas = contasDisponiveis();
  imp.contaId = imp.contaId || contas[0]?.id || '';

  const fundo = abrirCaixa(`
    <div><h3>Importar extrato de qualquer banco</h3>
      <p class="sub">Serve o arquivo que o seu banco exporta: OFX, CSV, TXT ou planilha salva como CSV.</p></div>
    <label class="imp-solta" for="impArquivo">
      ${svg('entra')}
      <b>Escolher o arquivo do extrato</b>
      <small>Nubank, Inter, Itaú, Mercado Pago, PagBank e qualquer outro — eu descubro o formato sozinho</small>
      <input id="impArquivo" type="file" accept="${TIPOS_ACEITOS}" hidden>
    </label>
    <div class="campos">
      <label class="largo">Conta que recebe os lançamentos
        <select id="impConta">${contas.map(conta => `<option value="${seguro(conta.id)}" ${conta.id === imp.contaId ? 'selected' : ''}>${seguro(conta.name)}</option>`).join('')}</select>
      </label>
    </div>
    <p class="lanc-erro" id="impErro"></p>
    <div class="pe"><button data-fechar="1">Cancelar</button></div>`);

  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  fundo.querySelector('#impConta').addEventListener('change', evento => { imp.contaId = evento.target.value; });
  fundo.querySelector('#impArquivo').addEventListener('change', async evento => {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    if (arquivo.size > 8 * 1024 * 1024) {
      fundo.querySelector('#impErro').textContent = 'Arquivo muito grande (máximo 8 MB). Exporte um período menor.';
      return;
    }
    imp.contaId = fundo.querySelector('#impConta').value;
    await prepararPrevia(arquivo);
  });
}

/* ---------- passo 2: prévia ---------- */

async function prepararPrevia(arquivo) {
  imp.nomeArquivo = arquivo.name;
  const palpite = contaPeloNomeDoArquivo(arquivo.name);
  if (palpite) imp.contaId = palpite;
  let lido;
  try {
    lido = GFPExtrato.lerExtrato(await textoDoArquivo(arquivo), arquivo.name);
  } catch (falha) {
    imp.erro = `Não consegui ler o arquivo: ${falha.message}`;
    return desenharPrevia();
  }
  imp.formato = lido.formato;
  imp.avisos = lido.avisos || [];
  imp.todosPositivos = Boolean(lido.todosPositivos);

  imp.linhas = lido.linhas.map((linha, indice) => {
    const reconhecido = GFPFornecedores.reconhecer(linha.descricaoOriginal || linha.description, lanc.itens);
    return {
      indice,
      occurredOn: linha.occurredOn,
      description: linha.description,
      descricaoOriginal: linha.descricaoOriginal || linha.description,
      amountCents: linha.amountCents,
      type: linha.type,
      identificador: linha.identificador || '',
      supplier: reconhecido.fornecedor || '',
      category: reconhecido.categoria || '',
      origem: reconhecido.origem,
      duplicado: false,
      motivo: null
    };
  });
  imp.marcadas = new Set(imp.linhas.map(linha => linha.indice));

  if (!imp.linhas.length) {
    imp.erro = 'Não encontrei lançamentos neste arquivo.';
    return desenharPrevia();
  }

  desenharPrevia(true);
  if (!lanc.demo) await conferirRepetidos();
  desenharPrevia();
}

// Pergunta à API quais linhas já existem e desmarca essas.
async function conferirRepetidos() {
  try {
    for (let inicio = 0; inicio < imp.linhas.length; inicio += 500) {
      const bloco = imp.linhas.slice(inicio, inicio + 500);
      const resposta = await request('/transactions/import-check', {
        method: 'POST', headers: authHeaders(), cache: 'no-store',
        body: JSON.stringify({
          accountId: imp.contaId,
          items: bloco.map(linha => ({
            occurredOn: linha.occurredOn, amountCents: linha.amountCents,
            type: linha.type, description: linha.description, identificador: linha.identificador || undefined
          }))
        })
      });
      for (const aviso of resposta) {
        const linha = bloco[aviso.index];
        if (!linha) continue;
        linha.duplicado = aviso.duplicado;
        linha.motivo = aviso.motivo;
        if (aviso.duplicado) imp.marcadas.delete(linha.indice);
      }
    }
  } catch (falha) {
    imp.avisos = [...imp.avisos, `Não consegui conferir os repetidos agora (${falha.message}). Confira a lista antes de importar.`];
  }
}

function desenharPrevia(conferindo = false) {
  const marcadas = imp.linhas.filter(linha => imp.marcadas.has(linha.indice));
  const entradas = marcadas.filter(l => l.type === 'income').reduce((s, l) => s + l.amountCents, 0);
  const saidas = marcadas.filter(l => l.type === 'expense').reduce((s, l) => s + l.amountCents, 0);
  const repetidos = imp.linhas.filter(linha => linha.duplicado).length;
  const semCategoria = imp.linhas.filter(linha => !linha.category).length;
  const visiveis = imp.linhas.slice(0, imp.mostrar);

  const fundo = abrirCaixa(`
    <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1">
        <h3>Confira antes de converter em lançamentos</h3>
        <p class="sub">${seguro(imp.nomeArquivo)} · formato ${seguro(imp.formato)} · ${imp.linhas.length} ${imp.linhas.length === 1 ? 'linha lida' : 'linhas lidas'}</p>
      </div>
      <label class="imp-conta">Conta que recebe
        <select id="impContaPrevia">${contasDisponiveis().map(c => `<option value="${seguro(c.id)}" ${c.id === imp.contaId ? 'selected' : ''}>${seguro(c.name)}</option>`).join('')}</select>
      </label>
      <button class="imp-trocar" id="impTrocar">${svg('atualizar', 'ico-s')}Trocar arquivo</button>
    </div>

    ${imp.erro ? `<p class="lanc-erro">${seguro(imp.erro)}</p>` : ''}
    ${imp.avisos.map(aviso => `<div class="imp-aviso">${svg('alerta', 'ico-s')}<span>${seguro(aviso)}</span></div>`).join('')}
    ${conferindo ? '<div class="imp-aviso">⏳<span>Conferindo quais já existem…</span></div>' : ''}

    <div class="imp-resumo">
      <div><span>Lidos do arquivo</span><strong>${imp.linhas.length}</strong></div>
      <div><span>Vão entrar</span><strong style="color:var(--purple)">${marcadas.length}</strong></div>
      <div><span>Já existem</span><strong>${repetidos}</strong></div>
      <div><span>Sem categoria</span><strong>${semCategoria}</strong></div>
      <div><span>Entradas</span><strong style="color:var(--green)">${reais(entradas)}</strong></div>
      <div><span>Saídas</span><strong style="color:var(--red)">${reais(saidas)}</strong></div>
    </div>

    <div class="imp-barra">
      <button data-marcar="novos">Marcar só os novos</button>
      <button data-marcar="todos">Marcar todos</button>
      <button data-marcar="nenhum">Desmarcar todos</button>
      <span class="sep"></span>
      <label>Categoria para os marcados
        <select id="impCategoriaLote">
          <option value="">escolher…</option>
          ${CATEGORIAS.map(nome => `<option>${nome}</option>`).join('')}
          <option value="__limpar__">(sem categoria)</option>
        </select>
      </label>
      ${imp.todosPositivos ? '<label class="imp-cartao"><input type="checkbox" id="impTudoSaida" checked>É fatura de cartão: tudo como saída</label>' : ''}
    </div>

    <div class="imp-lista">
      <div class="imp-linha cabecalho">
        <span></span><span>Data</span><span>Descrição do banco</span><span>Fornecedor</span><span>Categoria</span><span style="text-align:right">Valor</span>
      </div>
      ${visiveis.map(linha => `
        <div class="imp-linha ${imp.marcadas.has(linha.indice) ? '' : 'fora'} ${linha.duplicado ? 'repetida' : ''}">
          <button class="lanc-check" role="checkbox" aria-checked="${imp.marcadas.has(linha.indice)}" data-linha="${linha.indice}" aria-label="Incluir na importação">
            <svg class="sim" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
          </button>
          <span class="lanc-data">${dataBr(linha.occurredOn)}</span>
          <span class="imp-desc" title="${seguro(linha.descricaoOriginal)}">${seguro(linha.description)}
            ${linha.duplicado ? `<small class="imp-repetido">já existe — ${seguro(linha.motivo || '')}</small>` : ''}</span>
          <span class="imp-forn">${seguro(linha.supplier || '—')}${linha.origem === 'historico' ? '<small>pelo seu histórico</small>' : ''}</span>
          <select data-categoria="${linha.indice}">
            <option value="" ${linha.category ? '' : 'selected'}>(sem categoria)</option>
            ${CATEGORIAS.map(nome => `<option ${linha.category === nome ? 'selected' : ''}>${nome}</option>`).join('')}
          </select>
          <span class="lanc-valor ${linha.type === 'income' ? 'entrada' : 'saida'}">${linha.type === 'income' ? '+' : '−'} ${(linha.amountCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
        </div>`).join('')}
      ${imp.linhas.length > visiveis.length ? `<button class="imp-mais" id="impMais">Mostrar mais ${Math.min(300, imp.linhas.length - visiveis.length)} de ${imp.linhas.length - visiveis.length} restantes</button>` : ''}
    </div>

    <div class="pe">
      <button data-fechar="1">Cancelar</button>
      <button class="principal" id="impConverter" ${marcadas.length && !imp.ocupado ? '' : 'disabled'}>
        ${imp.ocupado ? 'Importando…' : `Converter ${marcadas.length} em lançamentos`}
      </button>
    </div>`, 'larga');

  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  fundo.querySelector('#impTrocar').addEventListener('click', abrirImportacao);
  fundo.querySelector('#impContaPrevia')?.addEventListener('change', async evento => {
    imp.contaId = evento.target.value;
    // trocou a conta: os repetidos precisam ser conferidos de novo
    for (const linha of imp.linhas) { linha.duplicado = false; linha.motivo = null; }
    imp.marcadas = new Set(imp.linhas.map(linha => linha.indice));
    desenharPrevia(true);
    if (!lanc.demo) await conferirRepetidos();
    desenharPrevia();
  });
  fundo.querySelector('#impMais')?.addEventListener('click', () => { imp.mostrar += 300; desenharPrevia(); });

  fundo.querySelectorAll('[data-linha]').forEach(botao => botao.addEventListener('click', () => {
    const indice = Number(botao.dataset.linha);
    imp.marcadas.has(indice) ? imp.marcadas.delete(indice) : imp.marcadas.add(indice);
    desenharPrevia();
  }));
  fundo.querySelectorAll('[data-marcar]').forEach(botao => botao.addEventListener('click', () => {
    const modo = botao.dataset.marcar;
    imp.marcadas = new Set(
      modo === 'nenhum' ? []
        : imp.linhas.filter(linha => modo === 'todos' || !linha.duplicado).map(linha => linha.indice));
    desenharPrevia();
  }));
  fundo.querySelectorAll('[data-categoria]').forEach(campo => campo.addEventListener('change', evento => {
    const linha = imp.linhas[Number(campo.dataset.categoria)];
    if (linha) linha.category = evento.target.value;
  }));
  fundo.querySelector('#impCategoriaLote').addEventListener('change', evento => {
    const escolhida = evento.target.value;
    if (!escolhida) return;
    for (const linha of imp.linhas) {
      if (imp.marcadas.has(linha.indice)) linha.category = escolhida === '__limpar__' ? '' : escolhida;
    }
    notify(`🟢 Categoria aplicada a ${imp.marcadas.size} ${imp.marcadas.size === 1 ? 'lançamento' : 'lançamentos'}`);
    desenharPrevia();
  });
  fundo.querySelector('#impTudoSaida')?.addEventListener('change', evento => {
    for (const linha of imp.linhas) linha.type = evento.target.checked ? 'expense' : 'income';
    desenharPrevia();
  });
  fundo.querySelector('#impConverter').addEventListener('click', converterEmLancamentos);

  // fatura de cartão começa com tudo como saída
  if (imp.todosPositivos && imp.linhas.some(linha => linha.type === 'income') && fundo.querySelector('#impTudoSaida')?.checked) {
    for (const linha of imp.linhas) linha.type = 'expense';
    desenharPrevia();
  }
}

/* ---------- passo 3: converter ---------- */

async function converterEmLancamentos() {
  const escolhidas = imp.linhas.filter(linha => imp.marcadas.has(linha.indice));
  if (!escolhidas.length) return;
  imp.ocupado = true;
  desenharPrevia();

  const paraEnviar = escolhidas.map(linha => ({
    occurredOn: linha.occurredOn,
    description: linha.description.slice(0, 140),
    amountCents: linha.amountCents,
    type: linha.type,
    category: linha.category || null,
    supplier: linha.supplier ? linha.supplier.slice(0, 120) : null,
    identificador: linha.identificador || undefined
  }));

  try {
    if (lanc.demo) {
      const conta = contasDisponiveis().find(c => c.id === imp.contaId);
      lanc.itens = [...paraEnviar.map((linha, i) => ({
        id: `demo-imp-${Date.now()}-${i}`,
        occurred_on: linha.occurredOn, description: linha.description, type: linha.type,
        amount_cents: linha.amountCents, category: linha.category, supplier: linha.supplier,
        account_id: imp.contaId, account_name: conta?.name || 'Conta'
      })), ...lanc.itens];
      fecharCaixa();
      imp.ocupado = false;
      desenharTela();
      return notify(`🟢 ${paraEnviar.length} lançamentos importados (demonstração)`);
    }

    let entraram = 0, repetidos = 0;
    for (let inicio = 0; inicio < paraEnviar.length; inicio += 500) {
      const resposta = await request('/transactions/import', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ accountId: imp.contaId, source: imp.nomeArquivo, items: paraEnviar.slice(inicio, inicio + 500) })
      });
      entraram += resposta.inserted || 0;
      repetidos += resposta.duplicates || 0;
    }
    fecharCaixa();
    imp.ocupado = false;
    notify(`🟢 ${entraram} ${entraram === 1 ? 'lançamento importado' : 'lançamentos importados'}${repetidos ? ` · ${repetidos} já existiam` : ''}`);
    await carregarLancamentos();
    if (typeof loadFinance === 'function') loadFinance().catch(() => {});
  } catch (falha) {
    imp.ocupado = false;
    imp.erro = falha.message;
    desenharPrevia();
  }
}

window.abrirImportacao = abrirImportacao;

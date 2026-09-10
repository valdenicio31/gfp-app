/* Importação da fatura do cartão, na tela.

   O de-para das categorias é feito na própria prévia: cada categoria que o
   emissor usou aparece uma vez, com um seletor ao lado. Quem importa responde
   ali mesmo para onde ela vai, e a resposta fica gravada no cartão — da fatura
   seguinte em diante a importação já chega classificada.

   Depende de v2-pdf.js (leitura do PDF), v2-fatura.js (interpretação) e dos
   utilitários de v2-lancamentos.js. */

const fat = {
  cardId: '', cartoes: [], nomeArquivo: '', compras: [],
  categoriasVistas: [], mapa: {}, avisos: [], erro: '', ocupado: false
};

const FATURA_ACEITA = '.pdf,.csv,.txt,application/pdf,text/csv,text/plain';

/* ---------- marca da importação ---------- */

// A mesma fatura relançada não pode duplicar compra. A marca é o próprio
// conteúdo do lançamento: cartão, data, valor e descrição.
async function marcaDaCompra(cardId, compra) {
  const texto = [cardId, compra.purchasedOn, compra.amountCents,
    String(compra.descricaoOriginal || compra.description).toLowerCase().replace(/\s+/g, ' ').trim()].join('|');
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- passo 1: cartão e arquivo ---------- */

async function abrirImportacaoFatura() {
  Object.assign(fat, { nomeArquivo: '', compras: [], categoriasVistas: [], avisos: [], erro: '' });
  try {
    fat.cartoes = await request('/cards?scope=self', { headers: authHeaders(), cache: 'no-store' });
  } catch (falha) {
    return notify('🔴 ' + (typeof mensagemAmigavel === 'function' ? mensagemAmigavel(falha.message) : falha.message));
  }
  if (!fat.cartoes.length) return notify('🔴 Cadastre um cartão antes de importar a fatura');
  if (!fat.cartoes.some(c => c.id === fat.cardId)) fat.cardId = fat.cartoes[0].id;

  const fundo = abrirCaixa(`
    <div><h3>Importar fatura do cartão</h3>
      <p class="sub">O arquivo que o banco disponibiliza — em PDF, mesmo protegido por senha, ou em CSV.</p></div>
    <div class="campos">
      <label class="largo">Cartão da fatura
        <select id="fatCartao">
          ${fat.cartoes.map(c => `<option value="${seguro(c.id)}" ${c.id === fat.cardId ? 'selected' : ''}>${seguro(c.name)} •••• ${seguro(c.last_four)}</option>`).join('')}
        </select>
      </label>
    </div>
    <label class="imp-solta" for="fatArquivo">
      ${typeof svg === 'function' ? svg('entra') : '📄'}
      <b>Escolher o arquivo da fatura</b>
      <small>As categorias do próprio cartão são aproveitadas e traduzidas para as suas.</small>
      <input id="fatArquivo" type="file" accept="${FATURA_ACEITA}" hidden>
    </label>
    <p class="sub" id="fatAprendidas"></p>
    <p class="lanc-erro" id="fatErro"></p>
    <div class="pe">
      <button data-fechar="1">Cancelar</button>
      <button id="fatLimpar" hidden>Esquecer categorias deste cartão</button>
    </div>`);

  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  fundo.querySelector('#fatCartao').addEventListener('change', e => {
    fat.cardId = e.target.value;
    mostrarAprendidas(fundo);
  });
  mostrarAprendidas(fundo);
  fundo.querySelector('#fatArquivo').addEventListener('change', async evento => {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    if (arquivo.size > 8 * 1024 * 1024) {
      fundo.querySelector('#fatErro').textContent = 'Arquivo muito grande (máximo 8 MB).';
      return;
    }
    fat.cardId = fundo.querySelector('#fatCartao').value;
    await prepararPreviaFatura(arquivo);
  });
}

/* Uma leitura ruim da fatura grava categoria que não é categoria. Sem uma
   forma de esquecer, o erro fica para sempre no cartão. */
async function mostrarAprendidas(fundo) {
  const texto = fundo.querySelector('#fatAprendidas');
  const botao = fundo.querySelector('#fatLimpar');
  if (!texto || !botao) return;
  try {
    const mapa = await request(`/card-category-map?card_id=${encodeURIComponent(fat.cardId)}`,
      { headers: authHeaders(), cache: 'no-store' });
    if (!mapa.length) {
      texto.textContent = 'Este cartão ainda não aprendeu nenhuma categoria.';
      botao.hidden = true;
      return;
    }
    texto.textContent = `Categorias já aprendidas neste cartão: ${mapa.map(l => l.source_category).join(' · ')}`;
    botao.hidden = false;
    botao.onclick = async () => {
      botao.disabled = true;
      try {
        const r = await request(`/card-category-map?card_id=${encodeURIComponent(fat.cardId)}`,
          { method: 'DELETE', headers: authHeaders() });
        notify(`🟢 ${r.apagadas} categoria(s) esquecida(s)`);
        await mostrarAprendidas(fundo);
      } catch (falha) {
        fundo.querySelector('#fatErro').textContent =
          typeof mensagemAmigavel === 'function' ? mensagemAmigavel(falha.message) : falha.message;
      }
      botao.disabled = false;
    };
  } catch {
    texto.textContent = '';
  }
}

/* ---------- passo 2: ler e casar com o de-para ---------- */

async function prepararPreviaFatura(arquivo) {
  fat.nomeArquivo = arquivo.name;
  fat.erro = '';
  try {
    // O de-para já gravado neste cartão ensina a leitura a reconhecer a
    // categoria escrita na própria linha, não só a de seção.
    const gravado = await request(`/card-category-map?card_id=${encodeURIComponent(fat.cardId)}`,
      { headers: authHeaders(), cache: 'no-store' });
    fat.mapa = Object.fromEntries(gravado.map(l => [l.source_category, l.category || '']));

    const ehPdfFatura = /\.pdf$/i.test(arquivo.name) || arquivo.type === 'application/pdf';
    const texto = ehPdfFatura
      ? (await GFPPdf.extrairTexto(arquivo, pedirSenhaDoPdf)).texto
      : await arquivo.text();

    const lido = GFPFatura.lerFaturaCartao(texto, { categoriasConhecidas: Object.keys(fat.mapa) });
    fat.compras = GFPFatura.aplicarDePara(lido.compras, fat.mapa);
    fat.categoriasVistas = lido.categoriasVistas;
    fat.avisos = lido.avisos;
    // Categoria nova do emissor entra no de-para em branco, esperando resposta.
    fat.categoriasVistas.forEach(nome => { if (!(nome in fat.mapa)) fat.mapa[nome] = ''; });
  } catch (falha) {
    fat.erro = `Não consegui ler a fatura: ${falha.message}`;
    fat.compras = [];
  }
  desenharPreviaFatura();
}

/* ---------- passo 3: conferir, ensinar o de-para e importar ---------- */

function desenharPreviaFatura() {
  const total = fat.compras.reduce((soma, c) => soma + c.amountCents, 0);
  const semCategoria = fat.compras.filter(c => !c.category).length;
  const cartao = fat.cartoes.find(c => c.id === fat.cardId);

  const fundo = abrirCaixa(`
    <div><h3>Confira a fatura antes de importar</h3>
      <p class="sub">${seguro(fat.nomeArquivo)} · ${seguro(cartao?.name || 'cartão')} ·
        ${fat.compras.length} ${fat.compras.length === 1 ? 'compra lida' : 'compras lidas'}</p></div>

    ${fat.erro ? `<p class="lanc-erro">${seguro(fat.erro)}</p>` : ''}
    ${fat.avisos.map(a => `<div class="imp-aviso">⚠<span>${seguro(a)}</span></div>`).join('')}

    <div class="imp-resumo">
      <div><span>Compras</span><strong>${fat.compras.length}</strong></div>
      <div><span>Total da fatura</span><strong style="color:var(--red)">${reais(total)}</strong></div>
      <div><span>Sem categoria</span><strong>${semCategoria}</strong></div>
    </div>

    ${fat.categoriasVistas.length ? `
      <div class="fat-depara">
        <b>Categorias desta fatura</b>
        <p class="sub">Diga uma vez para onde cada uma vai. Fica gravado neste cartão.</p>
        ${fat.categoriasVistas.map(origem => `
          <div class="fat-depara-linha">
            <span title="Como veio na fatura">${seguro(origem)}</span>
            <span aria-hidden="true">→</span>
            <select data-origem="${seguro(origem)}">${opcoesDeCategoria(fat.mapa[origem] || '')}</select>
          </div>`).join('')}
      </div>` : ''}

    <div class="imp-lista fat-lista">
      <div class="imp-linha cabecalho">
        <span>Data</span><span>Descrição</span><span>Categoria da fatura</span><span>Categoria do GFP</span><span style="text-align:right">Valor</span>
      </div>
      ${fat.compras.slice(0, 200).map((compra, indice) => `
        <div class="imp-linha">
          <span class="lanc-data">${dataBr(compra.purchasedOn)}</span>
          <span class="imp-desc" title="${seguro(compra.descricaoOriginal)}">${seguro(compra.description)}
            ${compra.installments > 1 ? `<small>${compra.installments}x</small>` : ''}</span>
          <span>${seguro(compra.sourceCategory || '—')}</span>
          <select data-compra="${indice}">${opcoesDeCategoria(compra.category)}</select>
          <span class="lanc-valor saida">${reais(compra.amountCents)}</span>
        </div>`).join('')}
    </div>

    <div class="pe">
      <button data-fechar="1">Cancelar</button>
      <button id="fatTrocar">Trocar arquivo</button>
      <button class="principal" id="fatImportar" ${fat.compras.length ? '' : 'disabled'}>
        Importar ${fat.compras.length} compra(s)</button>
    </div>`);

  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  fundo.querySelector('#fatTrocar').addEventListener('click', abrirImportacaoFatura);

  // Ensinar o de-para reclassifica de uma vez todas as compras daquela origem.
  fundo.querySelectorAll('[data-origem]').forEach(select => {
    select.addEventListener('change', evento => {
      const origem = select.dataset.origem;
      fat.mapa[origem] = evento.target.value;
      fat.compras.forEach(compra => {
        if (compra.sourceCategory === origem) compra.category = evento.target.value;
      });
      desenharPreviaFatura();
    });
  });

  // Ajuste fino de uma compra só, sem mexer no de-para do cartão.
  fundo.querySelectorAll('[data-compra]').forEach(select => {
    select.addEventListener('change', evento => {
      const compra = fat.compras[Number(select.dataset.compra)];
      if (compra) compra.category = evento.target.value;
    });
  });

  fundo.querySelector('#fatImportar')?.addEventListener('click', () => importarFatura(fundo));
}

async function importarFatura(fundo) {
  if (fat.ocupado || !fat.compras.length) return;
  fat.ocupado = true;
  const botao = fundo.querySelector('#fatImportar');
  botao.disabled = true;
  botao.textContent = 'Importando…';

  try {
    // Primeiro o de-para: se a importação falhar no meio, o que foi ensinado
    // não se perde e a segunda tentativa já vem classificada.
    for (const [origem, categoria] of Object.entries(fat.mapa)) {
      await request('/card-category-map', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ cardId: fat.cardId, sourceCategory: origem, category: categoria || null })
      });
    }

    const items = [];
    for (const compra of fat.compras) {
      items.push({
        description: compra.description.slice(0, 120),
        category: compra.category || null,
        sourceCategory: compra.sourceCategory || null,
        amountCents: compra.amountCents,
        installments: compra.installments || 1,
        purchasedOn: compra.purchasedOn,
        importHash: await marcaDaCompra(fat.cardId, compra)
      });
    }

    const resposta = await request('/card-purchases/import', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ cardId: fat.cardId, source: fat.nomeArquivo.slice(0, 120), items })
    });

    fecharCaixa();
    notify(`🟢 ${resposta.gravadas} compra(s) importada(s)`
      + (resposta.repetidas ? ` · ${resposta.repetidas} já estavam na fatura` : ''));
    if (typeof loadGfpCards === 'function') {
      await loadGfpCards(window.currentProfileRole === 'admin' ? 'family' : 'self', window.currentProfileRole);
    }
  } catch (falha) {
    botao.disabled = false;
    botao.textContent = `Importar ${fat.compras.length} compra(s)`;
    fundo.querySelector('.lanc-erro')?.remove();
    const erro = document.createElement('p');
    erro.className = 'lanc-erro';
    erro.textContent = typeof mensagemAmigavel === 'function' ? mensagemAmigavel(falha.message) : falha.message;
    botao.closest('.pe').before(erro);
  }
  fat.ocupado = false;
}

document.querySelector('#fatImportarBotao')?.addEventListener('click', abrirImportacaoFatura);
window.abrirImportacaoFatura = abrirImportacaoFatura;

/* Tela de Lançamentos do GFP Familiar.
   Filtro por coluna igual ao AutoFiltro do Excel, seleção de linhas,
   alteração e exclusão unitária, por seleção ou por período.
   Funciona com a API quando o usuário está logado e com dados de
   demonstração quando a tela é aberta pelo botão de demonstração. */

const CATEGORIAS = ['Alimentação', 'Casa', 'Educação', 'Lazer', 'Saúde', 'Transporte', 'Outros'];
const SEM_CATEGORIA = '__sem_categoria__';
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const COLUNAS = {
  data: { rotulo: 'Data', ordena: 'occurred_on' },
  descricao: { rotulo: 'Descrição', ordena: 'description' },
  categoria: { rotulo: 'Categoria', ordena: 'category' },
  conta: { rotulo: 'Conta', ordena: 'account_name' },
  valor: { rotulo: 'Valor', ordena: 'valor_com_sinal' }
};

const ICONES = {
  mais: '<path d="M12 5v14M5 12h14"/>',
  lapis: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 00-3-3L5 17v3z"/><path d="M14.5 6.5l3 3"/>',
  lixeira: '<path d="M4 7l1.6 12.1a2 2 0 002 1.9h8.8a2 2 0 002-1.9L20 7"/><path d="M3 7h18"/><path d="M9 7V4.5A1.5 1.5 0 0110.5 3h3A1.5 1.5 0 0115 4.5V7"/><path d="M10 11v6M14 11v6"/>',
  seta: '<path d="M6 9l6 6 6-6"/>',
  entra: '<path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M4 16v2.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V16"/>',
  sai: '<path d="M12 4v12"/><path d="M8 12l4 4 4-4"/><path d="M4 16v2.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V16"/>',
  funil: '<path d="M4 5h16l-6.5 7.5V19l-3-1.6v-4.9z"/>',
  lupa: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  azaz: '<path d="M7 4v16"/><path d="M4 8l3-4 3 4"/><path d="M13 7h7M13 12h5M13 17h3"/>',
  zaza: '<path d="M7 20V4"/><path d="M4 16l3 4 3-4"/><path d="M13 7h3M13 12h5M13 17h7"/>',
  calendario: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  marcados: '<path d="M5 13l4 4L19 7"/>',
  direita: '<path d="M9 6l6 6-6 6"/>',
  atualizar: '<path d="M20 11a8 8 0 10-2.6 5.9"/><path d="M20 5v6h-6"/>',
  alerta: '<path d="M12 9v4"/><path d="M12 16.5h.01"/><path d="M10.3 4.9L2.8 18a2 2 0 001.7 3h15a2 2 0 001.7-3L13.7 4.9a2 2 0 00-3.4 0z"/>'
};
const svg = (nome, classe = 'ico') => `<svg class="${classe}" viewBox="0 0 24 24">${ICONES[nome]}</svg>`;

const seguro = valor => String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reais = cents => (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const semSinal = cents => Math.abs(Number(cents) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const diaMes = iso => `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}`;
const dataBr = iso => `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)}`;
const semAcento = texto => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const chaveValor = linha => `${linha.type === 'income' ? '+' : '-'}${linha.amount_cents}`;
// "Failed to fetch" não diz nada para quem está usando: traduz para o que aconteceu.
const mensagemAmigavel = texto => /failed to fetch|networkerror|load failed/i.test(String(texto || ''))
  ? 'não consegui falar com o servidor'
  : String(texto || 'erro desconhecido');

const lanc = {
  itens: [],
  contas: [],
  filtros: { data: [], descricao: [], categoria: [], conta: [], valor: [] },
  ordem: { coluna: 'data', direcao: 'desc' },
  selecao: new Set(),
  carregando: false,
  demo: false,
  erroCarga: '',
  categorias: []      // vem do cadastro da família; a lista fixa é só reserva
};

// Nomes das categorias que o usuário cadastrou (ou a lista de reserva).
const nomesDeCategoria = () => (lanc.categorias.length ? lanc.categorias.map(c => c.name) : CATEGORIAS);
const categoriaCadastrada = nome => lanc.categorias.find(c => c.name === nome);
// Chip com a cor que o usuário escolheu no cadastro; sem cadastro, cai nas classes de sempre.
function chipCategoria(nome) {
  if (!nome) return '<span class="chip vazio">Sem categoria</span>';
  const dados = categoriaCadastrada(nome);
  if (!dados) return `<span class="chip ${semAcento(nome)}">${seguro(nome)}</span>`;
  return `<span class="chip" style="background:${seguro(dados.background || '#f1eef8')};color:${seguro(dados.color || '#5b5169')}">${dados.emoji ? `${seguro(dados.emoji)} ` : ''}${seguro(nome)}</span>`;
}
const opcoesDeCategoria = atual => `<option value="">(sem categoria)</option>` +
  nomesDeCategoria().map(nome => `<option ${atual === nome ? 'selected' : ''}>${seguro(nome)}</option>`).join('');

/* ---------- dados ---------- */

function dadosDemonstracao() {
  lanc.contas = [{ id: 'demo-nubank', name: 'Nubank · corrente' }, { id: 'demo-itau', name: 'Itaú · corrente' }, { id: 'demo-dinheiro', name: 'Dinheiro' }];
  const linhas = [
    ['2026-08-19', 'Mercado do mês — Assaí', 'expense', 84290, 'Alimentação', 'demo-nubank'],
    ['2026-08-18', 'Salário — ViaIA Soluções', 'income', 940000, 'Outros', 'demo-itau'],
    ['2026-08-17', 'Posto Ipiranga — combustível', 'expense', 31000, 'Transporte', 'demo-nubank'],
    ['2026-08-16', 'PIX ENVIADO 16/08 18:42', 'expense', 15000, null, 'demo-nubank'],
    ['2026-08-15', 'Escola Maple Bear — mensalidade', 'expense', 189000, 'Educação', 'demo-itau'],
    ['2026-08-14', 'Drogasil — farmácia', 'expense', 9670, 'Saúde', 'demo-dinheiro'],
    ['2026-08-12', 'Aluguel do apartamento', 'expense', 265000, 'Casa', 'demo-itau'],
    ['2026-08-08', 'Cinema em família', 'expense', 18400, 'Lazer', 'demo-nubank'],
    ['2026-08-05', 'Feira do bairro', 'expense', 13250, 'Alimentação', 'demo-dinheiro'],
    ['2026-07-28', 'Supermercado Angeloni', 'expense', 61240, 'Alimentação', 'demo-nubank'],
    ['2026-07-25', 'Salário — ViaIA Soluções', 'income', 940000, 'Outros', 'demo-itau'],
    ['2026-07-22', 'Plano de saúde Unimed', 'expense', 128400, 'Saúde', 'demo-itau'],
    ['2026-07-18', 'Uber — corridas do mês', 'expense', 24700, 'Transporte', 'demo-nubank'],
    ['2026-07-12', 'Aluguel do apartamento', 'expense', 265000, 'Casa', 'demo-itau'],
    ['2026-06-30', 'Restaurante do domingo', 'expense', 22800, 'Lazer', 'demo-nubank'],
    ['2026-06-25', 'Salário — ViaIA Soluções', 'income', 890000, 'Outros', 'demo-itau'],
    ['2026-06-12', 'Aluguel do apartamento', 'expense', 265000, 'Casa', 'demo-itau'],
    ['2026-06-05', 'Material escolar', 'expense', 47600, 'Educação', 'demo-dinheiro']
  ];
  return linhas.map(([occurred_on, description, type, amount_cents, category, account_id], indice) => ({
    id: `demo-${indice}`, occurred_on, description, type, amount_cents, category,
    account_id, account_name: lanc.contas.find(c => c.id === account_id).name, supplier: null
  }));
}

async function carregarLancamentos() {
  lanc.carregando = true;
  lanc.erroCarga = '';
  desenharTela();
  try {
    if (window.demoMode || !sessionStorage.getItem('gfp_token')) {
      lanc.demo = true;
      lanc.itens = dadosDemonstracao();
      // na demonstração usa as sete de sempre, com os mesmos ícones e cores do cadastro
      if (!lanc.categorias.length && typeof CATEGORIAS_PADRAO_DEMO !== 'undefined') {
        lanc.categorias = CATEGORIAS_PADRAO_DEMO.map((c, i) => ({ id: `demo-cat-${i}`, ...c, usos: 0 }));
      }
    } else {
      lanc.demo = false;
      const escopo = document.querySelector('[data-view].selected')?.dataset.view === 'private' ? 'self' : 'family';
      const [pacote, contas, categorias] = await Promise.all([
        request(`/transactions?scope=${escopo}&envelope=1&limit=2000`, { headers: authHeaders(), cache: 'no-store' }),
        request(`/accounts?scope=${escopo}`, { headers: authHeaders(), cache: 'no-store' }),
        request('/categories', { headers: authHeaders(), cache: 'no-store' })
      ]);
      lanc.categorias = categorias || [];
      // a data vem só como AAAA-MM-DD; normalizo por segurança para o filtro por período funcionar
      lanc.itens = (pacote.items || []).map(linha => ({ ...linha, occurred_on: String(linha.occurred_on).slice(0, 10) }));
      lanc.contas = contas || [];
    }
  } catch (erro) {
    // guarda o motivo para a tela dizer o que houve, em vez de fingir que não há nada
    lanc.erroCarga = mensagemAmigavel(erro.message);
    lanc.itens = [];
    if (typeof notify === 'function') notify(`🔴 ${erro.message}`);
  }
  lanc.selecao = new Set();
  lanc.carregando = false;
  desenharTela();
}

/* ---------- filtro e ordenação ---------- */

// Valor de cada coluna em uma linha, do jeito que o filtro compara.
function valorDaColuna(coluna, linha) {
  if (coluna === 'data') return String(linha.occurred_on).slice(0, 7);
  if (coluna === 'descricao') return linha.description;
  if (coluna === 'categoria') return linha.category || SEM_CATEGORIA;
  if (coluna === 'conta') return linha.account_id;
  return chaveValor(linha);
}

// Lista de valores daquela coluna, com a quantidade de lançamentos de cada um.
// É o que aparece no painel: sempre a coluna inteira, como o Excel faz.
function valoresDaColuna(coluna) {
  const contagem = new Map();
  for (const linha of lanc.itens) {
    const chave = valorDaColuna(coluna, linha);
    contagem.set(chave, (contagem.get(chave) || 0) + 1);
  }
  const itens = [...contagem].map(([valor, total]) => ({ valor, total, rotulo: rotuloDoValor(coluna, valor) }));
  if (coluna === 'valor') return itens.sort((a, b) => Number(b.valor.slice(1)) - Number(a.valor.slice(1)));
  if (coluna === 'data') return itens.sort((a, b) => b.valor.localeCompare(a.valor));
  return itens.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

function rotuloDoValor(coluna, valor) {
  if (coluna === 'data') return `${MESES[Number(valor.slice(5, 7)) - 1]} de ${valor.slice(0, 4)}`;
  if (coluna === 'categoria') return valor === SEM_CATEGORIA ? '(Sem categoria)' : valor;
  if (coluna === 'conta') return lanc.contas.find(c => c.id === valor)?.name || lanc.itens.find(t => t.account_id === valor)?.account_name || 'Conta removida';
  if (coluna === 'valor') return `${valor[0] === '+' ? '+' : '−'} ${semSinal(valor.slice(1))}`;
  return valor;
}

function linhasFiltradas() {
  const linhas = lanc.itens.filter(linha => Object.entries(lanc.filtros).every(([coluna, marcados]) =>
    !marcados.length || marcados.includes(valorDaColuna(coluna, linha))));
  const { coluna, direcao } = lanc.ordem;
  const chave = linha => coluna === 'valor'
    ? (linha.type === 'income' ? 1 : -1) * Number(linha.amount_cents)
    : coluna === 'data' ? linha.occurred_on
      : coluna === 'conta' ? linha.account_name || ''
        : coluna === 'categoria' ? (linha.category || 'zzz') : linha.description;
  return linhas.sort((a, b) => {
    const x = chave(a), y = chave(b);
    const comparado = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR');
    return direcao === 'asc' ? comparado : -comparado;
  });
}

const temFiltro = () => Object.values(lanc.filtros).some(lista => lista.length);
const meuPapel = () => document.querySelector('#roleSelect')?.value || 'admin';
const podeEditar = () => ['admin', 'adult', 'dependent'].includes(meuPapel());
const podeLote = () => ['admin', 'adult'].includes(meuPapel());

/* ---------- desenho da tela ---------- */

function desenharTela() {
  const alvo = document.querySelector('#telaLancamentos');
  if (!alvo) return;
  const linhas = linhasFiltradas();
  const receitas = linhas.filter(l => l.type === 'income').reduce((s, l) => s + Number(l.amount_cents), 0);
  const despesas = linhas.filter(l => l.type === 'expense').reduce((s, l) => s + Number(l.amount_cents), 0);
  const marcadas = linhas.filter(l => lanc.selecao.has(l.id));
  const todasMarcadas = linhas.length > 0 && marcadas.length === linhas.length;

  alvo.innerHTML = `
    <div class="lanc-head">
      <small>CENTRAL FINANCEIRA</small>
      <h2>Lançamentos</h2>
      <p>Clique no funil de qualquer coluna para escolher os valores — como o AutoFiltro do Excel.${lanc.demo ? ' <b>Dados de demonstração.</b>' : ''}</p>
    </div>

    <div class="lanc-cmd">
      <button class="novo" id="lancNovo" ${podeEditar() ? '' : 'disabled'}>${svg('mais')}Novo</button>
      <button id="lancAlterar" ${podeEditar() && marcadas.length === 1 ? '' : 'disabled'}>${svg('lapis')}Alterar</button>
      <button class="excluir" id="lancExcluir" ${podeEditar() ? '' : 'disabled'}>${svg('lixeira')}Excluir${svg('seta', 'ico-s')}</button>
      <span class="sep"></span>
      <button class="importar" id="lancImportar">${svg('entra')}Importar de qualquer banco</button>
      <button id="lancExportar">${svg('sai')}Exportar</button>
      <span class="sep"></span>
      <button id="lancRecarregar">${svg('atualizar')}Atualizar</button>
    </div>

    ${lanc.erroCarga ? `
      <div class="lanc-falha">
        <div>${svg('alerta')}<span><b>Não consegui carregar seus lançamentos e contas</b>
          <small>${seguro(lanc.erroCarga)} — se a instância estava dormindo, a primeira tentativa demora até 50 segundos.</small></span></div>
        <button id="lancTentarDeNovo">Tentar de novo</button>
      </div>` : ''}

    ${faixaDeContas()}

    <div class="lanc-tags">${etiquetasDeFiltro()}</div>

    <div class="lanc-selecao ${marcadas.length ? 'on' : ''}">
      <b>${marcadas.length} ${marcadas.length === 1 ? 'lançamento marcado' : 'lançamentos marcados'}</b>
      <span>Entradas ${reais(marcadas.filter(l => l.type === 'income').reduce((s, l) => s + Number(l.amount_cents), 0))} · Saídas ${reais(marcadas.filter(l => l.type === 'expense').reduce((s, l) => s + Number(l.amount_cents), 0))}</span>
      <div class="direita">
        <button id="lancLimparSelecao">Limpar seleção</button>
        <button class="apagar" id="lancApagarSelecao" ${podeLote() ? '' : 'disabled'}>${svg('lixeira', 'ico-s')}Excluir marcados</button>
      </div>
    </div>

    <div class="lanc-tabela">
      <div class="lanc-linha cabecalho">
        <button class="lanc-check" id="lancMarcarTodos" role="checkbox" aria-checked="${todasMarcadas ? 'true' : marcadas.length ? 'mixed' : 'false'}" aria-label="Marcar todos">
          <svg class="sim" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
          <svg class="parcial" viewBox="0 0 24 24"><path d="M6 12h12"/></svg>
        </button>
        ${Object.entries(COLUNAS).map(([coluna, dados]) => `
          <button class="lanc-th ${lanc.filtros[coluna].length ? 'ativo' : ''} ${coluna === 'valor' ? 'direita' : ''}" data-coluna="${coluna}">
            ${dados.rotulo}
            <span class="funil">${svg('funil', 'ico-s')}${lanc.filtros[coluna].length ? `<i style="font-style:normal"></i>` : ''}</span>
          </button>`).join('')}
        <span class="lanc-th direita" style="cursor:default">Ações</span>
      </div>

      ${lanc.carregando ? '<div class="lanc-vazio">Carregando os lançamentos…</div>'
        : linhas.length ? linhas.map(linha => `
        <div class="lanc-linha ${lanc.selecao.has(linha.id) ? 'marcada' : ''}">
          <button class="lanc-check" role="checkbox" aria-checked="${lanc.selecao.has(linha.id)}" data-marcar="${seguro(linha.id)}" aria-label="Marcar lançamento">
            <svg class="sim" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
          </button>
          <span class="lanc-data">${diaMes(linha.occurred_on)}</span>
          <span class="lanc-desc" title="${seguro(linha.description)}">${seguro(linha.description)}${linha.supplier ? `<small>${seguro(linha.supplier)}</small>` : ''}</span>
          ${chipCategoria(linha.category)}
          <span class="lanc-conta" title="${seguro(linha.account_name || '')}">${seguro(linha.account_name || '—')}</span>
          <span class="lanc-valor ${linha.type === 'income' ? 'entrada' : 'saida'}">${linha.type === 'income' ? '+' : '−'} ${semSinal(linha.amount_cents)}</span>
          <span class="lanc-acoes">
            <button data-editar="${seguro(linha.id)}" title="Alterar" ${podeEditar() ? '' : 'disabled'}>${svg('lapis', 'ico-s')}</button>
            <button class="remover" data-excluir="${seguro(linha.id)}" title="Excluir" ${podeEditar() ? '' : 'disabled'}>${svg('lixeira', 'ico-s')}</button>
          </span>
        </div>`).join('')
        : `<div class="lanc-vazio"><b>${temFiltro() ? 'Nenhum lançamento com esses filtros' : 'Nenhum lançamento por aqui ainda'}</b>${temFiltro() ? 'Desmarque algum valor nas colunas ou limpe os filtros.' : 'Use Novo para incluir o primeiro, ou importe o extrato do banco.'}</div>`}

      <div class="lanc-rodape">
        <span>Mostrando ${linhas.length} de ${lanc.itens.length}${temFiltro() ? ' (filtrado)' : ''}</span>
        <div class="totais">
          <span>Entradas <strong style="color:var(--green)">${reais(receitas)}</strong></span>
          <span>Saídas <strong style="color:var(--red)">${reais(despesas)}</strong></span>
          <span>Total do filtro <strong>${reais(receitas - despesas)}</strong></span>
        </div>
      </div>
    </div>

    <div class="lanc-filtro" id="lancPainelFiltro" hidden></div>
    <div class="lanc-menu" id="lancMenuExcluir" hidden></div>`;

  ligarEventos();
}

// Mostra as contas que o sistema realmente tem, com saldo — é o que responde
// "cadê minhas contas?" sem precisar abrir outro módulo.
function faixaDeContas() {
  if (lanc.erroCarga) return '';
  const contas = lanc.contas.length
    ? lanc.contas
    : [...new Map(lanc.itens.map(t => [t.account_id, { id: t.account_id, name: t.account_name }])).values()];
  if (!contas.length) {
    return `<div class="lanc-contas vazia">
      <span>${svg('alerta', 'ico-s')}Nenhuma conta cadastrada nesta família ainda — os lançamentos precisam de uma conta para entrar.</span>
      <button id="lancNovaConta">➕ Cadastrar conta</button></div>`;
  }
  return `<div class="lanc-contas">
    <b>${contas.length === 1 ? 'Sua conta' : `Suas ${contas.length} contas`}</b>
    ${contas.map(conta => `<span class="lanc-conta-chip">${seguro(conta.name)}${conta.balance_cents === undefined ? '' : `<em>${reais(conta.balance_cents)}</em>`}</span>`).join('')}
    <button id="lancNovaConta">➕ Cadastrar conta</button></div>`;
}

function etiquetasDeFiltro() {
  const partes = Object.entries(lanc.filtros).filter(([, lista]) => lista.length).map(([coluna, lista]) => {
    const nomes = lista.map(valor => rotuloDoValor(coluna, valor));
    const texto = nomes.length <= 2 ? nomes.join(', ') : `${nomes.length} valores`;
    return `<span class="lanc-tag">${COLUNAS[coluna].rotulo}: ${seguro(texto)}<button data-limpar="${coluna}" title="Remover filtro">×</button></span>`;
  });
  if (partes.length > 1) partes.push('<button class="lanc-tag limpar" data-limpar="tudo">Limpar todos os filtros</button>');
  return partes.join('');
}

/* ---------- painel do filtro da coluna ---------- */

// Encosta o painel logo abaixo do botão que o abriu, sem sair da tela.
function posicionar(painel, botao) {
  const area = botao.getBoundingClientRect();
  const largura = painel.offsetWidth || 306;
  const altura = painel.offsetHeight || 320;
  const esquerda = Math.min(Math.max(area.left, 10), Math.max(window.innerWidth - largura - 10, 10));
  const abaixo = area.bottom + 6;
  const acima = area.top - altura - 6;
  const topo = abaixo + altura > window.innerHeight - 10 && acima > 10 ? acima : Math.max(Math.min(abaixo, window.innerHeight - altura - 10), 10);
  painel.style.left = `${esquerda}px`;
  painel.style.top = `${topo}px`;
}

function abrirPainelFiltro(coluna, botao) {
  const painel = document.querySelector('#lancPainelFiltro');
  const marcados = new Set(lanc.filtros[coluna]);
  const valores = valoresDaColuna(coluna);
  const tudo = valores.length && marcados.size === 0 ? 'true' : marcados.size ? 'mixed' : 'true';
  const porData = coluna === 'data';
  const anos = porData ? [...new Set(valores.map(v => v.valor.slice(0, 4)))].sort().reverse() : [];

  const caixa = (estado, extra = '') => `<span class="lanc-check" role="checkbox" aria-checked="${estado}" ${extra}>
      <svg class="sim" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
      <svg class="parcial" viewBox="0 0 24 24"><path d="M6 12h12"/></svg></span>`;
  const estadoDe = valor => marcados.size === 0 || marcados.has(valor) ? 'true' : 'false';

  const listaValores = porData
    ? anos.map(ano => {
        const doAno = valores.filter(v => v.valor.startsWith(ano));
        const marcadosNoAno = doAno.filter(v => estadoDe(v.valor) === 'true').length;
        const estadoAno = marcadosNoAno === doAno.length ? 'true' : marcadosNoAno ? 'mixed' : 'false';
        return `<button class="opt" data-ano="${ano}">${caixa(estadoAno)}<strong class="rotulo">${ano}</strong><span class="qtd">${doAno.reduce((s, v) => s + v.total, 0)}</span></button>`
          + doAno.map(v => `<button class="opt filho" data-valor="${seguro(v.valor)}">${caixa(estadoDe(v.valor))}<span class="rotulo">${seguro(MESES[Number(v.valor.slice(5, 7)) - 1])}</span><span class="qtd">${v.total}</span></button>`).join('');
      }).join('')
    : valores.map(v => `<button class="opt" data-valor="${seguro(v.valor)}">${caixa(estadoDe(v.valor))}<span class="rotulo">${seguro(v.rotulo)}</span><span class="qtd">${v.total}</span></button>`).join('');

  painel.innerHTML = `
    <button class="opt" data-ordenar="asc">${svg(porData || coluna === 'valor' ? 'azaz' : 'azaz', 'ico-s')}${porData ? 'Ordenar do mais antigo para o mais novo' : coluna === 'valor' ? 'Ordenar do menor para o maior' : 'Ordenar de A a Z'}</button>
    <button class="opt" data-ordenar="desc">${svg('zaza', 'ico-s')}${porData ? 'Ordenar do mais novo para o mais antigo' : coluna === 'valor' ? 'Ordenar do maior para o menor' : 'Ordenar de Z a A'}</button>
    ${porData ? `<span class="divisor"></span><button class="opt" data-periodo="1">${svg('calendario', 'ico-s')}<span class="rotulo">Escolher um período…</span>${svg('direita', 'ico-s')}</button>` : ''}
    <span class="divisor"></span>
    <div class="busca">${svg('lupa', 'ico-s')}<input placeholder="Buscar" id="lancBuscaFiltro" autocomplete="off"></div>
    <div class="valores" id="lancValores">
      <button class="opt tudo" data-tudo="1">${caixa(tudo)}<strong class="rotulo">(Selecionar tudo)</strong><span class="qtd">${lanc.itens.length}</span></button>
      ${listaValores}
    </div>
    <div class="pe"><button data-fechar="1">Cancelar</button><button class="ok" data-aplicar="1">OK</button></div>`;

  painel.hidden = false;
  posicionar(painel, botao);
  painel.dataset.coluna = coluna;
  document.querySelector('#lancBuscaFiltro').focus();

  // marcar/desmarcar dentro do painel, sem tocar na tabela até clicar em OK
  const marcarNoPainel = (elemento, ligado) => elemento.querySelector('.lanc-check').setAttribute('aria-checked', ligado ? 'true' : 'false');
  painel.querySelectorAll('.opt[data-valor],.opt[data-ano],.opt[data-tudo]').forEach(opcao => opcao.addEventListener('click', () => {
    const caixinha = opcao.querySelector('.lanc-check');
    const ligado = caixinha.getAttribute('aria-checked') !== 'true';
    if (opcao.dataset.tudo) {
      painel.querySelectorAll('#lancValores .opt').forEach(item => marcarNoPainel(item, ligado));
      return;
    }
    if (opcao.dataset.ano) {
      marcarNoPainel(opcao, ligado);
      painel.querySelectorAll(`.opt.filho[data-valor^="${opcao.dataset.ano}"]`).forEach(item => marcarNoPainel(item, ligado));
    } else {
      marcarNoPainel(opcao, ligado);
    }
    const filhos = [...painel.querySelectorAll('#lancValores .opt[data-valor]')];
    const ligados = filhos.filter(item => item.querySelector('.lanc-check').getAttribute('aria-checked') === 'true').length;
    const geral = painel.querySelector('.opt.tudo .lanc-check');
    geral.setAttribute('aria-checked', ligados === filhos.length ? 'true' : ligados ? 'mixed' : 'false');
  }));

  painel.querySelector('#lancBuscaFiltro').addEventListener('input', evento => {
    const procurado = semAcento(evento.target.value.trim());
    painel.querySelectorAll('#lancValores .opt[data-valor],#lancValores .opt[data-ano]').forEach(opcao => {
      opcao.hidden = Boolean(procurado) && !semAcento(opcao.querySelector('.rotulo').textContent).includes(procurado);
    });
  });

  painel.querySelectorAll('[data-ordenar]').forEach(botaoOrdem => botaoOrdem.addEventListener('click', () => {
    lanc.ordem = { coluna, direcao: botaoOrdem.dataset.ordenar };
    fecharFlutuantes();
    desenharTela();
  }));
  painel.querySelector('[data-periodo]')?.addEventListener('click', () => { fecharFlutuantes(); abrirCaixaPeriodo(); });
  painel.querySelector('[data-fechar]').addEventListener('click', fecharFlutuantes);
  painel.querySelector('[data-aplicar]').addEventListener('click', () => {
    const filhos = [...painel.querySelectorAll('#lancValores .opt[data-valor]')];
    const ligados = filhos.filter(item => item.querySelector('.lanc-check').getAttribute('aria-checked') === 'true');
    lanc.filtros[coluna] = ligados.length === filhos.length ? [] : ligados.map(item => item.dataset.valor);
    if (!ligados.length && typeof notify === 'function') notify('🟡 Nenhum valor marcado nessa coluna — a lista fica vazia');
    fecharFlutuantes();
    desenharTela();
  });
}

function abrirMenuExcluir(botao) {
  const menu = document.querySelector('#lancMenuExcluir');
  const marcadas = linhasFiltradas().filter(l => lanc.selecao.has(l.id));
  const filtradas = linhasFiltradas();
  menu.innerHTML = `
    <button data-acao="marcados" ${marcadas.length && podeLote() ? '' : 'disabled'}>${svg('marcados', 'ico-s')}<span><strong>A seleção da tela</strong><small>${marcadas.length} ${marcadas.length === 1 ? 'lançamento marcado' : 'marcados agora'}</small></span></button>
    <button data-acao="periodo" ${podeLote() ? '' : 'disabled'}>${svg('calendario', 'ico-s')}<span><strong>Por período</strong><small>escolher as datas</small></span></button>
    <span class="divisor"></span>
    <button data-acao="filtro" ${filtradas.length && podeLote() ? '' : 'disabled'}>${svg('funil', 'ico-s')}<span><strong>Tudo que o filtro mostra</strong><small>${filtradas.length} ${filtradas.length === 1 ? 'lançamento' : 'lançamentos'}</small></span></button>
    ${podeLote() ? '' : '<span class="divisor"></span><small style="display:block;padding:8px 13px;color:var(--muted)">Apagar em lote é do administrador e do adulto.</small>'}`;
  menu.hidden = false;
  posicionar(menu, botao);
  menu.querySelectorAll('button[data-acao]').forEach(item => item.addEventListener('click', () => {
    fecharFlutuantes();
    if (item.dataset.acao === 'periodo') return abrirCaixaPeriodo();
    const alvo = item.dataset.acao === 'marcados' ? marcadas : filtradas;
    abrirConfirmacaoExclusao(alvo, item.dataset.acao === 'marcados' ? 'a seleção da tela' : 'tudo que o filtro mostra');
  }));
}

function fecharFlutuantes() {
  const painel = document.querySelector('#lancPainelFiltro');
  const menu = document.querySelector('#lancMenuExcluir');
  if (painel) painel.hidden = true;
  if (menu) menu.hidden = true;
}

/* ---------- caixas ---------- */

function abrirCaixa(html, classeExtra = '') {
  let fundo = document.querySelector('#lancFundo');
  if (!fundo) {
    fundo = document.createElement('div');
    fundo.id = 'lancFundo';
    fundo.className = 'lanc-fundo';
    document.body.appendChild(fundo);
    fundo.addEventListener('click', evento => { if (evento.target === fundo) fecharCaixa(); });
  }
  fundo.innerHTML = `<div class="lanc-caixa ${classeExtra}">${html}</div>`;
  fundo.hidden = false;
  return fundo;
}
function fecharCaixa() {
  const fundo = document.querySelector('#lancFundo');
  if (fundo) { fundo.hidden = true; fundo.innerHTML = ''; }
}

function abrirEditor(id) {
  const linha = id ? lanc.itens.find(item => item.id === id) : null;
  const contas = lanc.contas.length ? lanc.contas : [...new Map(lanc.itens.map(t => [t.account_id, { id: t.account_id, name: t.account_name }])).values()];
  const fundo = abrirCaixa(`
    <div><h3>${linha ? 'Alterar lançamento' : 'Novo lançamento'}</h3><p class="sub">${linha ? 'O saldo da conta é recalculado quando você salva.' : 'Informe os dados do lançamento.'}</p></div>
    <div class="campos">
      <label>Data<input type="date" id="lancCampoData" value="${seguro(linha?.occurred_on || new Date().toISOString().slice(0, 10))}"></label>
      <label>Tipo<select id="lancCampoTipo">
        <option value="expense" ${linha?.type === 'expense' || !linha ? 'selected' : ''}>Saída (despesa)</option>
        <option value="income" ${linha?.type === 'income' ? 'selected' : ''}>Entrada (receita)</option></select></label>
      <label class="largo">Descrição<input id="lancCampoDescricao" maxlength="140" value="${seguro(linha?.description || '')}" placeholder="Ex.: Mercado do mês — Assaí"></label>
      <label>Categoria<select id="lancCampoCategoria">${opcoesDeCategoria(linha?.category)}</select></label>
      <label>Conta<select id="lancCampoConta">${contas.map(conta => `<option value="${seguro(conta.id)}" ${linha?.account_id === conta.id ? 'selected' : ''}>${seguro(conta.name)}</option>`).join('')}</select></label>
      <label>Valor (R$)<input id="lancCampoValor" type="number" min="0.01" step="0.01" value="${linha ? (Number(linha.amount_cents) / 100).toFixed(2) : ''}" placeholder="0,00"></label>
      <label>Fornecedor (opcional)<input id="lancCampoFornecedor" maxlength="120" value="${seguro(linha?.supplier || '')}" placeholder="Ex.: Assaí Atacadista"></label>
    </div>
    <p class="lanc-erro" id="lancErroEditor"></p>
    <div class="pe"><button data-fechar="1">Cancelar</button><button class="principal" id="lancSalvar">${linha ? 'Salvar alterações' : 'Incluir lançamento'}</button></div>`);

  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  fundo.querySelector('#lancSalvar').addEventListener('click', async () => {
    const erro = fundo.querySelector('#lancErroEditor');
    const dados = {
      occurredOn: fundo.querySelector('#lancCampoData').value,
      type: fundo.querySelector('#lancCampoTipo').value,
      description: fundo.querySelector('#lancCampoDescricao').value.trim(),
      category: fundo.querySelector('#lancCampoCategoria').value || null,
      accountId: fundo.querySelector('#lancCampoConta').value,
      amountCents: Math.round(Number(fundo.querySelector('#lancCampoValor').value) * 100),
      supplier: fundo.querySelector('#lancCampoFornecedor').value.trim() || null
    };
    if (dados.description.length < 2) return erro.textContent = 'Escreva uma descrição com pelo menos 2 letras.';
    if (!(dados.amountCents > 0)) return erro.textContent = 'Informe um valor maior que zero.';
    if (!dados.occurredOn) return erro.textContent = 'Escolha a data do lançamento.';
    if (!dados.accountId) return erro.textContent = 'Escolha a conta.';

    const botao = fundo.querySelector('#lancSalvar');
    botao.disabled = true;
    try {
      if (lanc.demo) {
        if (linha) Object.assign(linha, { occurred_on: dados.occurredOn, type: dados.type, description: dados.description, category: dados.category, account_id: dados.accountId, amount_cents: dados.amountCents, supplier: dados.supplier, account_name: contas.find(c => c.id === dados.accountId)?.name });
        else lanc.itens.unshift({ id: `demo-${Date.now()}`, occurred_on: dados.occurredOn, type: dados.type, description: dados.description, category: dados.category, account_id: dados.accountId, amount_cents: dados.amountCents, supplier: dados.supplier, account_name: contas.find(c => c.id === dados.accountId)?.name });
        fecharCaixa();
        desenharTela();
        return notify(linha ? '🟢 Lançamento alterado (demonstração)' : '🟢 Lançamento incluído (demonstração)');
      }
      if (linha) await request(`/transactions/${linha.id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(dados) });
      else await request('/transactions', { method: 'POST', headers: authHeaders(), body: JSON.stringify(dados) });
      fecharCaixa();
      notify(linha ? '🟢 Lançamento alterado' : '🟢 Lançamento incluído');
      await carregarLancamentos();
      if (typeof loadFinance === 'function') loadFinance().catch(() => {});
    } catch (falha) {
      botao.disabled = false;
      erro.textContent = falha.message;
    }
  });
}

function abrirCaixaPeriodo() {
  const hoje = new Date();
  const primeiro = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  const fundo = abrirCaixa(`
    <div class="aviso"><i>!</i><div><h3>Excluir lançamentos por período</h3><p class="sub">Escolha as datas e confira o que será apagado antes de confirmar.</p></div></div>
    <div class="campos">
      <label>De<input type="date" id="lancPeriodoDe" value="${primeiro}"></label>
      <label>Até<input type="date" id="lancPeriodoAte" value="${hoje.toISOString().slice(0, 10)}"></label>
      <label class="largo">Conta<select id="lancPeriodoConta"><option value="">Todas as contas</option>${lanc.contas.map(conta => `<option value="${seguro(conta.id)}">${seguro(conta.name)}</option>`).join('')}</select></label>
    </div>
    <p class="lanc-erro" id="lancErroPeriodo"></p>
    <div class="pe"><button data-fechar="1">Cancelar</button><button class="principal" id="lancVerPeriodo">Ver o que será excluído</button></div>`);
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  fundo.querySelector('#lancVerPeriodo').addEventListener('click', () => {
    const de = fundo.querySelector('#lancPeriodoDe').value;
    const ate = fundo.querySelector('#lancPeriodoAte').value;
    const conta = fundo.querySelector('#lancPeriodoConta').value;
    if (!de || !ate) return fundo.querySelector('#lancErroPeriodo').textContent = 'Informe as duas datas.';
    if (de > ate) return fundo.querySelector('#lancErroPeriodo').textContent = 'A data inicial precisa ser anterior à final.';
    const alvo = lanc.itens.filter(linha => linha.occurred_on >= de && linha.occurred_on <= ate && (!conta || linha.account_id === conta));
    if (!alvo.length) return fundo.querySelector('#lancErroPeriodo').textContent = 'Nenhum lançamento nesse período.';
    abrirConfirmacaoExclusao(alvo, `o período de ${dataBr(de)} a ${dataBr(ate)}`, { from: de, to: ate, accountId: conta || undefined });
  });
}

function abrirConfirmacaoExclusao(alvo, origem, porPeriodo) {
  const receitas = alvo.filter(l => l.type === 'income').reduce((s, l) => s + Number(l.amount_cents), 0);
  const despesas = alvo.filter(l => l.type === 'expense').reduce((s, l) => s + Number(l.amount_cents), 0);
  const amostra = alvo.slice(0, 3);
  const fundo = abrirCaixa(`
    <div class="aviso"><i>!</i><div><h3>Excluir ${alvo.length} ${alvo.length === 1 ? 'lançamento' : 'lançamentos'}</h3><p class="sub">Origem: ${seguro(origem)}. Confira antes de confirmar.</p></div></div>
    <div class="resumo">
      <div><span>Serão excluídos</span><strong class="grande">${alvo.length}</strong></div>
      <div><span>Receitas apagadas</span><strong>${reais(receitas)}</strong></div>
      <div><span>Despesas apagadas</span><strong>${reais(despesas)}</strong></div>
      <div style="margin-left:auto"><span>Efeito no saldo total</span><strong style="color:#b91c1c">${receitas - despesas >= 0 ? '−' : '+'} ${semSinal(receitas - despesas)}</strong></div>
    </div>
    <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden">
      ${amostra.map(linha => `<div style="display:grid;grid-template-columns:78px 1fr 130px;gap:12px;padding:11px 14px;border-bottom:1px solid #f4f1f8;align-items:center">
        <span class="lanc-data">${diaMes(linha.occurred_on)}</span>
        <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${seguro(linha.description)}</span>
        <span class="lanc-valor ${linha.type === 'income' ? 'entrada' : 'saida'}">${linha.type === 'income' ? '+' : '−'} ${semSinal(linha.amount_cents)}</span></div>`).join('')}
      ${alvo.length > amostra.length ? `<div style="padding:10px 14px;background:#faf8fd;color:var(--muted);font-size:12.5px">e mais ${alvo.length - amostra.length} ${alvo.length - amostra.length === 1 ? 'lançamento' : 'lançamentos'}</div>` : ''}
    </div>
    <label class="aceite"><input type="checkbox" id="lancAceite">Entendi que ${alvo.length === 1 ? 'este lançamento será apagado' : `os ${alvo.length} lançamentos serão apagados`} e o saldo das contas será recalculado</label>
    <p class="lanc-erro" id="lancErroExcluir"></p>
    <div class="pe"><button data-fechar="1">Cancelar</button><button class="perigo" id="lancConfirmar" disabled>${svg('lixeira', 'ico-s')}Excluir ${alvo.length === 1 ? 'lançamento' : `${alvo.length} lançamentos`}</button></div>`);

  const confirmar = fundo.querySelector('#lancConfirmar');
  fundo.querySelector('[data-fechar]').addEventListener('click', fecharCaixa);
  fundo.querySelector('#lancAceite').addEventListener('change', evento => confirmar.disabled = !evento.target.checked);
  confirmar.addEventListener('click', async () => {
    confirmar.disabled = true;
    try {
      if (lanc.demo) {
        const apagar = new Set(alvo.map(linha => linha.id));
        lanc.itens = lanc.itens.filter(linha => !apagar.has(linha.id));
      } else if (porPeriodo) {
        await request('/transactions/bulk-delete', { method: 'POST', headers: authHeaders(), body: JSON.stringify(porPeriodo) });
      } else if (alvo.length === 1) {
        await request(`/transactions/${alvo[0].id}`, { method: 'DELETE', headers: authHeaders() });
      } else {
        // em blocos de 500 para não estourar o limite da API
        for (let inicio = 0; inicio < alvo.length; inicio += 500) {
          await request('/transactions/bulk-delete', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ids: alvo.slice(inicio, inicio + 500).map(linha => linha.id) }) });
        }
      }
      fecharCaixa();
      notify(`🟢 ${alvo.length} ${alvo.length === 1 ? 'lançamento excluído' : 'lançamentos excluídos'}`);
      if (lanc.demo) { lanc.selecao = new Set(); desenharTela(); }
      else { await carregarLancamentos(); if (typeof loadFinance === 'function') loadFinance().catch(() => {}); }
    } catch (falha) {
      confirmar.disabled = false;
      fundo.querySelector('#lancErroExcluir').textContent = falha.message;
    }
  });
}

function exportarCsv() {
  const linhas = linhasFiltradas();
  const cabecalho = ['Data', 'Descrição', 'Categoria', 'Conta', 'Tipo', 'Valor'];
  const corpo = linhas.map(linha => [dataBr(linha.occurred_on), linha.description, linha.category || 'Sem categoria',
    linha.account_name || '', linha.type === 'income' ? 'Entrada' : 'Saída', (Number(linha.amount_cents) / 100).toFixed(2).replace('.', ',')]);
  const csv = [cabecalho, ...corpo].map(colunas => colunas.map(valor => `"${String(valor).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `lancamentos-gfp-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  notify(`🟢 ${linhas.length} ${linhas.length === 1 ? 'lançamento exportado' : 'lançamentos exportados'}`);
}

/* ---------- eventos ---------- */

function ligarEventos() {
  const tela = document.querySelector('#telaLancamentos');
  tela.querySelectorAll('.lanc-th[data-coluna]').forEach(botao => botao.addEventListener('click', evento => {
    evento.stopPropagation();
    const painel = document.querySelector('#lancPainelFiltro');
    const mesmaColuna = !painel.hidden && painel.dataset.coluna === botao.dataset.coluna;
    fecharFlutuantes();
    if (!mesmaColuna) abrirPainelFiltro(botao.dataset.coluna, botao);
  }));
  tela.querySelectorAll('[data-limpar]').forEach(botao => botao.addEventListener('click', () => {
    if (botao.dataset.limpar === 'tudo') Object.keys(lanc.filtros).forEach(coluna => lanc.filtros[coluna] = []);
    else lanc.filtros[botao.dataset.limpar] = [];
    desenharTela();
  }));
  tela.querySelectorAll('[data-marcar]').forEach(botao => botao.addEventListener('click', () => {
    const id = botao.dataset.marcar;
    lanc.selecao.has(id) ? lanc.selecao.delete(id) : lanc.selecao.add(id);
    desenharTela();
  }));
  tela.querySelector('#lancMarcarTodos')?.addEventListener('click', () => {
    const linhas = linhasFiltradas();
    const todas = linhas.every(linha => lanc.selecao.has(linha.id)) && linhas.length > 0;
    linhas.forEach(linha => todas ? lanc.selecao.delete(linha.id) : lanc.selecao.add(linha.id));
    desenharTela();
  });
  tela.querySelectorAll('[data-editar]').forEach(botao => botao.addEventListener('click', () => abrirEditor(botao.dataset.editar)));
  tela.querySelectorAll('[data-excluir]').forEach(botao => botao.addEventListener('click', () => {
    const linha = lanc.itens.find(item => item.id === botao.dataset.excluir);
    if (linha) abrirConfirmacaoExclusao([linha], 'a linha marcada');
  }));
  tela.querySelector('#lancNovo').addEventListener('click', () => abrirEditor(null));
  tela.querySelector('#lancAlterar').addEventListener('click', () => {
    const marcada = linhasFiltradas().find(linha => lanc.selecao.has(linha.id));
    if (marcada) abrirEditor(marcada.id);
  });
  tela.querySelector('#lancExcluir').addEventListener('click', evento => {
    evento.stopPropagation();
    const menu = document.querySelector('#lancMenuExcluir');
    const aberto = !menu.hidden;
    fecharFlutuantes();
    if (!aberto) abrirMenuExcluir(evento.currentTarget);
  });
  tela.querySelector('#lancLimparSelecao')?.addEventListener('click', () => { lanc.selecao = new Set(); desenharTela(); });
  tela.querySelector('#lancApagarSelecao')?.addEventListener('click', () => {
    const marcadas = linhasFiltradas().filter(linha => lanc.selecao.has(linha.id));
    if (marcadas.length) abrirConfirmacaoExclusao(marcadas, 'a seleção da tela');
  });
  tela.querySelector('#lancTentarDeNovo')?.addEventListener('click', carregarLancamentos);
  tela.querySelector('#lancNovaConta')?.addEventListener('click', () => {
    if (typeof abrirCriacaoDeConta === 'function') return abrirCriacaoDeConta();
    notify('🟡 O cadastro de conta não carregou nesta página');
  });
  tela.querySelector('#lancExportar').addEventListener('click', exportarCsv);
  tela.querySelector('#lancRecarregar').addEventListener('click', carregarLancamentos);
  tela.querySelector('#lancImportar').addEventListener('click', () => {
    if (typeof abrirImportacao === 'function') return abrirImportacao();
    notify('🟡 A importação de extrato não carregou nesta página');
  });
}

document.addEventListener('click', evento => {
  if (!evento.target.closest('#lancPainelFiltro,#lancMenuExcluir,.lanc-th,#lancExcluir')) fecharFlutuantes();
});
window.addEventListener('scroll', () => fecharFlutuantes(), true);
window.addEventListener('resize', () => fecharFlutuantes());
document.addEventListener('keydown', evento => {
  if (evento.key !== 'Escape') return;
  const fundo = document.querySelector('#lancFundo');
  if (fundo && !fundo.hidden) fecharCaixa(); else fecharFlutuantes();
});

/* ---------- entrada na tela ---------- */

function abrirTelaLancamentos() {
  document.body.classList.add('tela-lancamentos');
  document.querySelectorAll('.sidebar nav button').forEach(botao =>
    botao.classList.toggle('active', botao.dataset.tela === 'lancamentos'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  carregarLancamentos();
}
function fecharTelaLancamentos() {
  document.body.classList.remove('tela-lancamentos');
  fecharFlutuantes();
  fecharCaixa();
}
window.abrirTelaLancamentos = abrirTelaLancamentos;

document.querySelector('[data-tela="lancamentos"]')?.addEventListener('click', abrirTelaLancamentos);
document.querySelectorAll('.sidebar nav button:not([data-tela="lancamentos"])').forEach(botao =>
  botao.addEventListener('click', fecharTelaLancamentos));

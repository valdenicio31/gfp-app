/* Leitura de fatura de cartão do GFP Familiar.

   A fatura difere do extrato em duas coisas. Primeiro, tudo nela é gasto: não
   existe sinal negativo, e um valor positivo não é receita. Segundo, boa parte
   dos emissores já classifica a compra — ora numa coluna da linha, ora
   agrupando as compras sob o título da categoria.

   Essa categoria vem no vocabulário do emissor ("Restaurantes", "Serviços"),
   que não é o do GFP. Ela é guardada como veio, em source_category, e o de-para
   de cada cartão traduz. Ensinado uma vez, vale para as próximas faturas.

   Depende de v2-extrato.js (datas, valores e limpeza de descrição). */

const VALOR_NA_LINHA = /-?\s*R?\$?\s*\d{1,3}(?:\.\d{3})+,\d{2}|-?\s*R?\$?\s*\d+,\d{2}/g;
const DATA_NA_LINHA = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\s+/;

// "3/10", "PARC 03 DE 10", "PARCELA 3/10" — a compra parcelada aparece assim.
const PARCELA_NA_LINHA = /\b(?:parc(?:ela)?\.?\s*)?(\d{1,2})\s*(?:\/|\s+de\s+)\s*(\d{1,2})\b/i;

// Linhas que existem em toda fatura e não são compra nem categoria.
const RUIDO_DA_FATURA = /\b(total|subtotal|limite|vencimento|fechamento|pagamento m[íi]nimo|encargos|juros|multa|iof|saldo|p[áa]gina|cpf|cnpj|central de atendimento|ouvidoria|sac|fatura anterior|d[ée]bito autom[áa]tico|sacador|avalista|titular|portador|final|nome|banco|ag[êe]ncia|conta|emiss[ãa]o|parcelas?)\b/i;

const soLetras = texto => String(texto || '').replace(/[^a-zà-ú\s]/gi, '').trim();

/* ---------- categoria: título de seção ou coluna da linha ---------- */

// Um título de seção é uma linha curta, sem data e sem valor, que não é ruído
// de cabeçalho ou rodapé — e que só vale como categoria se vier compra depois.
function pareceTituloDeCategoria(linha) {
  const texto = String(linha || '').trim();
  if (!texto || texto.length > 30) return false;
  if (DATA_NA_LINHA.test(texto)) return false;
  if (VALOR_NA_LINHA.test(texto)) { VALOR_NA_LINHA.lastIndex = 0; return false; }
  VALOR_NA_LINHA.lastIndex = 0;
  if (RUIDO_DA_FATURA.test(texto)) return false;

  // Uma fatura real do Itaú mostrou o que o filtro largo deixava passar:
  // "Sacador Avalista:" (rótulo de campo), "VALDENICIO MELLO A BARBO(final
  // 8279)" (nome do titular), "DIVERSOS .PINHAIS" (praça do estabelecimento)
  // e "parcelas." (pedaço de frase). Categoria de verdade é uma ou duas
  // palavras limpas: sem número, sem pontuação de campo, sem ponto solto.
  if (/[0-9():;=*]/.test(texto)) return false;
  if (/[.,-]\s*$/.test(texto)) return false;
  if (/\s\.|\.\s/.test(texto)) return false;

  const palavras = soLetras(texto).split(/\s+/).filter(Boolean);
  if (!palavras.length || palavras.length > 3) return false;
  // Ao menos uma palavra de verdade, não só siglas soltas.
  return palavras.some(p => p.length >= 4) && soLetras(texto).length >= 4;
}

/** Lê a fatura e devolve as compras, com a categoria do emissor quando existe.
 *
 *  categoriasConhecidas: nomes que o emissor usa e que já apareceram antes —
 *  ajuda a reconhecer a categoria escrita na própria linha, não só em seção. */
function lerFaturaCartao(texto, { categoriasConhecidas = [] } = {}) {
  const linhas = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!linhas.length) return { compras: [], categoriasVistas: [], avisos: ['A fatura não tem texto legível.'] };

  const ano = (() => {
    for (const linha of linhas.slice(0, 40)) {
      const m = String(linha).match(/\b(20\d{2})\b/);
      if (m) return Number(m[1]);
    }
    return new Date().getFullYear();
  })();

  const conhecidas = new Map(categoriasConhecidas
    .filter(Boolean).map(nome => [soLetras(nome).toLowerCase(), nome]));

  const compras = [];
  const categoriasVistas = new Set();
  const avisos = [];
  let secaoAtual = '';
  let secaoPendente = '';
  let ignoradas = 0;

  for (const linha of linhas) {
    const data = linha.match(DATA_NA_LINHA);
    if (!data) {
      // Guarda o candidato a título; ele só vira seção quando vier uma compra.
      if (pareceTituloDeCategoria(linha)) secaoPendente = linha.trim();
      else ignoradas += 1;
      continue;
    }

    const corpo = linha.slice(data[0].length);
    const valores = corpo.match(VALOR_NA_LINHA);
    VALOR_NA_LINHA.lastIndex = 0;
    if (!valores || !valores.length) { ignoradas += 1; continue; }

    const iso = GFPExtrato.paraDataIso(data[3]
      ? `${data[1]}/${data[2]}/${data[3]}`
      : `${data[1]}/${data[2]}/${ano}`);
    if (!iso) { ignoradas += 1; continue; }

    // O último valor da linha é o da compra; antes dele pode vir cotação de
    // moeda estrangeira, que não é o que se lança.
    const bruto = valores[valores.length - 1];
    const centavos = Math.abs(GFPExtrato.paraCentavos(bruto) || 0);
    if (!centavos) { ignoradas += 1; continue; }

    if (secaoPendente) { secaoAtual = secaoPendente; secaoPendente = ''; }

    let descricao = corpo.slice(0, corpo.lastIndexOf(bruto)).trim();

    // Categoria escrita na própria linha: aparece no fim da descrição.
    let categoriaDaLinha = '';
    for (const [chave, nome] of conhecidas) {
      const alvo = soLetras(descricao).toLowerCase();
      if (chave && alvo.endsWith(chave)) {
        categoriaDaLinha = nome;
        descricao = descricao.slice(0, descricao.toLowerCase().lastIndexOf(chave.split(' ')[0])).trim() || descricao;
        break;
      }
    }

    const parcela = descricao.match(PARCELA_NA_LINHA);
    const parcelas = parcela ? Math.max(Number(parcela[2]) || 1, 1) : 1;

    const origem = categoriaDaLinha || secaoAtual || '';
    if (origem) categoriasVistas.add(origem);

    compras.push({
      purchasedOn: iso,
      description: GFPExtrato.limparDescricao(descricao) || 'Compra importada',
      descricaoOriginal: descricao,
      amountCents: centavos,
      installments: parcelas,
      sourceCategory: origem,
      category: ''
    });
  }

  if (!compras.length) {
    avisos.push('Não achei compras nesta fatura. Confira se o arquivo é a fatura e não o comprovante de pagamento.');
  }
  if (ignoradas) {
    avisos.push(`${ignoradas} ${ignoradas === 1 ? 'linha ignorada' : 'linhas ignoradas'} (cabeçalho, rodapé e totais).`);
  }
  if (compras.length && !categoriasVistas.size) {
    avisos.push('Esta fatura não traz categoria: as compras entram sem classificação e podem ser categorizadas na tela.');
  }
  avisos.push('Tudo na fatura é gasto — nenhum valor entra como receita.');
  return { compras, categoriasVistas: [...categoriasVistas], avisos };
}

/** Aplica o de-para do cartão sobre as compras lidas.
 *  mapa: { 'Restaurantes': 'Alimentação', ... } */
function aplicarDePara(compras, mapa = {}) {
  return compras.map(compra => ({
    ...compra,
    category: compra.category || (compra.sourceCategory ? (mapa[compra.sourceCategory] || '') : '')
  }));
}

const GFPFatura = { lerFaturaCartao, aplicarDePara, pareceTituloDeCategoria };
if (typeof window !== 'undefined') window.GFPFatura = GFPFatura;
if (typeof module !== 'undefined' && module.exports) module.exports = GFPFatura;

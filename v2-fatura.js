/* Leitura de fatura de cartão do GFP.

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

/** Tira do título da seção a categoria em si.
 *
 *  O Itaú escreve a categoria seguida da praça do estabelecimento:
 *  "DIVERSOS .PINHAIS", "MORADIA .OSASCO", "DIVERSOS ." — a categoria é o que
 *  vem antes do ponto. Já "TURISMO E ENTRETENIM." termina em ponto porque o
 *  próprio emissor abreviou, e aí o ponto faz parte do nome.
 *
 *  Devolve '' quando a linha nem chega a ser um título. */
function categoriaDoTitulo(linha) {
  let texto = String(linha || '').trim();
  if (!texto || texto.length > 40) return '';
  if (DATA_NA_LINHA.test(texto)) return '';
  if (VALOR_NA_LINHA.test(texto)) { VALOR_NA_LINHA.lastIndex = 0; return ''; }
  VALOR_NA_LINHA.lastIndex = 0;

  // " ." separa a categoria da praça; "." colado é abreviação e fica.
  const corte = texto.indexOf(' .');
  if (corte > 0) texto = texto.slice(0, corte);
  return texto.trim();
}

// Um título de seção é uma linha curta, sem data e sem valor, que não é ruído
// de cabeçalho ou rodapé — e que só vale como categoria se vier compra depois.
function pareceTituloDeCategoria(linha) {
  const nucleo = categoriaDoTitulo(linha);
  if (!nucleo) return false;
  if (RUIDO_DA_FATURA.test(nucleo)) return false;

  // Uma fatura real do Itaú mostrou o que o filtro largo deixava passar:
  // "Sacador Avalista:" (rótulo de campo), "VALDENICIO MELLO A BARBO(final
  // 8279)" (nome do titular), "parcelas." e "Continua..." (pedaços de frase).
  if (/[0-9():;=*]/.test(nucleo)) return false;
  if (/\.\.\./.test(String(linha))) return false;
  // O emissor escreve a categoria em caixa alta; frase corrida vem em minúscula.
  if (nucleo === nucleo.toLowerCase() && /\s|\.$/.test(String(linha).trim())) return false;

  const palavras = soLetras(nucleo).split(/\s+/).filter(Boolean);
  if (!palavras.length || palavras.length > 3) return false;
  return palavras.some(p => p.length >= 4) && soLetras(nucleo).length >= 4;
}

/** Fatura exportada como planilha (CSV/TXT).
 *
 *  Reaproveita o leitor delimitado do extrato, que já descobre sozinho quais
 *  colunas são data, descrição, valor e categoria. Devolve null quando o texto
 *  não é tabela — aí a leitura segue pelo caminho do PDF.
 *
 *  Na fatura todo valor é gasto: o sinal que o arquivo traga é ignorado. */
function lerFaturaDeTabela(texto) {
  const lido = GFPExtrato.lerDelimitado(String(texto || ''));
  if (!lido || !lido.linhas || !lido.linhas.length) return null;

  const categoriasVistas = new Set();
  const compras = lido.linhas.map(linha => {
    const origem = String(linha.sourceCategory || '').trim();
    if (origem) categoriasVistas.add(origem);
    return {
      purchasedOn: linha.occurredOn,
      description: linha.description,
      descricaoOriginal: linha.descricaoOriginal || linha.description,
      amountCents: Math.abs(linha.amountCents),
      installments: 1,
      sourceCategory: origem,
      category: ''
    };
  });

  const avisos = [...(lido.avisos || [])];
  if (!categoriasVistas.size) {
    avisos.push('Esta fatura não traz categoria: as compras entram sem classificação e podem ser categorizadas na tela.');
  }
  avisos.push('Tudo na fatura é gasto — nenhum valor entra como receita.');
  return { compras, categoriasVistas: [...categoriasVistas], avisos, formato: 'planilha' };
}

/** Lê a fatura e devolve as compras, com a categoria do emissor quando existe.
 *
 *  categoriasConhecidas: nomes que o emissor usa e que já apareceram antes —
 *  ajuda a reconhecer a categoria escrita na própria linha, não só em seção. */
function lerFaturaCartao(texto, { categoriasConhecidas = [] } = {}) {
  const linhas = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!linhas.length) return { compras: [], categoriasVistas: [], avisos: ['A fatura não tem texto legível.'] };

  // Nem toda fatura vem em PDF. O Nubank, por exemplo, exporta CSV com colunas
  // date, title, amount e às vezes category — e ali a data não abre a linha
  // nem o valor usa vírgula decimal, então o caminho do PDF não enxerga nada.
  const comoTabela = lerFaturaDeTabela(texto);
  if (comoTabela) return comoTabela;

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
      if (pareceTituloDeCategoria(linha)) secaoPendente = categoriaDoTitulo(linha);
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

const GFPFatura = { lerFaturaCartao, lerFaturaDeTabela, aplicarDePara, pareceTituloDeCategoria, categoriaDoTitulo };
if (typeof window !== 'undefined') window.GFPFatura = GFPFatura;
if (typeof module !== 'undefined' && module.exports) module.exports = GFPFatura;

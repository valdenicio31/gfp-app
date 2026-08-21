/* Leitor de extrato bancário do GFP Familiar.
   Recebe o texto de um arquivo de qualquer banco e devolve lançamentos prontos.
   Entende OFX (todos os bancos exportam) e arquivos separados por ; , ou tabulação,
   descobrindo sozinho quais colunas são data, descrição e valor.
   Funciona no navegador e também é testável no Node. */

const MESES_CURTOS = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

const semAcentos = texto => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const minusculo = texto => semAcentos(texto).toLowerCase().trim();

// ---------- data ----------
// Aceita 19/08/2026, 19-08-2026, 2026-08-19, 19/08/26, 20260819 e "19 ago 2026".
function paraDataIso(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;

  let m = texto.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return montarData(m[1], m[2], m[3]);

  m = texto.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) return montarData(m[3], m[2], m[1]);

  m = texto.match(/^(\d{8})$/);
  if (m) {
    const bruto = m[1];
    // 20260819 começa com o ano; 19082026 começa com o dia
    const comoAnoNaFrente = montarData(bruto.slice(0, 4), bruto.slice(4, 6), bruto.slice(6, 8));
    const comoDiaNaFrente = montarData(bruto.slice(4, 8), bruto.slice(2, 4), bruto.slice(0, 2));
    const inicio = Number(bruto.slice(0, 4));
    // 20260819 começa com o ano de verdade; 19082026 só parece, então cai no dia na frente
    return (inicio >= 1990 && inicio <= 2100 && comoAnoNaFrente) ? comoAnoNaFrente : (comoDiaNaFrente || comoAnoNaFrente);
  }

  m = minusculo(texto).match(/^(\d{1,2})\s*(?:de\s*)?([a-z]{3})[a-z]*\.?\s*(?:de\s*)?(\d{2,4})/);
  if (m && MESES_CURTOS[m[2]]) return montarData(m[3], MESES_CURTOS[m[2]], m[1]);

  return null;
}

function montarData(ano, mes, dia) {
  let a = Number(ano), m = Number(mes), d = Number(dia);
  if (!a || !m || !d) return null;
  if (a < 100) a += a > 70 ? 1900 : 2000;
  if (m > 12 && d <= 12) [m, d] = [d, m];          // veio no formato americano
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const conferencia = new Date(iso + 'T12:00:00Z');
  return Number.isNaN(conferencia.getTime()) || conferencia.getUTCDate() !== d ? null : iso;
}

// ---------- valor ----------
// Aceita "R$ 1.234,56", "-842,90", "1,234.56", "(1.234,56)" e "1234".
// Devolve centavos inteiros, com sinal.
function paraCentavos(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') return Math.round(valor * 100);

  let texto = String(valor).trim();
  if (!texto) return null;
  const negativoPorParenteses = /^\(.*\)$/.test(texto);
  const temD = /\bD\b\s*$/i.test(texto) && !/\bC\b/i.test(texto);   // extratos com C/D no fim
  texto = texto.replace(/[()]/g, '').replace(/\b[CD]\b\s*$/i, '');
  texto = texto.replace(/r\$|brl/gi, '').replace(/\s| /g, '');
  const negativo = negativoPorParenteses || temD || texto.includes('-');
  texto = texto.replace(/[+-]/g, '');
  if (!/\d/.test(texto)) return null;

  const ultimaVirgula = texto.lastIndexOf(',');
  const ultimoPonto = texto.lastIndexOf('.');
  let numero;
  if (ultimaVirgula > ultimoPonto) {
    numero = texto.replace(/\./g, '').replace(',', '.');            // 1.234,56
  } else if (ultimoPonto > ultimaVirgula) {
    numero = texto.replace(/,/g, '');                               // 1,234.56
  } else {
    numero = texto;
  }
  const centavos = Math.round(Number(numero) * 100);
  if (!Number.isFinite(centavos)) return null;
  return negativo ? -centavos : centavos;
}

// ---------- descrição ----------
// Tira o ruído que os bancos colocam: códigos, datas repetidas, "compra no débito", etc.
function limparDescricao(texto) {
  let limpo = String(texto ?? '').replace(/\s+/g, ' ').trim();
  limpo = limpo.replace(/^(compra\s+(no\s+)?(debito|credito|cartao)|pagamento\s+de\s+boleto|debito\s+automatico)\s*[-:]?\s*/i, m => m.trim() + ' — ');
  limpo = limpo.replace(/\b\d{2}\/\d{2}(\/\d{2,4})?\b/g, ' ');                    // datas soltas
  limpo = limpo.replace(/\b\d{2}:\d{2}(:\d{2})?\b/g, ' ');                        // horas
  limpo = limpo.replace(/\b(id|aut|nsu|doc|ref|cod|codigo)[.:\s]*[a-z0-9-]{4,}\b/gi, ' ');
  limpo = limpo.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ' ');
  limpo = limpo.replace(/\b\d{10,}\b/g, ' ');                                     // números longos
  limpo = limpo.replace(/\s*[-–—]\s*$/,'').replace(/\s{2,}/g, ' ').trim();
  return limpo || String(texto ?? '').trim();
}

// ---------- OFX ----------
function lerOfx(texto) {
  const linhas = [];
  const blocos = texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  const pegar = (bloco, etiqueta) => {
    const m = bloco.match(new RegExp(`<${etiqueta}>([^<\\r\\n]*)`, 'i'));
    return m ? m[1].trim() : '';
  };
  for (const bloco of blocos) {
    const data = paraDataIso(pegar(bloco, 'DTPOSTED').slice(0, 8));
    const centavos = paraCentavos(pegar(bloco, 'TRNAMT'));
    const memo = pegar(bloco, 'MEMO') || pegar(bloco, 'NAME');
    const tipo = pegar(bloco, 'TRNTYPE').toUpperCase();
    if (!data || centavos === null || centavos === 0) continue;
    linhas.push({
      occurredOn: data,
      description: limparDescricao(memo || (tipo === 'CREDIT' ? 'Crédito' : 'Débito')),
      descricaoOriginal: memo,
      amountCents: Math.abs(centavos),
      type: centavos > 0 ? 'income' : 'expense',
      identificador: pegar(bloco, 'FITID')
    });
  }
  return linhas;
}

// ---------- arquivos separados por delimitador ----------
const PALAVRAS = {
  data: ['data', 'date', 'data lancamento', 'data do lancamento', 'data movimento', 'dt', 'data da compra', 'data de compra', 'data mov'],
  descricao: ['descricao', 'description', 'historico', 'lancamento', 'title', 'memo', 'detalhe', 'detalhes', 'estabelecimento', 'razao social', 'operacao', 'movimentacao'],
  valor: ['valor', 'amount', 'value', 'montante', 'valor (r$)', 'valor r$', 'valor da compra', 'net_credit_amount', 'transaction_amount', 'valor liquido'],
  credito: ['credito', 'entrada', 'receita', 'net_credit_amount', 'valor credito'],
  debito: ['debito', 'saida', 'despesa', 'net_debit_amount', 'valor debito'],
  saldo: ['saldo', 'balance', 'saldo (r$)']
};

function separarLinha(linha, delimitador) {
  const campos = [];
  let atual = '', dentroDeAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') { atual += '"'; i++; }
      else dentroDeAspas = !dentroDeAspas;
    } else if (c === delimitador && !dentroDeAspas) {
      campos.push(atual); atual = '';
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map(campo => campo.trim().replace(/^"|"$/g, '').trim());
}

// Ganha o delimitador cuja quantidade de colunas mais se repete entre as linhas:
// é o sinal de que ele realmente separa a tabela, e não de que caiu no meio de um valor.
function descobrirDelimitador(linhas) {
  const candidatos = [';', '\t', ',', '|'];
  let melhor = ';', melhorNota = -1;
  for (const delimitador of candidatos) {
    const contagens = linhas.slice(0, 40).map(linha => separarLinha(linha, delimitador).length);
    const repeticoes = new Map();
    for (const quantas of contagens) if (quantas > 1) repeticoes.set(quantas, (repeticoes.get(quantas) || 0) + 1);
    let nota = 0;
    for (const [quantas, vezes] of repeticoes) nota = Math.max(nota, quantas * vezes);
    if (nota > melhorNota) { melhorNota = nota; melhor = delimitador; }
  }
  return melhor;
}

// Acha a linha de cabeçalho e o papel de cada coluna.
function mapearColunas(linhas, delimitador) {
  for (let i = 0; i < Math.min(linhas.length, 25); i++) {
    const campos = separarLinha(linhas[i], delimitador).map(minusculo);
    if (campos.length < 2) continue;
    const mapa = {};
    campos.forEach((campo, indice) => {
      for (const [papel, palavras] of Object.entries(PALAVRAS)) {
        if (mapa[papel] !== undefined) continue;
        if (palavras.some(palavra => campo === palavra || campo.includes(palavra))) mapa[papel] = indice;
      }
    });
    const temValor = mapa.valor !== undefined || mapa.credito !== undefined || mapa.debito !== undefined;
    if (mapa.data !== undefined && temValor) return { cabecalho: i, mapa, campos };
  }
  return null;
}

// Sem cabeçalho reconhecível: acha a coluna de data, a de valor e a maior coluna de texto.
function adivinharColunas(linhas, delimitador) {
  const amostra = linhas.slice(0, 40).map(linha => separarLinha(linha, delimitador)).filter(campos => campos.length >= 2);
  if (!amostra.length) return null;
  const total = amostra[0].length;
  const nota = { data: [], valor: [], texto: [] };
  for (let coluna = 0; coluna < total; coluna++) {
    let datas = 0, valores = 0, tamanho = 0;
    for (const campos of amostra) {
      const campo = campos[coluna] ?? '';
      if (paraDataIso(campo)) datas++;
      if (/\d/.test(campo) && paraCentavos(campo) !== null && !paraDataIso(campo)) valores++;
      tamanho += campo.replace(/[\d\s.,-]/g, '').length;
    }
    nota.data.push(datas); nota.valor.push(valores); nota.texto.push(tamanho);
  }
  const maior = lista => lista.indexOf(Math.max(...lista));
  const colunaData = maior(nota.data);
  if (nota.data[colunaData] < Math.max(2, amostra.length * 0.5)) return null;
  const notaValor = nota.valor.map((v, i) => (i === colunaData ? -1 : v));
  const colunaValor = maior(notaValor);
  const notaTexto = nota.texto.map((v, i) => (i === colunaData || i === colunaValor ? -1 : v));
  const colunaTexto = maior(notaTexto);
  return { cabecalho: -1, mapa: { data: colunaData, valor: colunaValor, descricao: colunaTexto >= 0 ? colunaTexto : undefined }, campos: [] };
}

function lerDelimitado(texto) {
  const linhas = texto.split(/\r?\n/).filter(linha => linha.trim().length);
  if (!linhas.length) return { linhas: [], avisos: ['O arquivo está vazio.'] };
  const delimitador = descobrirDelimitador(linhas);
  const encontrado = mapearColunas(linhas, delimitador) || adivinharColunas(linhas, delimitador);
  if (!encontrado) return { linhas: [], avisos: ['Não encontrei as colunas de data e valor neste arquivo.'] };

  const { cabecalho, mapa } = encontrado;
  const resultado = [], avisos = [];
  let ignoradas = 0;

  for (let i = cabecalho + 1; i < linhas.length; i++) {
    const campos = separarLinha(linhas[i], delimitador);
    const data = paraDataIso(campos[mapa.data]);
    if (!data) { ignoradas++; continue; }

    let centavos = null;
    if (mapa.valor !== undefined) centavos = paraCentavos(campos[mapa.valor]);
    if ((centavos === null || centavos === 0) && (mapa.credito !== undefined || mapa.debito !== undefined)) {
      const credito = Math.abs(paraCentavos(campos[mapa.credito]) || 0);
      const debito = Math.abs(paraCentavos(campos[mapa.debito]) || 0);
      centavos = credito ? credito : -debito;
    }
    if (centavos === null || centavos === 0) { ignoradas++; continue; }

    const bruta = mapa.descricao !== undefined ? campos[mapa.descricao] : '';
    resultado.push({
      occurredOn: data,
      description: limparDescricao(bruta) || 'Lançamento importado',
      descricaoOriginal: String(bruta || '').trim(),
      amountCents: Math.abs(centavos),
      type: centavos > 0 ? 'income' : 'expense',
      identificador: ''
    });
  }
  if (ignoradas) avisos.push(`${ignoradas} ${ignoradas === 1 ? 'linha ignorada' : 'linhas ignoradas'} (cabeçalho, saldo ou linha sem data e valor).`);
  return { linhas: resultado, avisos, delimitador };
}

// ---------- porta de entrada ----------
function lerExtrato(texto, nomeArquivo = '') {
  const conteudo = String(texto || '').replace(/^﻿/, '');
  const pareceOfx = /<STMTTRN>/i.test(conteudo) || /<OFX>/i.test(conteudo) || /\.ofx$/i.test(nomeArquivo);
  const resultado = pareceOfx
    ? { formato: 'OFX', linhas: lerOfx(conteudo), avisos: [] }
    : { formato: 'Planilha/CSV', ...lerDelimitado(conteudo) };
  resultado.avisos = resultado.avisos || [];
  if (pareceOfx && !resultado.linhas.length) resultado.avisos.push('O arquivo parece OFX mas não achei lançamentos dentro dele.');

  // Fatura de cartão costuma vir só com números positivos: tudo ali é saída.
  resultado.todosPositivos = resultado.linhas.length > 0 && resultado.linhas.every(linha => linha.type === 'income');
  if (resultado.todosPositivos) {
    resultado.avisos.push('Nenhum valor negativo no arquivo — parece fatura de cartão. Confirme se tudo deve entrar como saída.');
  }
  return resultado;
}

const GFPExtrato = { lerExtrato, lerOfx, lerDelimitado, paraDataIso, paraCentavos, limparDescricao, separarLinha, descobrirDelimitador };
if (typeof window !== 'undefined') window.GFPExtrato = GFPExtrato;
if (typeof module !== 'undefined' && module.exports) module.exports = GFPExtrato;

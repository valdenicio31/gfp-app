/* Leitura de extrato e fatura em PDF do GFP.

   O PDF não é um formato de dados: é um formato de página. Aqui o trabalho é
   devolver o texto na ordem em que a pessoa lê — cada lançamento em uma linha —
   para que v2-extrato.js possa interpretá-lo como interpreta CSV e OFX.

   Extratos e faturas de banco costumam vir protegidos por senha (o Itaú é um
   deles). Quando isso acontece, pedimos a senha a quem está importando; ela
   fica só na memória do navegador, nunca é enviada ao servidor nem gravada. */

const PDF_LIB = 'assets/vendor/pdf.min.js';
const PDF_WORKER = 'assets/vendor/pdf.worker.min.js';

let pdfjsCarregado = null;

// A biblioteca tem 330 KB: só carrega quando alguém importa um PDF de verdade.
async function carregarPdfjs() {
  if (!pdfjsCarregado) {
    pdfjsCarregado = import(new URL(PDF_LIB, document.baseURI).href).then(lib => {
      lib.GlobalWorkerOptions.workerSrc = new URL(PDF_WORKER, document.baseURI).href;
      return lib;
    }).catch(falha => {
      pdfjsCarregado = null;                 // permite tentar de novo
      throw new Error('não consegui carregar o leitor de PDF: ' + falha.message);
    });
  }
  return pdfjsCarregado;
}

/* ---------- do desenho da página para linhas de texto ---------- */

// O PDF entrega pedaços soltos de texto, cada um com sua posição. Dois pedaços
// na mesma altura pertencem à mesma linha do extrato; a ordem dentro da linha é
// a horizontal. Sem isso, data, descrição e valor saem embaralhados.
function pedacosEmLinhas(itens, toleranciaY = 2.5) {
  const pedacos = itens
    .filter(item => String(item.str || '').trim().length)
    .map(item => ({
      texto: item.str,
      x: Array.isArray(item.transform) ? item.transform[4] : 0,
      y: Array.isArray(item.transform) ? item.transform[5] : 0,
      largura: Number(item.width) || 0
    }));

  const linhas = [];
  for (const pedaco of pedacos) {
    // y cresce de baixo para cima no PDF, por isso a busca é pela altura próxima.
    const linha = linhas.find(atual => Math.abs(atual.y - pedaco.y) <= toleranciaY);
    if (linha) {
      linha.pedacos.push(pedaco);
      linha.y = (linha.y * (linha.pedacos.length - 1) + pedaco.y) / linha.pedacos.length;
    } else {
      linhas.push({ y: pedaco.y, pedacos: [pedaco] });
    }
  }

  // Juntar tudo com espaço parte palavra ao meio: o PDF entrega a letra
  // acentuada como pedaço próprio, e "VESTUÁRIO" chegava como "VESTU Á RIO".
  // Só há espaço de verdade quando existe distância entre um pedaço e o
  // seguinte; encostados, são a mesma palavra.
  const juntar = pedacos => pedacos.reduce((texto, pedaco, indice) => {
    const anterior = pedacos[indice - 1];
    if (!anterior) return pedaco.texto.trim();
    const fimDoAnterior = anterior.x + anterior.largura;
    const separado = pedaco.x - fimDoAnterior > 0.8;
    return texto + (separado ? ' ' : '') + pedaco.texto.trim();
  }, '');

  return linhas
    .sort((a, b) => b.y - a.y)              // de cima para baixo
    .map(linha => juntar(linha.pedacos.sort((a, b) => a.x - b.x))
      .replace(/\s{2,}/g, ' ')
      .trim())
    .filter(Boolean);
}

/* ---------- porta de entrada ---------- */

/** Extrai o texto de um PDF, uma linha do extrato por linha do resultado.
 *
 *  arquivo    File ou ArrayBuffer
 *  pedirSenha função opcional; recebe {tentativa} e devolve a senha digitada,
 *             ou null para desistir. É chamada só quando o PDF é protegido.
 *
 *  Devolve { texto, paginas, protegido }. */
async function extrairTexto(arquivo, pedirSenha) {
  const lib = await carregarPdfjs();
  const bytes = arquivo instanceof ArrayBuffer ? arquivo : await arquivo.arrayBuffer();
  let senha = '';
  let protegido = false;

  for (let tentativa = 1; ; tentativa++) {
    let documento;
    try {
      // A cópia é obrigatória: a pdf.js consome (detaches) o buffer que recebe,
      // e sem ela a segunda tentativa de senha leria um buffer vazio.
      documento = await lib.getDocument({ data: bytes.slice(0), password: senha }).promise;
    } catch (falha) {
      const precisaSenha = falha?.name === 'PasswordException'
        || /password/i.test(falha?.message || '');
      if (!precisaSenha || typeof pedirSenha !== 'function') {
        if (precisaSenha) throw new Error('este PDF é protegido por senha.');
        throw new Error(falha?.message || 'não consegui abrir o PDF.');
      }
      protegido = true;
      senha = await pedirSenha({ tentativa, errada: tentativa > 1 });
      if (senha === null || senha === undefined) throw new Error('importação cancelada: o PDF precisa da senha.');
      continue;
    }

    const linhas = [];
    for (let pagina = 1; pagina <= documento.numPages; pagina++) {
      const conteudo = await (await documento.getPage(pagina)).getTextContent();
      linhas.push(...pedacosEmLinhas(conteudo.items));
    }
    const paginas = documento.numPages;
    await documento.destroy();

    if (!linhas.length) {
      throw new Error('o PDF não tem texto — parece ser digitalizado (imagem). '
        + 'Exporte o extrato em OFX ou CSV pelo aplicativo do banco.');
    }
    return { texto: linhas.join('\n'), paginas, protegido };
  }
}

const GFPPdf = { extrairTexto, pedacosEmLinhas };
if (typeof window !== 'undefined') window.GFPPdf = GFPPdf;
if (typeof module !== 'undefined' && module.exports) module.exports = GFPPdf;

/* Reconhecimento de fornecedor e sugestão de categoria do GFP Familiar.
   Duas fontes, nesta ordem: o histórico já categorizado da própria família
   (o que o usuário ensinou vale mais) e uma lista de padrões brasileiros.
   Funciona no navegador e é testável no Node. */

const semAcento_ = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const chave = t => semAcento_(t).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Ruído do banco: sai sempre.
const RUIDO = new Set(['COMPRA', 'NO', 'NA', 'DEBITO', 'CREDITO', 'CARTAO', 'PAGAMENTO', 'PAGTO', 'PAG',
  'RECEBIDO', 'RECEBIDA', 'ENVIADO', 'ENVIADA', 'PELO', 'PELA', 'VIA', 'PIX', 'TED', 'DOC', 'TRANSFERENCIA',
  'TRANSF', 'TRANSFER', 'PARA', 'POR', 'COM', 'LTDA', 'ME', 'MEI', 'SA', 'EIRELI', 'EPP', 'BRASIL', 'BR',
  'COMERCIO', 'SERVICOS', 'AUT', 'NSU', 'REF', 'PARC', 'PARCELA', 'MENSALIDADE', 'CIA', 'DISTRIBUIDORA']);
// Conectores: só saem quando ficam sobrando na ponta do nome.
const CONECTORES = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'EM']);

// [padrão, nome do fornecedor (ou null para usar a descrição), categoria]
const REGRAS = [
  // Alimentação
  [/\bASSAI\b/, 'Assaí Atacadista', 'Alimentação'], [/\bATACADAO\b/, 'Atacadão', 'Alimentação'],
  [/\bCARREFOUR\b/, 'Carrefour', 'Alimentação'], [/\bPAO DE ACUCAR|\bPAODEACUCAR\b/, 'Pão de Açúcar', 'Alimentação'],
  [/\bANGELONI\b/, 'Supermercado Angeloni', 'Alimentação'], [/\bIFOOD\b/, 'iFood', 'Alimentação'],
  [/\bRAPPI\b/, 'Rappi', 'Alimentação'], [/\bZE DELIVERY|\bZEDELIVERY\b/, 'Zé Delivery', 'Alimentação'],
  [/\bMC ?DONALD|\bMETHOD MCD\b/, "McDonald's", 'Alimentação'], [/\bBURGER KING|\bBK \b/, 'Burger King', 'Alimentação'],
  [/\bSUBWAY\b/, 'Subway', 'Alimentação'], [/\bOUTBACK\b/, 'Outback', 'Alimentação'],
  [/\bHABIB|\bBOB S|\bSPOLETO|\bGIRAFFAS\b/, null, 'Alimentação'], [/\bSTARBUCKS\b/, 'Starbucks', 'Alimentação'],
  // "mercado livre" e "mercado pago" não são supermercado
  [/\bSUPERMERCAD|\bMERCADO(?! LIVRE| PAGO)\b|\bMERCEARIA|\bHORTIFRUT|\bFEIRA\b|\bPADARIA|\bACOUGUE|\bEMPORIO/, null, 'Alimentação'],
  [/\bRESTAURANTE|\bPIZZARIA|\bLANCHONETE|\bCHURRASCARIA|\bCAFETERIA|\bSUSHI|\bTEMAKI|\bACAI\b/, null, 'Alimentação'],
  // Transporte
  [/\bUBER\b/, 'Uber', 'Transporte'], [/\b99 ?(APP|POP|TAXI)?\b/, '99', 'Transporte'],
  [/\bIPIRANGA\b/, 'Posto Ipiranga', 'Transporte'], [/\bSHELL\b/, 'Shell', 'Transporte'],
  [/\bPETROBRAS|\bBR MANIA|\bPOSTO\b/, null, 'Transporte'],
  [/\bSEM PARAR|\bCONECTCAR|\bVELOE|\bESTACIONAMENTO|\bZONA AZUL|\bPEDAGIO/, null, 'Transporte'],
  [/\bIPVA\b|\bDETRAN|\bLICENCIAMENTO/, null, 'Transporte'],
  [/\bLOCALIZA|\bMOVIDA|\bUNIDAS\b|\bCABIFY|\bBUSER\b/, null, 'Transporte'],
  // Casa
  [/\bALUGUEL|\bIMOBILIARIA|\bCONDOMINIO|\bIPTU\b/, null, 'Casa'],
  [/\bCELESC|\bCEMIG|\bCOPEL|\bENEL\b|\bLIGHT\b|\bCPFL|\bENERGISA|\bENERGIA ELETRICA/, null, 'Casa'],
  [/\bSABESP|\bCASAN\b|\bSANEPAR|\bCEDAE|\bCOPASA|\bAGUA E ESGOTO/, null, 'Casa'],
  [/\bCOMGAS|\bULTRAGAZ|\bLIQUIGAS|\bCOPAGAZ|\bGAS \b/, null, 'Casa'],
  [/\bVIVO\b|\bCLARO\b|\bTIM \b|\bOI FIXO|\bOI MOVEL|\bNET SERVICOS|\bSKY\b|\bINTERNET|\bBANDA LARGA|\bTELEFONE/, null, 'Casa'],
  [/\bLEROY MERLIN|\bTELHANORTE|\bC C\b|\bMATERIAL DE CONSTRUCAO|\bTOK STOK|\bMOBLY/, null, 'Casa'],
  // Saúde
  [/\bDROGASIL\b/, 'Drogasil', 'Saúde'], [/\bDROGA ?RAIA|\bRAIADROGASIL/, 'Droga Raia', 'Saúde'],
  [/\bPANVEL|\bPACHECO|\bFARMACIA|\bDROGARIA|\bDROGARIAS/, null, 'Saúde'],
  [/\bUNIMED\b/, 'Unimed', 'Saúde'], [/\bAMIL\b|\bSULAMERICA|\bSUL AMERICA|\bHAPVIDA|\bNOTREDAME|\bPLANO DE SAUDE/, null, 'Saúde'],
  [/\bHOSPITAL|\bCLINICA|\bLABORATORIO|\bFLEURY|\bDASA\b|\bDENTISTA|\bODONTO|\bPSICOLOG|\bFISIOTERAPIA|\bEXAME/, null, 'Saúde'],
  [/\bACADEMIA|\bSMART FIT|\bSMARTFIT|\bBIO RITMO|\bCROSSFIT/, null, 'Saúde'],
  // Educação
  [/\bMAPLE BEAR\b/, 'Escola Maple Bear', 'Educação'],
  [/\bESCOLA|\bCOLEGIO|\bFACULDADE|\bUNIVERSIDADE|\bUNOPAR|\bESTACIO|\bANHANGUERA|\bCRECHE|\bBERCARIO/, null, 'Educação'],
  [/\bKUMON|\bWIZARD|\bCCAA\b|\bFISK\b|\bCULTURA INGLESA|\bCURSO\b|\bUDEMY|\bALURA|\bHOTMART/, null, 'Educação'],
  [/\bLIVRARIA|\bPAPELARIA|\bMATERIAL ESCOLAR/, null, 'Educação'],
  // Lazer
  [/\bNETFLIX\b/, 'Netflix', 'Lazer'], [/\bSPOTIFY\b/, 'Spotify', 'Lazer'],
  [/\bDISNEY|\bHBO\b|\bMAX \b|\bPRIME VIDEO|\bGLOBOPLAY|\bDEEZER|\bYOUTUBE PREMIUM|\bPARAMOUNT/, null, 'Lazer'],
  [/\bCINEMARK|\bCINEPOLIS|\bUCI \b|\bCINEMA\b/, null, 'Lazer'],
  [/\bSTEAM\b|\bPLAYSTATION|\bXBOX\b|\bNINTENDO|\bEPIC GAMES/, null, 'Lazer'],
  [/\bINGRESSO COM|\bSYMPLA|\bTICKETMASTER|\bTEATRO\b|\bSHOW\b/, null, 'Lazer'],
  [/\bBOOKING|\bAIRBNB|\bDECOLAR|\bHOTEL\b|\bPOUSADA|\bLATAM\b|\bGOL LINHAS|\bAZUL LINHAS|\bCVC\b/, null, 'Lazer'],
  [/\bBAR \b|\bCHOPP|\bCERVEJARIA|\bBOTECO/, null, 'Lazer'],
  // Outros (entradas e encargos)
  [/\bPAGAMENTO DE FATURA|\bPAGAMENTO FATURA|\bFATURA CARTAO|\bFATURA DO CARTAO/, 'Fatura do cartão', 'Outros'],
  [/\bRESGATE RDB|\bAPLICACAO RDB|\bRENDIMENTO RDB|\bCAIXINHA\b|\bRESERVA DE EMERGENCIA/, null, 'Outros'],
  [/\bSALARIO|\bFOLHA DE PAGAMENTO|\bPRO LABORE|\bPROLABORE|\bDECIMO TERCEIRO|\bFERIAS\b/, null, 'Outros'],
  [/\bRENDIMENTO|\bJUROS\b|\bDIVIDENDO|\bRESGATE\b|\bCDB\b|\bTESOURO\b/, null, 'Outros'],
  [/\bTARIFA|\bANUIDADE|\bIOF\b|\bMULTA\b|\bJUROS DE MORA/, null, 'Outros'],
  [/\bINSS\b|\bDARF\b|\bDAS \b|\bIMPOSTO|\bRECEITA FEDERAL|\bFGTS\b/, null, 'Outros'],
  [/\bSEGURO\b|\bPORTO SEGURO|\bBRADESCO SEGUROS/, null, 'Outros'],
  [/\bMAGAZINE LUIZA|\bMAGALU|\bAMERICANAS|\bCASAS BAHIA|\bMERCADO LIVRE|\bMERCADOLIVRE|\bAMAZON|\bSHOPEE|\bALIEXPRESS|\bSHEIN/, null, 'Outros']
];

const PEQUENAS = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'em', 'no', 'na']);
function titulo(texto) {
  return String(texto ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    .map((palavra, indice) => (indice > 0 && PEQUENAS.has(palavra)) ? palavra
      : palavra.length <= 3 && /^[a-z]+$/.test(palavra) && palavra === palavra.toLowerCase() && indice === 0 && palavra.length <= 3
        ? palavra.toUpperCase()
        : palavra.charAt(0).toUpperCase() + palavra.slice(1))
    .join(' ');
}

// Tira o ruído bancário e devolve o miolo da descrição, que serve de nome do fornecedor.
// Os conectores ("do", "de") ficam quando estão no meio do nome — "Feira do Bairro".
function nomeProvavel(descricao) {
  let palavras = chave(descricao).split(' ')
    .filter(p => p.length > 0 && !RUIDO.has(p) && !/^\d+$/.test(p));
  while (palavras.length && (CONECTORES.has(palavras[0]) || palavras[0].length === 1)) palavras.shift();
  while (palavras.length && CONECTORES.has(palavras[palavras.length - 1])) palavras.pop();
  palavras = palavras.slice(0, 4);
  while (palavras.length && CONECTORES.has(palavras[palavras.length - 1])) palavras.pop();
  return palavras.length ? titulo(palavras.join(' ')) : String(descricao || '').trim();
}

function marcas(descricao) {
  const texto = chave(descricao);
  for (const [padrao, fornecedor, categoria] of REGRAS) {
    if (padrao.test(texto)) return { fornecedor: fornecedor || nomeProvavel(descricao), categoria, origem: 'lista' };
  }
  return null;
}

// Compara com o que a família já categorizou: se bate bem, aprende dali.
function doHistorico(descricao, historico = []) {
  const alvo = new Set(chave(descricao).split(' ').filter(p => p.length >= 4 && !RUIDO.has(p) && !CONECTORES.has(p)));
  if (!alvo.size) return null;
  let melhor = null, melhorNota = 0, melhorIguais = 0, melhorPalavra = '';
  for (const item of historico) {
    if (!item || !item.category) continue;
    const outras = new Set(chave(item.description).split(' ').filter(p => p.length >= 4 && !RUIDO.has(p) && !CONECTORES.has(p)));
    if (!outras.size) continue;
    const iguais = [...alvo].filter(palavra => outras.has(palavra));
    const nota = iguais.length / Math.min(alvo.size, outras.size);
    if (nota > melhorNota) {
      melhorNota = nota; melhor = item;
      melhorIguais = iguais.length;
      melhorPalavra = iguais.sort((a, b) => b.length - a.length)[0] || '';
    }
  }
  // uma palavra comum em comum ("pagamentos", "tecnologia") não é evidência:
  // exige duas palavras iguais, ou uma palavra longa quando o nome é de uma só
  const evidenciaSuficiente = melhorIguais >= 2 || (melhorIguais === 1 && melhorPalavra.length >= 6 && alvo.size <= 2);
  if (!melhor || melhorNota < 0.6 || !evidenciaSuficiente) return null;
  return {
    fornecedor: melhor.supplier || nomeProvavel(melhor.description),
    categoria: melhor.category,
    origem: 'historico',
    parecidoCom: melhor.description
  };
}

// O histórico da família manda; a lista de padrões entra quando o histórico não sabe.
function reconhecer(descricao, historico = []) {
  return doHistorico(descricao, historico)
    || marcas(descricao)
    || { fornecedor: nomeProvavel(descricao), categoria: '', origem: 'nenhum' };
}

const GFPFornecedores = { reconhecer, marcas, doHistorico, nomeProvavel, titulo, REGRAS };
if (typeof window !== 'undefined') window.GFPFornecedores = GFPFornecedores;
if (typeof module !== 'undefined' && module.exports) module.exports = GFPFornecedores;

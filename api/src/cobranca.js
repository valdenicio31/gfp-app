/* Cobrança do GFP — conversa com o Asaas.

   Esta é a primeira peça: saber se a cobrança está configurada e se a chave
   gravada no servidor realmente abre a conta no Asaas. Assinaturas, teste
   grátis e bloqueio por falta de pagamento entram por cima disto.

   A chave fica só em variável de ambiente (ASAAS_API_KEY) e nunca sai daqui:
   nenhuma resposta, erro ou linha de log traz a chave nem dados da conta.

   Como emprestimos.js e painel.js, este arquivo não depende de biblioteca:
   recebe o fetch e o ambiente, e por isso roda nos testes sem rede. */

const SANDBOX = 'https://api-sandbox.asaas.com/v3';
const PRODUCAO = 'https://api.asaas.com/v3';
const PREFIXO = { sandbox: '$aact_hmlg_', producao: '$aact_prod_' };
const TEMPO_LIMITE_MS = 10000;

const ambienteDaUrl = url => (url === SANDBOX ? 'sandbox' : url === PRODUCAO ? 'producao' : 'desconhecido');
const ambienteDaChave = chave => (chave.startsWith(PREFIXO.sandbox) ? 'sandbox'
  : chave.startsWith(PREFIXO.producao) ? 'producao' : 'desconhecido');

/* O que está configurado, sem revelar a chave. Sem URL informada vale o
   ambiente de testes: errar para o lado que não movimenta dinheiro. */
export function configuracaoDaCobranca(env = process.env) {
  const chave = String(env.ASAAS_API_KEY || '').trim();
  const url = String(env.ASAAS_API_URL || SANDBOX).trim().replace(/\/+$/, '');
  const ambiente = ambienteDaUrl(url);
  const daChave = chave ? ambienteDaChave(chave) : null;
  let problema = null;
  if (!chave) problema = 'A chave do Asaas não está gravada no servidor (ASAAS_API_KEY).';
  else if (ambiente === 'desconhecido') problema = 'O endereço do Asaas (ASAAS_API_URL) não é o de testes nem o de produção.';
  else if (daChave === 'desconhecido') problema = 'A chave gravada não tem o formato de uma chave do Asaas — confira se foi copiada inteira.';
  else if (daChave !== ambiente) problema = `A chave é de ${daChave === 'sandbox' ? 'testes' : 'produção'}, mas o endereço é o de ${ambiente === 'sandbox' ? 'testes' : 'produção'}.`;
  return { configurada: Boolean(chave), ambiente, url, problema };
}

const MOTIVOS = {
  invalid_access_token: 'O Asaas recusou a chave: ela é inválida, foi desabilitada ou expirou.',
  invalid_environment: 'A chave é de um ambiente e o endereço é de outro (testes x produção).',
  access_token_not_found: 'O Asaas não recebeu a chave.',
  invalid_access_token_format: 'A chave está com formato incorreto — confira espaços ou cópia incompleta.'
};

/* Chamada ao Asaas com a chave do servidor. Devolve o status e o corpo já
   lido; quem chama decide o que mostrar. */
export async function chamarAsaas(caminho, { metodo = 'GET', corpo, env = process.env, buscar = globalThis.fetch } = {}) {
  const { url } = configuracaoDaCobranca(env);
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    const resposta = await buscar(`${url}${caminho}`, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'gfp-gestao-financeira-pessoal',
        access_token: String(env.ASAAS_API_KEY || '').trim()
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: controle.signal
    });
    const dados = await resposta.json().catch(() => ({}));
    return { status: resposta.status, ok: resposta.ok, dados };
  } finally {
    clearTimeout(relogio);
  }
}

/* A chave abre a conta? Pede os dados comerciais, que toda conta tem, e olha
   só se o Asaas aceitou — o conteúdo da resposta é descartado. */
export async function testarConexao({ env = process.env, buscar = globalThis.fetch } = {}) {
  const config = configuracaoDaCobranca(env);
  const base = { configurada: config.configurada, ambiente: config.ambiente };
  if (config.problema) return { ...base, conexao: config.configurada ? 'falhou' : 'nao_configurada', motivo: config.problema };
  try {
    const r = await chamarAsaas('/myAccount/commercialInfo/', { env, buscar });
    if (r.ok) return { ...base, conexao: 'ok', motivo: null };
    const codigo = r.dados?.errors?.[0]?.code;
    return { ...base, conexao: 'falhou', motivo: MOTIVOS[codigo] || `O Asaas respondeu com erro ${r.status}.` };
  } catch (erro) {
    const demorou = erro?.name === 'AbortError';
    return { ...base, conexao: 'falhou', motivo: demorou ? 'O Asaas não respondeu a tempo.' : 'Não foi possível falar com o Asaas.' };
  }
}

export function registrarCobranca(app, { requireAuth, env = process.env, buscar = globalThis.fetch, agora = () => Date.now() }) {
  /* O resultado vale por um minuto: a tela pode perguntar quantas vezes
     quiser sem que cada pergunta vire uma chamada ao Asaas. */
  let guardado = null;
  app.get('/billing/status', requireAuth, async (_req, res) => {
    if (!guardado || agora() - guardado.quando > 60000) {
      guardado = { quando: agora(), resultado: await testarConexao({ env, buscar }) };
    }
    res.json({ cobranca: guardado.resultado });
  });
}

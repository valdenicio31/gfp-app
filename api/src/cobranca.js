/* Cobrança do GFP — conversa com o Asaas.

   O que este arquivo faz:
   - confere se a chave gravada no servidor abre a conta no Asaas;
   - contrata: cria o cliente e a assinatura no Asaas e devolve o endereço da
     fatura, onde a pessoa paga. O GFP nunca vê nem guarda número de cartão;
   - recebe os avisos do Asaas (webhook) e atualiza a licença da conta;
   - cancela e, dentro dos 7 dias, desfaz a contratação com reembolso.

   A chave fica só em variável de ambiente (ASAAS_API_KEY) e nunca sai daqui:
   nenhuma resposta, erro ou linha de log traz a chave nem dados da conta no
   Asaas. O CPF informado na contratação vai direto para o Asaas e não é
   gravado no banco do GFP.

   As regras da licença estão em licenca.js. Como emprestimos.js e painel.js,
   este arquivo não depende de biblioteca: recebe o banco, o fetch e o
   ambiente, e por isso roda nos testes sem rede. */

import crypto from 'node:crypto';
import { PLANOS, DIAS_DE_TESTE, situacaoDaLicenca, fimDoPeriodo, documentoValido } from './licenca.js';

const SANDBOX = 'https://api-sandbox.asaas.com/v3';
const PRODUCAO = 'https://api.asaas.com/v3';
const PREFIXO = { sandbox: '$aact_hmlg_', producao: '$aact_prod_' };
const TEMPO_LIMITE_MS = 15000;
const CAMINHO_DO_WEBHOOK = '/billing/webhook/asaas';
const EVENTOS_DO_WEBHOOK = ['PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE',
  'PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', 'SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'];

const ambienteDaUrl = url => (url === SANDBOX ? 'sandbox' : url === PRODUCAO ? 'producao' : 'desconhecido');
const ambienteDaChave = chave => (chave.startsWith(PREFIXO.sandbox) ? 'sandbox'
  : chave.startsWith(PREFIXO.producao) ? 'producao' : 'desconhecido');
const hojeEmBrasilia = (agora = new Date()) => agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

/* ---------- configuração e chamadas ---------- */

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

/* ---------- aviso de pagamento (webhook) ---------- */

/* Senha que o Asaas manda em cada aviso. Sai do segredo do servidor, então não
   precisa de mais uma variável para configurar — e não dá para deduzir o
   segredo a partir dela. ASAAS_WEBHOOK_TOKEN, se existir, tem preferência. */
export function tokenDoWebhook(env = process.env) {
  const proprio = String(env.ASAAS_WEBHOOK_TOKEN || '').trim();
  if (proprio.length >= 32) return proprio;
  const segredo = String(env.JWT_SECRET || '');
  if (segredo.length < 32) return null;
  return crypto.createHmac('sha256', segredo).update('gfp:asaas:webhook').digest('hex');
}
const mesmoTexto = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/* Garante que o Asaas sabe para onde mandar os avisos. Roda na subida da API;
   se já existir um webhook apontando para cá, não mexe. */
export async function garantirWebhook({ env = process.env, buscar = globalThis.fetch } = {}) {
  const config = configuracaoDaCobranca(env);
  if (config.problema) return { webhook: 'nao_configurado', motivo: config.problema };
  const base = String(env.API_PUBLIC_URL || env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//.test(base)) return { webhook: 'nao_configurado', motivo: 'O endereço público da API não é conhecido (API_PUBLIC_URL).' };
  const token = tokenDoWebhook(env);
  if (!token) return { webhook: 'nao_configurado', motivo: 'Falta o segredo do servidor para proteger os avisos.' };
  const destino = `${base}${CAMINHO_DO_WEBHOOK}`;
  try {
    const lista = await chamarAsaas('/webhooks', { env, buscar });
    if (!lista.ok) return { webhook: 'falhou', motivo: `O Asaas não listou os webhooks (erro ${lista.status}).` };
    if ((lista.dados?.data || []).some(w => w.url === destino)) return { webhook: 'ok', motivo: null };
    const criado = await chamarAsaas('/webhooks', {
      metodo: 'POST', env, buscar,
      corpo: {
        name: 'GFP — avisos de pagamento', url: destino,
        email: String(env.ASAAS_WEBHOOK_EMAIL || 'contato@viaiasolucoes.com'),
        enabled: true, interrupted: false, apiVersion: 3, authToken: token,
        sendType: 'SEQUENTIALLY', events: EVENTOS_DO_WEBHOOK
      }
    });
    if (criado.ok) return { webhook: 'ok', motivo: null };
    const descricao = criado.dados?.errors?.[0]?.description;
    return { webhook: 'falhou', motivo: descricao ? String(descricao).slice(0, 200) : `O Asaas recusou o cadastro do webhook (erro ${criado.status}).` };
  } catch {
    return { webhook: 'falhou', motivo: 'Não foi possível falar com o Asaas para cadastrar o webhook.' };
  }
}

/* ---------- banco ---------- */

const CAMPOS_DA_ASSINATURA = `s.id, s.family_id, s.status, s.exempt, s.current_period_end, s.cancelled_at, s.contracted_at,
  to_char(s.overdue_since,'YYYY-MM-DD') overdue_since, to_char(s.next_due_on,'YYYY-MM-DD') next_due_on,
  s.external_subscription_id, s.external_customer_id, s.pending_plan, p.name plan_name, p.billing_cycle, p.price_cents`;

export async function assinaturaDaFamilia(query, familyId) {
  const r = await query(`select ${CAMPOS_DA_ASSINATURA} from subscriptions s join plans p on p.id=s.plan_id where s.family_id=$1`, [familyId]);
  return r.rows[0] || null;
}

/* Conta sem assinatura gravada começa o teste grátis agora. */
export async function iniciarTeste(executar, familyId, agora = new Date()) {
  const fim = new Date(agora.getTime() + DIAS_DE_TESTE * 86400000).toISOString();
  await executar(`insert into subscriptions (family_id, plan_id, status, current_period_end)
    select $1, p.id, 'trial', $2::timestamptz from plans p where p.name='mensal'
    on conflict (family_id) do nothing`, [familyId, fim]);
  await executar(`insert into billing_events (family_id, event_type, provider) values ($1, 'trial_started', 'gfp')`, [familyId]);
}

export async function licencaDaFamilia(query, familyId, agora = new Date()) {
  return situacaoDaLicenca(await assinaturaDaFamilia(query, familyId), agora);
}

const planoPeloValor = valor => Object.values(PLANOS).find(p => p.preco_cents === Math.round(Number(valor) * 100)) || null;
const ESTADO_DO_PAGAMENTO = {
  PAYMENT_CREATED: 'pending', PAYMENT_UPDATED: null, PAYMENT_CONFIRMED: 'confirmed', PAYMENT_RECEIVED: 'confirmed',
  PAYMENT_OVERDUE: 'overdue', PAYMENT_DELETED: 'cancelled', PAYMENT_REFUNDED: 'refunded'
};

async function gravarPagamento(query, assinatura, pagamento, estado, plano, agora = new Date()) {
  const centavos = Math.round(Number(pagamento.value) * 100);
  if (!(centavos > 0) || !pagamento.id) return;
  /* Um aviso atrasado de "cobrança criada" não pode desfazer um pagamento que
     já foi confirmado ou estornado. */
  await query(`insert into payments (family_id, subscription_id, provider, external_payment_id, status, amount_cents,
      plan_name, period, due_date, paid_at, invoice_url, billing_type, external_subscription_id)
    values ($1,$2,'asaas',$3,$4,$5,$6,$7,$8::date,$9::timestamptz,$10,$11,$12)
    on conflict (external_payment_id) where external_payment_id is not null do update set
      status = case when payments.status in ('confirmed','refunded') and excluded.status in ('pending','overdue') then payments.status else excluded.status end,
      paid_at = coalesce(payments.paid_at, excluded.paid_at),
      due_date = excluded.due_date, invoice_url = coalesce(excluded.invoice_url, payments.invoice_url),
      billing_type = coalesce(excluded.billing_type, payments.billing_type), updated_at = now()`,
    [assinatura.family_id, assinatura.id, String(pagamento.id).slice(0, 120), estado, centavos,
      plano?.id || null, plano?.ciclo || 'monthly', pagamento.dueDate || null,
      estado === 'confirmed' ? agora.toISOString() : null,
      pagamento.invoiceUrl ? String(pagamento.invoiceUrl).slice(0, 500) : null,
      pagamento.billingType ? String(pagamento.billingType).slice(0, 20) : null,
      pagamento.subscription ? String(pagamento.subscription).slice(0, 120) : null]);
}

/* Aplica um aviso do Asaas à conta. Devolve o que fez, para o teste conferir. */
export async function processarAviso(query, aviso, agora = new Date()) {
  const evento = String(aviso?.event || '');
  const idDoAviso = String(aviso?.id || '').slice(0, 120);
  if (!evento || !idDoAviso) return { feito: 'ignorado', motivo: 'aviso sem identificador' };

  // O mesmo aviso pode chegar duas vezes: só o primeiro é processado.
  const novo = await query(`insert into webhook_events (id, event) values ($1,$2) on conflict (id) do nothing returning id`, [idDoAviso, evento.slice(0, 60)]);
  if (!novo.rows.length) return { feito: 'repetido' };

  try {
    return await aplicarAviso(query, aviso, evento, idDoAviso, agora);
  } catch (erro) {
    // não ficou processado: solta o identificador para a reentrega do Asaas valer
    await query('delete from webhook_events where id=$1', [idDoAviso]).catch(() => null);
    throw erro;
  }
}

async function aplicarAviso(query, aviso, evento, idDoAviso, agora) {
  const pagamento = aviso.payment || null;
  const idDaAssinaturaNoAsaas = pagamento?.subscription || aviso.subscription?.id || null;
  const referencia = pagamento?.externalReference || aviso.subscription?.externalReference || null;
  let achada = idDaAssinaturaNoAsaas
    ? await query(`select ${CAMPOS_DA_ASSINATURA} from subscriptions s join plans p on p.id=s.plan_id where s.external_subscription_id=$1`, [idDaAssinaturaNoAsaas])
    : { rows: [] };
  if (!achada.rows.length && /^[0-9a-f-]{36}$/i.test(String(referencia || ''))) {
    achada = await query(`select ${CAMPOS_DA_ASSINATURA} from subscriptions s join plans p on p.id=s.plan_id where s.family_id=$1`, [referencia]);
  }
  const s = achada.rows[0];
  if (!s) return { feito: 'ignorado', motivo: 'conta não encontrada' };
  const daAssinaturaAtual = Boolean(idDaAssinaturaNoAsaas) && idDaAssinaturaNoAsaas === s.external_subscription_id;

  if (evento === 'SUBSCRIPTION_DELETED' || evento === 'SUBSCRIPTION_INACTIVATED') {
    if (!daAssinaturaAtual || !['active', 'past_due'].includes(s.status)) return { feito: 'ignorado', motivo: 'assinatura já encerrada' };
    await query(`update subscriptions set status='cancelled', cancelled_at=now(), next_due_on=null, updated_at=now() where id=$1`, [s.id]);
    await query(`insert into billing_events (family_id, subscription_id, event_type, provider, external_event_id) values ($1,$2,'cancelled','asaas',$3)`, [s.family_id, s.id, idDoAviso]);
    return { feito: 'cancelada' };
  }

  if (!pagamento) return { feito: 'ignorado', motivo: 'aviso sem cobrança' };
  const plano = PLANOS[s.pending_plan] || planoPeloValor(pagamento.value) || PLANOS[s.plan_name] || null;

  if (evento === 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED') {
    await query(`insert into billing_events (family_id, subscription_id, event_type, amount_cents, provider, external_event_id) values ($1,$2,'payment_failed',$3,'asaas',$4)`,
      [s.family_id, s.id, Math.round(Number(pagamento.value) * 100) || null, idDoAviso]);
    return { feito: 'falha_registrada' };
  }

  const estado = ESTADO_DO_PAGAMENTO[evento];
  if (estado === undefined) return { feito: 'ignorado', motivo: 'evento sem efeito na licença' };
  const antes = await query('select status from payments where external_payment_id=$1', [String(pagamento.id || '')]);
  const estadoAntes = antes.rows[0]?.status || null;
  if (estado) await gravarPagamento(query, s, pagamento, estado, plano, agora);

  if (evento === 'PAYMENT_CREATED' || evento === 'PAYMENT_UPDATED') {
    if (daAssinaturaAtual && ['active', 'past_due'].includes(s.status) && pagamento.dueDate) {
      await query('update subscriptions set next_due_on=$1::date, updated_at=now() where id=$2', [pagamento.dueDate, s.id]);
    }
    return { feito: 'cobranca_registrada' };
  }

  if (estado === 'confirmed') {
    /* Confirmado e Recebido chegam os dois para a mesma cobrança, às vezes com
       semanas de diferença. Só o primeiro mexe na licença — senão um "recebido"
       tardio reativaria uma assinatura que a pessoa já cancelou. */
    if (estadoAntes === 'confirmed' || estadoAntes === 'refunded') return { feito: 'ja_confirmado' };
    if (!daAssinaturaAtual || !plano || !pagamento.dueDate) return { feito: 'pagamento_registrado' };
    const fim = fimDoPeriodo(pagamento.dueDate, plano.ciclo).toISOString();
    const contratoNovo = !['active', 'past_due'].includes(s.status);
    await query(`update subscriptions set status='active', plan_id=(select id from plans where name=$1), exempt=false,
        current_period_end=greatest(coalesce(current_period_end, $2::timestamptz), $2::timestamptz), overdue_since=null, cancelled_at=null,
        pending_plan=null, payment_provider='asaas', next_due_on=null,
        contracted_at=case when $3::boolean then $4::timestamptz else contracted_at end, updated_at=now()
      where id=$5`, [plano.id, fim, contratoNovo, agora.toISOString(), s.id]);
    if (contratoNovo) {
      // contrato novo: o período vale a partir desta cobrança, não do teste que estava correndo
      await query('update subscriptions set current_period_end=$1::timestamptz where id=$2', [fim, s.id]);
    }
    await query(`insert into billing_events (family_id, subscription_id, event_type, amount_cents, provider, external_event_id) values ($1,$2,'payment_success',$3,'asaas',$4)`,
      [s.family_id, s.id, Math.round(Number(pagamento.value) * 100), idDoAviso]);
    return { feito: 'ativada', ate: fim, plano: plano.id };
  }

  if (estado === 'overdue') {
    if (!daAssinaturaAtual || !['active', 'past_due'].includes(s.status)) return { feito: 'atraso_registrado' };
    await query(`update subscriptions set status='past_due', overdue_since=least(coalesce(overdue_since, $1::date), $1::date), updated_at=now() where id=$2`,
      [pagamento.dueDate || hojeEmBrasilia(agora), s.id]);
    await query(`insert into billing_events (family_id, subscription_id, event_type, amount_cents, provider, external_event_id) values ($1,$2,'payment_failed',$3,'asaas',$4)`,
      [s.family_id, s.id, Math.round(Number(pagamento.value) * 100) || null, idDoAviso]);
    return { feito: 'em_atraso' };
  }

  if (estado === 'refunded') {
    // estorno feito direto no painel do Asaas: a contratação deixa de valer
    if (daAssinaturaAtual && ['active', 'past_due'].includes(s.status)) {
      await query(`update subscriptions set status='expired', current_period_end=now(), cancelled_at=now(), next_due_on=null, updated_at=now() where id=$1`, [s.id]);
      await query(`insert into billing_events (family_id, subscription_id, event_type, amount_cents, provider, external_event_id) values ($1,$2,'refund',$3,'asaas',$4)`,
        [s.family_id, s.id, Math.round(Number(pagamento.value) * 100) || null, idDoAviso]);
      return { feito: 'estornada' };
    }
    return { feito: 'estorno_registrado' };
  }

  return { feito: 'cobranca_registrada' };
}

/* ---------- rotas ---------- */

const erroDoAsaas = (r, padrao) => {
  const descricao = r?.dados?.errors?.[0]?.description;
  return descricao ? `${padrao} O Asaas respondeu: ${String(descricao).slice(0, 200)}` : padrao;
};

export function registrarCobranca(app, { query, requireAuth, allowRoles, env = process.env, buscar = globalThis.fetch, agora = () => new Date() }) {
  const soTitular = allowRoles ? allowRoles('admin') : (_req, _res, next) => next();
  const asaas = (caminho, opcoes = {}) => chamarAsaas(caminho, { env, buscar, ...opcoes });
  let conexaoGuardada = null;
  let webhookGuardado = null;

  /* Conferência técnica: a chave abre a conta e o Asaas sabe para onde avisar?
     Vale por um minuto, para a pergunta repetida não virar chamada repetida. */
  app.get('/billing/status', requireAuth, async (_req, res) => {
    if (!conexaoGuardada || agora().getTime() - conexaoGuardada.quando > 60000) {
      const conexao = await testarConexao({ env, buscar });
      if (conexao.conexao === 'ok' && (!webhookGuardado || webhookGuardado.webhook !== 'ok')) webhookGuardado = await garantirWebhook({ env, buscar });
      conexaoGuardada = { quando: agora().getTime(), resultado: { ...conexao, webhook: webhookGuardado?.webhook || 'nao_conferido', motivo_webhook: webhookGuardado?.motivo || null } };
    }
    res.json({ cobranca: conexaoGuardada.resultado });
  });

  /* A licença da conta e o que a tela de Assinatura mostra. */
  app.get('/billing/license', requireAuth, async (req, res) => {
    let assinatura = await assinaturaDaFamilia(query, req.auth.familyId);
    if (!assinatura) {
      await iniciarTeste(query, req.auth.familyId, agora());
      assinatura = await assinaturaDaFamilia(query, req.auth.familyId);
    }
    const licenca = situacaoDaLicenca(assinatura, agora());
    const pagamentos = await query(`select external_payment_id id, status, amount_cents, plan_name, to_char(due_date,'YYYY-MM-DD') due_date,
        paid_at, invoice_url, billing_type
      from payments where family_id=$1 order by created_at desc limit 12`, [req.auth.familyId]);
    const pendente = pagamentos.rows.find(p => ['pending', 'overdue'].includes(p.status) && p.invoice_url);
    res.json({
      licenca: { ...licenca, fatura_pendente: pendente ? pendente.invoice_url : null },
      planos: Object.values(PLANOS).map(p => ({ id: p.id, nome: p.nome, preco_cents: p.preco_cents, ciclo: p.ciclo, formas: p.formas })),
      pagamentos: pagamentos.rows.map(p => ({ ...p, amount_cents: Number(p.amount_cents) })),
      pode_contratar: configuracaoDaCobranca(env).problema === null
    });
  });

  /* Contratar: cria cliente e assinatura no Asaas e devolve a fatura. A licença
     só muda quando o Asaas avisa que o pagamento foi confirmado. */
  app.post('/billing/subscribe', requireAuth, soTitular, async (req, res) => {
    if (configuracaoDaCobranca(env).problema) return res.status(503).json({ error: 'A contratação ainda não está disponível. Tente mais tarde.' });
    const corpo = req.body || {};
    const plano = PLANOS[corpo.plan];
    if (!plano) return res.status(400).json({ error: 'Escolha o plano mensal ou o anual.' });
    const nome = String(corpo.name ?? '').trim().slice(0, 100);
    const documento = String(corpo.cpfCnpj ?? '').replace(/\D/g, '');
    if (nome.length < 3) return res.status(400).json({ error: 'Informe o nome completo de quem vai pagar.' });
    if (!documentoValido(documento)) return res.status(400).json({ error: 'CPF ou CNPJ inválido. Confira os números.' });

    let s = await assinaturaDaFamilia(query, req.auth.familyId);
    if (!s) { await iniciarTeste(query, req.auth.familyId, agora()); s = await assinaturaDaFamilia(query, req.auth.familyId); }
    if (s.exempt) return res.status(409).json({ error: 'Sua conta é de cortesia e já está liberada: não há o que contratar.' });
    if (['active', 'past_due'].includes(s.status)) return res.status(409).json({ error: 'Você já tem uma assinatura. Para trocar de plano, cancele a atual primeiro.' });

    // Contratação começada e não paga: mesma escolha devolve a mesma fatura; outra escolha desfaz a anterior.
    if (s.external_subscription_id && s.pending_plan) {
      if (s.pending_plan === plano.id) {
        const aberta = await query(`select invoice_url from payments where family_id=$1 and subscription_id=$2 and status in ('pending','overdue')
          and invoice_url is not null order by created_at desc limit 1`, [req.auth.familyId, s.id]);
        if (aberta.rows[0]) return res.json({ invoiceUrl: aberta.rows[0].invoice_url, plano: plano.id, reaproveitada: true });
      }
      await asaas(`/subscriptions/${encodeURIComponent(s.external_subscription_id)}`, { metodo: 'DELETE' }).catch(() => null);
      await query(`update payments set status='cancelled', updated_at=now() where family_id=$1 and subscription_id=$2 and status in ('pending','overdue')`, [req.auth.familyId, s.id]);
    }

    try {
      let cliente = s.external_customer_id;
      if (!cliente) {
        const usuario = await query('select email from users where id=$1', [req.auth.sub]);
        const criado = await asaas('/customers', { metodo: 'POST', corpo: { name: nome, cpfCnpj: documento, email: usuario.rows[0]?.email, externalReference: req.auth.familyId } });
        if (!criado.ok || !criado.dados?.id) return res.status(502).json({ error: erroDoAsaas(criado, 'Não foi possível registrar seus dados para a cobrança.') });
        cliente = criado.dados.id;
        await query('update subscriptions set external_customer_id=$1, updated_at=now() where id=$2', [cliente, s.id]);
      }

      // Quem cancelou e ainda tem período pago só volta a ser cobrado quando esse período acabar.
      const hoje = hojeEmBrasilia(agora());
      const fimPago = s.status === 'cancelled' && s.current_period_end && new Date(s.current_period_end) > agora()
        ? hojeEmBrasilia(new Date(s.current_period_end)) : null;
      const assinatura = await asaas('/subscriptions', { metodo: 'POST', corpo: {
        customer: cliente, billingType: plano.forma_asaas, value: plano.preco_cents / 100,
        nextDueDate: fimPago && fimPago > hoje ? fimPago : hoje, cycle: plano.ciclo_asaas,
        description: `GFP — Gestão Financeira Pessoal · plano ${plano.nome.toLowerCase()}`, externalReference: req.auth.familyId
      } });
      if (!assinatura.ok || !assinatura.dados?.id) return res.status(502).json({ error: erroDoAsaas(assinatura, 'Não foi possível criar a assinatura.') });
      await query(`update subscriptions set external_subscription_id=$1, pending_plan=$2, payment_provider='asaas', updated_at=now() where id=$3`,
        [assinatura.dados.id, plano.id, s.id]);

      const cobrancas = await asaas(`/subscriptions/${encodeURIComponent(assinatura.dados.id)}/payments`);
      const primeira = cobrancas.dados?.data?.[0];
      if (!primeira?.invoiceUrl) return res.status(502).json({ error: 'A assinatura foi criada, mas o Asaas ainda não gerou a fatura. Abra Assinatura de novo em alguns instantes.' });
      await gravarPagamento(query, s, primeira, 'pending', plano, agora());
      res.status(201).json({ invoiceUrl: primeira.invoiceUrl, plano: plano.id });
    } catch {
      res.status(502).json({ error: 'Não foi possível falar com o meio de pagamento. Tente de novo em instantes.' });
    }
  });

  /* Cancelar: interrompe as renovações. O acesso segue até o fim do período pago. */
  app.post('/billing/cancel', requireAuth, soTitular, async (req, res) => {
    const s = await assinaturaDaFamilia(query, req.auth.familyId);
    if (!s || !s.external_subscription_id || s.status === 'cancelled') return res.status(409).json({ error: 'Não há assinatura para cancelar.' });
    try {
      const r = await asaas(`/subscriptions/${encodeURIComponent(s.external_subscription_id)}`, { metodo: 'DELETE' });
      if (!r.ok && r.status !== 404) return res.status(502).json({ error: erroDoAsaas(r, 'Não foi possível cancelar agora.') });
    } catch {
      return res.status(502).json({ error: 'Não foi possível falar com o meio de pagamento. Tente de novo em instantes.' });
    }
    await query(`update payments set status='cancelled', updated_at=now() where family_id=$1 and subscription_id=$2 and status in ('pending','overdue')`, [req.auth.familyId, s.id]);
    if (['active', 'past_due'].includes(s.status)) {
      await query(`update subscriptions set status='cancelled', cancelled_at=now(), next_due_on=null, updated_at=now() where id=$1`, [s.id]);
      await query(`insert into billing_events (family_id, subscription_id, event_type, provider) values ($1,$2,'cancelled','gfp')`, [req.auth.familyId, s.id]);
    } else {
      // contratação começada e nunca paga: volta ao que era antes
      await query(`update subscriptions set external_subscription_id=null, pending_plan=null, updated_at=now() where id=$1`, [s.id]);
    }
    res.json({ licenca: await licencaDaFamilia(query, req.auth.familyId, agora()) });
  });

  /* Arrependimento em 7 dias: estorna o que foi pago e encerra a assinatura. */
  app.post('/billing/refund', requireAuth, soTitular, async (req, res) => {
    const s = await assinaturaDaFamilia(query, req.auth.familyId);
    const licenca = situacaoDaLicenca(s, agora());
    if (!s || !licenca.pode_desistir) return res.status(409).json({ error: 'O prazo de 7 dias para desistir já passou. Você ainda pode cancelar a renovação.' });
    // só as cobranças da contratação atual: pagamento de uma assinatura anterior não entra no arrependimento desta
    const pagos = await query(`select external_payment_id, amount_cents from payments where family_id=$1 and status='confirmed'
      and external_subscription_id=$2`, [req.auth.familyId, s.external_subscription_id]);
    if (!pagos.rows.length) return res.status(409).json({ error: 'Não encontrei o pagamento para estornar. Escreva para contato@viaiasolucoes.com.' });
    try {
      for (const pago of pagos.rows) {
        const r = await asaas(`/payments/${encodeURIComponent(pago.external_payment_id)}/refund`, { metodo: 'POST', corpo: {} });
        if (!r.ok) return res.status(502).json({ error: erroDoAsaas(r, 'Não foi possível pedir o estorno agora.') });
        await query(`update payments set status='refunded', updated_at=now() where external_payment_id=$1`, [pago.external_payment_id]);
        await query(`insert into billing_events (family_id, subscription_id, event_type, amount_cents, provider) values ($1,$2,'refund',$3,'gfp')`,
          [req.auth.familyId, s.id, Number(pago.amount_cents)]);
      }
      if (s.external_subscription_id) await asaas(`/subscriptions/${encodeURIComponent(s.external_subscription_id)}`, { metodo: 'DELETE' }).catch(() => null);
    } catch {
      return res.status(502).json({ error: 'Não foi possível falar com o meio de pagamento. Tente de novo em instantes.' });
    }
    await query(`update subscriptions set status='expired', current_period_end=now(), cancelled_at=now(), next_due_on=null, updated_at=now() where id=$1`, [s.id]);
    res.json({ licenca: await licencaDaFamilia(query, req.auth.familyId, agora()) });
  });

  /* Avisos do Asaas. Sem login: quem prova que é o Asaas é a senha do cabeçalho.
     Aviso que não se aplica a nenhuma conta também recebe 200 — recusar faria o
     Asaas reenviar sem parar e, depois de 15 falhas, pausar a fila inteira. */
  app.post(CAMINHO_DO_WEBHOOK, async (req, res) => {
    const esperado = tokenDoWebhook(env);
    if (!esperado || !mesmoTexto(req.headers?.['asaas-access-token'], esperado)) return res.status(401).json({ error: 'Aviso não autorizado' });
    try {
      const resultado = await processarAviso(query, req.body || {}, agora());
      res.json({ recebido: true, feito: resultado.feito });
    } catch (erro) {
      console.error(`Aviso do Asaas não processado: ${erro?.message || 'erro desconhecido'}`);
      res.status(500).json({ error: 'Aviso não processado' });
    }
  });
}

/* Cobrança e licença: regras puras sem rede, e o ciclo inteiro — teste grátis,
 * contratação, aviso de pagamento, atraso, cancelamento e arrependimento —
 * contra um PostgreSQL de teste e um Asaas de mentira.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { configuracaoDaCobranca, testarConexao, registrarCobranca, processarAviso, tokenDoWebhook, garantirWebhook } from '../api/src/cobranca.js';
import { situacaoDaLicenca, fimDoPeriodo, documentoValido, PLANOS } from '../api/src/licenca.js';

const daRaiz = caminho => fileURLToPath(new URL('../' + caminho, import.meta.url));
const SANDBOX = 'https://api-sandbox.asaas.com/v3';
const CHAVE = '$aact_hmlg_exemplo-que-nao-e-chave-de-verdade';
const SEGREDO = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';
const responder = (status, dados = {}) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => dados });
const DIA = 86400000;

/* ---------- configuração e conexão ---------- */

test('sem chave: não configurada, e nenhuma chamada é feita', async () => {
  let chamou = false;
  const r = await testarConexao({ env: {}, buscar: async () => { chamou = true; } });
  assert.equal(r.configurada, false);
  assert.equal(r.conexao, 'nao_configurada');
  assert.equal(chamou, false);
});

test('sem endereço informado vale o ambiente de testes', () => {
  const c = configuracaoDaCobranca({ ASAAS_API_KEY: CHAVE });
  assert.equal(c.ambiente, 'sandbox');
  assert.equal(c.url, SANDBOX);
  assert.equal(c.problema, null);
});

test('chave de testes com endereço de produção é barrada antes de chamar', async () => {
  let chamou = false;
  const r = await testarConexao({ env: { ASAAS_API_KEY: CHAVE, ASAAS_API_URL: 'https://api.asaas.com/v3' }, buscar: async () => { chamou = true; } });
  assert.equal(r.conexao, 'falhou');
  assert.match(r.motivo, /testes.*produção/);
  assert.equal(chamou, false);
});

test('conexão aceita: manda a chave no cabeçalho certo e não devolve dados da conta', async () => {
  let pedido;
  const buscar = async (url, opcoes) => { pedido = { url, opcoes }; return { status: 200, ok: true, json: async () => ({ companyName: 'Empresa', cpfCnpj: '00000000000000' }) }; };
  const r = await testarConexao({ env: { ASAAS_API_KEY: CHAVE, ASAAS_API_URL: `${SANDBOX}/` }, buscar });
  assert.deepEqual(r, { configurada: true, ambiente: 'sandbox', conexao: 'ok', motivo: null });
  assert.equal(pedido.url, `${SANDBOX}/myAccount/commercialInfo/`);
  assert.equal(pedido.opcoes.headers.access_token, CHAVE);
  assert.ok(!JSON.stringify(r).includes('aact'), 'a resposta nunca traz a chave');
});

test('chave recusada e Asaas fora do ar viram motivo legível', async () => {
  const recusada = await testarConexao({ env: { ASAAS_API_KEY: CHAVE }, buscar: responder(401, { errors: [{ code: 'invalid_access_token' }] }) });
  assert.match(recusada.motivo, /recusou a chave/);
  const fora = await testarConexao({ env: { ASAAS_API_KEY: CHAVE }, buscar: async () => { throw new Error('rede'); } });
  assert.match(fora.motivo, /Não foi possível falar/);
});

test('senha do webhook: sai do segredo do servidor, sem expor o segredo', () => {
  const token = tokenDoWebhook({ JWT_SECRET: SEGREDO });
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.notEqual(token, SEGREDO);
  assert.equal(tokenDoWebhook({ JWT_SECRET: SEGREDO }), token, 'é sempre a mesma');
  assert.equal(tokenDoWebhook({ JWT_SECRET: 'curto' }), null);
  assert.equal(tokenDoWebhook({ JWT_SECRET: SEGREDO, ASAAS_WEBHOOK_TOKEN: 'x'.repeat(40) }), 'x'.repeat(40));
});

test('webhook: cadastra só quando ainda não existe', async () => {
  const env = { ASAAS_API_KEY: CHAVE, JWT_SECRET: SEGREDO, RENDER_EXTERNAL_URL: 'https://api.exemplo.com' };
  const pedidos = [];
  const novo = await garantirWebhook({ env, buscar: async (url, o) => { pedidos.push(o.method); return { status: 200, ok: true, json: async () => ({ data: [] }) }; } });
  assert.equal(novo.webhook, 'ok');
  assert.deepEqual(pedidos, ['GET', 'POST']);
  const existente = [];
  const ja = await garantirWebhook({ env, buscar: async (url, o) => { existente.push(o.method); return { status: 200, ok: true, json: async () => ({ data: [{ url: 'https://api.exemplo.com/billing/webhook/asaas' }] }) }; } });
  assert.equal(ja.webhook, 'ok');
  assert.deepEqual(existente, ['GET']);
  assert.equal((await garantirWebhook({ env: { ASAAS_API_KEY: CHAVE, JWT_SECRET: SEGREDO } })).webhook, 'nao_configurado');
});

/* ---------- regras da licença ---------- */

const agora = new Date('2026-10-20T15:00:00Z');
const em = dias => new Date(agora.getTime() + dias * DIA).toISOString();

test('licença: cortesia fica liberada sem prazo', () => {
  const l = situacaoDaLicenca({ exempt: true, status: 'trial', current_period_end: em(-90) }, agora);
  assert.equal(l.situacao, 'cortesia');
  assert.equal(l.acesso, 'total');
});

test('licença: teste grátis conta os dias e, vencido, vira só consulta', () => {
  const correndo = situacaoDaLicenca({ status: 'trial', current_period_end: em(5.2) }, agora);
  assert.deepEqual([correndo.situacao, correndo.acesso, correndo.dias_restantes], ['teste', 'total', 6]);
  const vencido = situacaoDaLicenca({ status: 'trial', current_period_end: em(-1) }, agora);
  assert.deepEqual([vencido.situacao, vencido.acesso], ['teste_encerrado', 'consulta']);
});

test('licença: assinatura em dia, com desistência só nos 7 primeiros dias', () => {
  const nova = situacaoDaLicenca({ status: 'active', plan_name: 'mensal', current_period_end: em(25), contracted_at: em(-5) }, agora);
  assert.deepEqual([nova.situacao, nova.acesso, nova.pode_desistir, nova.plano], ['ativa', 'total', true, 'mensal']);
  const antiga = situacaoDaLicenca({ status: 'active', plan_name: 'anual', current_period_end: em(300), contracted_at: em(-8) }, agora);
  assert.equal(antiga.pode_desistir, false);
});

test('licença: atraso libera por 10 dias e depois suspende', () => {
  const noPrazo = situacaoDaLicenca({ status: 'past_due', overdue_since: '2026-10-15', current_period_end: em(-5) }, agora);
  assert.deepEqual([noPrazo.situacao, noPrazo.acesso], ['atrasada', 'total']);
  assert.ok(noPrazo.dias_restantes >= 4 && noPrazo.dias_restantes <= 5);
  const estourou = situacaoDaLicenca({ status: 'past_due', overdue_since: '2026-10-05', current_period_end: em(-15) }, agora);
  assert.deepEqual([estourou.situacao, estourou.acesso], ['suspensa', 'consulta']);
});

test('licença: cancelada segue até o fim do período pago', () => {
  const dentro = situacaoDaLicenca({ status: 'cancelled', current_period_end: em(12) }, agora);
  assert.deepEqual([dentro.situacao, dentro.acesso, dentro.dias_restantes], ['cancelada', 'total', 12]);
  const fora = situacaoDaLicenca({ status: 'cancelled', current_period_end: em(-1) }, agora);
  assert.deepEqual([fora.situacao, fora.acesso], ['encerrada', 'consulta']);
});

test('licença: sem registro não trava ninguém; aviso de atraso perdido não libera para sempre', () => {
  assert.equal(situacaoDaLicenca(null, agora).acesso, 'total');
  const esquecida = situacaoDaLicenca({ status: 'active', current_period_end: em(-11) }, agora);
  assert.deepEqual([esquecida.situacao, esquecida.acesso], ['suspensa', 'consulta']);
});

test('fim do período: um mês ou um ano depois do vencimento, sem pular mês', () => {
  assert.equal(fimDoPeriodo('2026-10-08', 'monthly').toISOString().slice(0, 10), '2026-11-09'); // 23:59 de 08/11 em Brasília
  assert.equal(fimDoPeriodo('2026-01-31', 'monthly').toISOString().slice(0, 10), '2026-03-01'); // 23:59 de 28/02
  assert.equal(fimDoPeriodo('2026-12-15', 'monthly').toISOString().slice(0, 10), '2027-01-16');
  assert.equal(fimDoPeriodo('2026-10-08', 'yearly').toISOString().slice(0, 10), '2027-10-09');
});

test('CPF e CNPJ: confere os dígitos', () => {
  assert.equal(documentoValido('529.982.247-25'), true);
  assert.equal(documentoValido('52998224724'), false);
  assert.equal(documentoValido('111.111.111-11'), false);
  assert.equal(documentoValido('11.222.333/0001-81'), true);
  assert.equal(documentoValido('11222333000180'), false);
  assert.equal(documentoValido(''), false);
});

/* ---------- ciclo completo contra PostgreSQL ---------- */

const PG = process.env.GFP_TEST_PG;
function literal(valor) {
  if (valor === null || valor === undefined) return 'NULL';
  if (typeof valor === 'number') return String(valor);
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';
  return `'${String(valor).replace(/'/g, "''")}'`;
}
const psql = sql => execFileSync('psql', [PG, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function query(texto, params = []) {
  const sql = texto.replace(/\$(\d+)/g, (_, n) => literal(params[Number(n) - 1])).trim();
  const inicio = sql.slice(0, 6).toLowerCase();
  if (inicio === 'select' || inicio.startsWith('with')) return { rows: JSON.parse(psql(`select coalesce(json_agg(q),'[]'::json) from (${sql}) q`)) };
  if (/\breturning\b/i.test(sql)) return { rows: JSON.parse(psql(`with q as (${sql}) select coalesce(json_agg(q),'[]'::json) from q`)) };
  psql(sql);
  return { rows: [] };
}
function appFalso() {
  const rotas = [];
  const app = {};
  for (const metodo of ['get', 'post']) app[metodo] = (caminho, ...handlers) => rotas.push({ metodo, caminho, handlers });
  app.chamar = async (metodo, caminho, { corpo, quem, headers = {} } = {}) => {
    const rota = rotas.find(r => r.metodo === metodo && r.caminho === caminho);
    const req = { body: corpo, auth: quem, headers, params: {}, query: {}, method: metodo.toUpperCase() };
    let status = 200, json;
    const res = { status(s) { status = s; return res; }, json(j) { json = j; return res; } };
    for (const h of rota.handlers) {
      let seguiu = false;
      await h(req, res, () => { seguiu = true; });
      if (!seguiu) break;
    }
    return { status, json };
  };
  return app;
}

/* Um Asaas de mentira: guarda clientes, assinaturas e cobranças em memória. */
function asaasFalso() {
  const estado = { clientes: [], assinaturas: [], cobrancas: [], estornos: [], removidas: [], n: 0 };
  const buscar = async (url, opcoes) => {
    const caminho = url.replace(SANDBOX, '');
    const corpo = opcoes.body ? JSON.parse(opcoes.body) : null;
    const ok = dados => ({ status: 200, ok: true, json: async () => dados });
    if (opcoes.headers.access_token !== CHAVE) return { status: 401, ok: false, json: async () => ({ errors: [{ code: 'invalid_access_token' }] }) };
    if (opcoes.method === 'POST' && caminho === '/customers') { const c = { id: `cus_${++estado.n}`, ...corpo }; estado.clientes.push(c); return ok(c); }
    if (opcoes.method === 'POST' && caminho === '/subscriptions') {
      const a = { id: `sub_${++estado.n}`, ...corpo }; estado.assinaturas.push(a);
      estado.cobrancas.push({ id: `pay_${++estado.n}`, subscription: a.id, customer: a.customer, value: a.value, dueDate: a.nextDueDate,
        billingType: a.billingType, invoiceUrl: `https://sandbox.asaas.com/i/${estado.n}`, externalReference: a.externalReference });
      return ok(a);
    }
    const lista = caminho.match(/^\/subscriptions\/([^/]+)\/payments$/);
    if (lista) return ok({ data: estado.cobrancas.filter(c => c.subscription === lista[1]) });
    const remover = caminho.match(/^\/subscriptions\/([^/]+)$/);
    if (remover && opcoes.method === 'DELETE') { estado.removidas.push(remover[1]); return ok({ deleted: true }); }
    const estorno = caminho.match(/^\/payments\/([^/]+)\/refund$/);
    if (estorno) { estado.estornos.push(estorno[1]); return ok({ status: 'REFUNDED' }); }
    return { status: 404, ok: false, json: async () => ({}) };
  };
  return { estado, buscar };
}

test('cobrança de ponta a ponta', { skip: !PG && 'defina GFP_TEST_PG para rodar contra um PostgreSQL de teste' }, async t => {
  psql('drop schema public cascade; create schema public;');
  const lista = readFileSync(daRaiz('api/src/db.js'), 'utf8').match(/'\.\.\/sql\/[^']+'/g).map(s => s.slice(4, -1));
  const migrar = () => { for (const arquivo of lista) execFileSync('psql', [PG, '-v', 'ON_ERROR_STOP=1', '-q', '-f', daRaiz('api/' + arquivo)], { stdio: 'ignore' }); };
  migrar();
  const um = sql => JSON.parse(psql(/^\s*select/i.test(sql) ? `select row_to_json(q) from (${sql}) q` : `with q as (${sql}) select row_to_json(q) from q`));

  // uma conta antiga (antes da cobrança) e uma nova
  const antiga = um(`insert into families (name, created_at) values ('Antiga', '2026-09-01') returning id`).id;
  const nova = um(`insert into families (name, created_at) values ('Nova', '2026-10-20') returning id`).id;
  const dono = um(`insert into users (name,email,password_hash) values ('Ana','ana@t.com','x') returning id`).id;
  migrar(); // a migração roda a cada subida: cria a assinatura de teste das duas e marca a cortesia da antiga

  let relogio = new Date('2026-10-20T15:00:00Z');
  const env = { ASAAS_API_KEY: CHAVE, JWT_SECRET: SEGREDO };
  const asaas = asaasFalso();
  const app = appFalso();
  const requireAuth = (_req, _res, next) => next();
  const allowRoles = (...papeis) => (req, res, next) => (papeis.includes(req.auth.role) ? next() : res.status(403).json({ error: 'Sem permissão' }));
  registrarCobranca(app, { query, requireAuth, allowRoles, env, buscar: asaas.buscar, agora: () => relogio });
  const eu = { familyId: nova, sub: dono, role: 'admin' };
  const licenca = async quem => (await app.chamar('get', '/billing/license', { quem })).json.licenca;
  const avisar = (evento, cobranca, extra = {}) => app.chamar('post', '/billing/webhook/asaas', {
    headers: { 'asaas-access-token': tokenDoWebhook(env) },
    corpo: { id: `evt_${evento}_${cobranca?.id || extra.subscription?.id}_${extra.n || 1}`, event: evento, payment: cobranca, ...extra }
  });

  await t.test('conta antiga fica de cortesia; conta nova entra em teste', async () => {
    const cortesia = await licenca({ familyId: antiga, sub: dono, role: 'admin' });
    assert.deepEqual([cortesia.situacao, cortesia.acesso], ['cortesia', 'total']);
    psql(`update subscriptions set current_period_end='2026-11-03T15:00:00Z', plan_id=(select id from plans where name='mensal') where family_id='${nova}'`);
    const teste = await licenca(eu);
    assert.deepEqual([teste.situacao, teste.acesso, teste.dias_restantes], ['teste', 'total', 14]);
    assert.equal(um(`select count(*)::int n from plans where is_active`).n, 2, 'só mensal e anual à venda');
  });

  await t.test('contratar exige plano e CPF válidos, e conta de cortesia não contrata', async () => {
    assert.equal((await app.chamar('post', '/billing/subscribe', { quem: eu, corpo: { plan: 'premium', name: 'Ana Silva', cpfCnpj: '52998224725' } })).status, 400);
    assert.equal((await app.chamar('post', '/billing/subscribe', { quem: eu, corpo: { plan: 'mensal', name: 'Ana Silva', cpfCnpj: '12345678900' } })).status, 400);
    assert.equal((await app.chamar('post', '/billing/subscribe', { quem: { familyId: antiga, sub: dono, role: 'admin' }, corpo: { plan: 'mensal', name: 'Ana Silva', cpfCnpj: '52998224725' } })).status, 409);
    assert.equal((await app.chamar('post', '/billing/subscribe', { quem: { ...eu, role: 'viewer' }, corpo: { plan: 'mensal', name: 'Ana Silva', cpfCnpj: '52998224725' } })).status, 403);
    assert.equal(asaas.estado.clientes.length, 0, 'nada foi criado no Asaas');
  });

  let cobranca;
  await t.test('contratar o mensal: cliente e assinatura no Asaas, só cartão, e a fatura de volta', async () => {
    const r = await app.chamar('post', '/billing/subscribe', { quem: eu, corpo: { plan: 'mensal', name: 'Ana Silva', cpfCnpj: '529.982.247-25' } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.match(r.json.invoiceUrl, /^https:\/\/sandbox\.asaas\.com\/i\//);
    const [cliente] = asaas.estado.clientes, [assinatura] = asaas.estado.assinaturas;
    assert.deepEqual([cliente.cpfCnpj, cliente.email, cliente.externalReference], ['52998224725', 'ana@t.com', nova]);
    assert.deepEqual([assinatura.billingType, assinatura.value, assinatura.cycle, assinatura.nextDueDate], ['CREDIT_CARD', 9.9, 'MONTHLY', '2026-10-20']);
    cobranca = asaas.estado.cobrancas[0];
    const banco = um(`select status, pending_plan, external_customer_id from subscriptions where family_id='${nova}'`);
    assert.deepEqual([banco.status, banco.pending_plan, banco.external_customer_id], ['trial', 'mensal', cliente.id], 'a licença só muda com o pagamento');
    assert.ok(!JSON.stringify(um(`select row_to_json(s) j from subscriptions s where family_id='${nova}'`)).includes('52998224725'), 'o CPF não fica no banco do GFP');
    const l = await licenca(eu);
    assert.equal(l.aguardando_pagamento, true);
    assert.equal(l.fatura_pendente, r.json.invoiceUrl);
  });

  await t.test('pedir de novo o mesmo plano devolve a mesma fatura, sem duplicar', async () => {
    const r = await app.chamar('post', '/billing/subscribe', { quem: eu, corpo: { plan: 'mensal', name: 'Ana Silva', cpfCnpj: '52998224725' } });
    assert.equal(r.json.reaproveitada, true);
    assert.equal(asaas.estado.assinaturas.length, 1);
  });

  await t.test('aviso sem a senha certa é recusado', async () => {
    const r = await app.chamar('post', '/billing/webhook/asaas', { headers: { 'asaas-access-token': 'errada' }, corpo: { id: 'evt_x', event: 'PAYMENT_CONFIRMED', payment: cobranca } });
    assert.equal(r.status, 401);
    assert.equal(um(`select status from subscriptions where family_id='${nova}'`).status, 'trial');
  });

  await t.test('pagamento confirmado ativa a assinatura por um mês', async () => {
    const r = await avisar('PAYMENT_CONFIRMED', cobranca);
    assert.deepEqual([r.status, r.json.feito], [200, 'ativada']);
    const l = await licenca(eu);
    assert.deepEqual([l.situacao, l.acesso, l.plano, l.pode_desistir, l.aguardando_pagamento], ['ativa', 'total', 'mensal', true, false]);
    assert.equal(l.ate.slice(0, 10), '2026-11-21', 'até o fim do dia 20/11 em Brasília');
    assert.equal(um(`select status from payments where external_payment_id='${cobranca.id}'`).status, 'confirmed');
  });

  await t.test('o mesmo aviso repetido e o "recebido" tardio não mudam nada', async () => {
    assert.equal((await avisar('PAYMENT_CONFIRMED', cobranca)).json.feito, 'repetido');
    assert.equal((await avisar('PAYMENT_RECEIVED', cobranca)).json.feito, 'ja_confirmado');
    assert.equal(um(`select count(*)::int n from billing_events where family_id='${nova}' and event_type='payment_success'`).n, 1);
  });

  const proxima = { id: 'pay_renovacao', subscription: null, value: 9.9, dueDate: '2026-11-20', billingType: 'CREDIT_CARD', invoiceUrl: 'https://sandbox.asaas.com/i/renovacao' };
  await t.test('renovação: cobrança criada mostra a próxima data; atraso dá 10 dias e depois suspende', async () => {
    proxima.subscription = asaas.estado.assinaturas[0].id;
    await avisar('PAYMENT_CREATED', proxima);
    assert.equal((await licenca(eu)).proxima_cobranca, '2026-11-20');
    relogio = new Date('2026-11-21T15:00:00Z');
    assert.equal((await avisar('PAYMENT_OVERDUE', proxima)).json.feito, 'em_atraso');
    let l = await licenca(eu);
    assert.deepEqual([l.situacao, l.acesso], ['atrasada', 'total']);
    relogio = new Date('2026-12-02T15:00:00Z');
    l = await licenca(eu);
    assert.deepEqual([l.situacao, l.acesso], ['suspensa', 'consulta']);
  });

  await t.test('pagou em atraso: volta a ativa, contando do vencimento, sem reabrir o prazo de desistência', async () => {
    assert.equal((await avisar('PAYMENT_CONFIRMED', proxima)).json.feito, 'ativada');
    const l = await licenca(eu);
    assert.deepEqual([l.situacao, l.acesso, l.pode_desistir], ['ativa', 'total', false]);
    assert.equal(l.ate.slice(0, 10), '2026-12-21');
  });

  await t.test('cancelar: para de renovar e segue até o fim do período pago', async () => {
    const r = await app.chamar('post', '/billing/cancel', { quem: eu });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual([r.json.licenca.situacao, r.json.licenca.acesso], ['cancelada', 'total']);
    assert.deepEqual(asaas.estado.removidas, [asaas.estado.assinaturas[0].id]);
    relogio = new Date('2026-12-22T15:00:00Z');
    const l = await licenca(eu);
    assert.deepEqual([l.situacao, l.acesso], ['encerrada', 'consulta']);
    assert.equal((await app.chamar('post', '/billing/cancel', { quem: eu })).status, 409);
  });

  await t.test('aviso tardio da assinatura antiga não reativa a conta', async () => {
    const velha = { id: 'pay_velha', subscription: asaas.estado.assinaturas[0].id, value: 9.9, dueDate: '2026-12-20', billingType: 'CREDIT_CARD', externalReference: nova };
    await avisar('PAYMENT_CREATED', velha);
    await app.chamar('post', '/billing/subscribe', { quem: eu, corpo: { plan: 'anual', name: 'Ana Silva', cpfCnpj: '52998224725' } });
    assert.equal((await avisar('PAYMENT_CONFIRMED', velha)).json.feito, 'pagamento_registrado');
    assert.equal(um(`select status from subscriptions where family_id='${nova}'`).status, 'cancelled');
  });

  await t.test('contratar o anual: reaproveita o cliente, deixa escolher a forma, e vale um ano', async () => {
    assert.equal(asaas.estado.clientes.length, 1, 'o cliente não é criado de novo');
    const assinatura = asaas.estado.assinaturas.at(-1);
    assert.deepEqual([assinatura.billingType, assinatura.value, assinatura.cycle, assinatura.nextDueDate], ['UNDEFINED', 69.9, 'YEARLY', '2026-12-22']);
    const anual = asaas.estado.cobrancas.at(-1);
    assert.equal((await avisar('PAYMENT_RECEIVED', { ...anual, billingType: 'PIX' })).json.feito, 'ativada');
    const l = await licenca(eu);
    assert.deepEqual([l.situacao, l.plano, l.pode_desistir], ['ativa', 'anual', true]);
    assert.equal(l.ate.slice(0, 10), '2027-12-23');
  });

  await t.test('arrependimento em 7 dias: estorna, encerra e não pode repetir', async () => {
    relogio = new Date('2026-12-27T15:00:00Z');
    const r = await app.chamar('post', '/billing/refund', { quem: eu });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual([r.json.licenca.situacao, r.json.licenca.acesso], ['encerrada', 'consulta']);
    assert.deepEqual(asaas.estado.estornos, [asaas.estado.cobrancas.at(-1).id]);
    assert.equal(um(`select status from payments where external_payment_id='${asaas.estado.cobrancas.at(-1).id}'`).status, 'refunded');
    assert.equal((await app.chamar('post', '/billing/refund', { quem: eu })).status, 409);
  });

  await t.test('passados os 7 dias, não há estorno pelo sistema', async () => {
    await app.chamar('post', '/billing/subscribe', { quem: eu, corpo: { plan: 'mensal', name: 'Ana Silva', cpfCnpj: '52998224725' } });
    await avisar('PAYMENT_CONFIRMED', asaas.estado.cobrancas.at(-1));
    relogio = new Date('2027-01-05T15:00:00Z');
    const antes = asaas.estado.estornos.length;
    assert.equal((await app.chamar('post', '/billing/refund', { quem: eu })).status, 409);
    assert.equal(asaas.estado.estornos.length, antes);
  });

  await t.test('assinatura removida direto no Asaas vira cancelada; aviso de conta desconhecida é aceito e ignorado', async () => {
    const atual = asaas.estado.assinaturas.at(-1).id;
    const r = await avisar('SUBSCRIPTION_DELETED', null, { subscription: { id: atual } });
    assert.equal(r.json.feito, 'cancelada');
    const estranho = await avisar('PAYMENT_CONFIRMED', { id: 'pay_de_ninguem', subscription: 'sub_de_ninguem', value: 9.9, dueDate: '2027-01-05' });
    assert.deepEqual([estranho.status, estranho.json.feito], [200, 'ignorado']);
  });

  await t.test('processarAviso que falha solta o identificador para a reentrega valer', async () => {
    const quebrada = async (sql, params) => { if (/update subscriptions/.test(sql)) throw new Error('banco fora'); return query(sql, params); };
    const aviso = { id: 'evt_falha', event: 'SUBSCRIPTION_DELETED', subscription: { id: asaas.estado.assinaturas.at(-1).id } };
    psql(`update subscriptions set status='active' where family_id='${nova}'`);
    await assert.rejects(processarAviso(quebrada, aviso, relogio));
    assert.equal((await processarAviso(query, aviso, relogio)).feito, 'cancelada');
  });
});

test('planos: mensal só no cartão, anual com cartão, Pix e boleto', () => {
  assert.deepEqual([PLANOS.mensal.preco_cents, PLANOS.mensal.formas, PLANOS.mensal.forma_asaas], [990, ['cartao'], 'CREDIT_CARD']);
  assert.deepEqual([PLANOS.anual.preco_cents, PLANOS.anual.formas, PLANOS.anual.forma_asaas], [6990, ['cartao', 'pix', 'boleto'], 'UNDEFINED']);
});

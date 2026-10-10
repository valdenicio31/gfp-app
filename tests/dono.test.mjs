/* Painel do dono: quem entra, o que a lista mostra e as ações de suporte. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { emailsDosDonos, resumirContas, registrarDono } from '../api/src/dono.js';

const daRaiz = caminho => fileURLToPath(new URL('../' + caminho, import.meta.url));

test('donos: a lista padrão, ou a da variável do servidor', () => {
  assert.deepEqual(emailsDosDonos({}), ['valdenicio31@gmail.com', 'contato@viaiasolucoes.com']);
  assert.deepEqual(emailsDosDonos({ OWNER_EMAILS: ' Ana@X.com , beto@y.com ' }), ['ana@x.com', 'beto@y.com']);
});

test('resumo: adimplentes, inadimplentes, testes e receita recorrente', () => {
  const r = resumirContas([
    { situacao: 'ativa', plano: 'mensal' }, { situacao: 'ativa', plano: 'anual' },
    { situacao: 'atrasada', plano: 'mensal' }, { situacao: 'suspensa', plano: 'mensal' },
    { situacao: 'teste', dias_restantes: 3 }, { situacao: 'teste', dias_restantes: 12 },
    { situacao: 'cortesia' }, { situacao: 'cancelada', plano: 'mensal' }
  ]);
  assert.deepEqual([r.total, r.adimplentes, r.inadimplentes, r.em_teste, r.testes_vencendo], [8, 2, 2, 2, 1]);
  // em dia e em atraso contam; suspensa, cancelada, teste e cortesia não
  assert.equal(r.receita_mensal_cents, 990 + Math.round(6990 / 12) + 990);
});

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
  app.chamar = async (metodo, url, { corpo, quem } = {}) => {
    for (const rota of rotas.filter(r => r.metodo === metodo)) {
      const a = rota.caminho.split('/'), b = url.split('/');
      const params = {};
      if (a.length !== b.length || !a.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = b[i]), true) : p === b[i]))) continue;
      const req = { body: corpo, auth: quem, params, query: {}, headers: {} };
      let status = 200, json;
      const res = { status(s) { status = s; return res; }, json(j) { json = j; return res; } };
      for (const h of rota.handlers) { let seguiu = false; await h(req, res, () => { seguiu = true; }); if (!seguiu) break; }
      return { status, json };
    }
    return { status: 404, json: null };
  };
  return app;
}

test('painel do dono contra PostgreSQL', { skip: !PG && 'defina GFP_TEST_PG para rodar contra um PostgreSQL de teste' }, async t => {
  psql('drop schema public cascade; create schema public;');
  const lista = readFileSync(daRaiz('api/src/db.js'), 'utf8').match(/'\.\.\/sql\/[^']+'/g).map(s => s.slice(4, -1));
  const migrar = () => { for (const arquivo of lista) execFileSync('psql', [PG, '-v', 'ON_ERROR_STOP=1', '-q', '-f', daRaiz('api/' + arquivo)], { stdio: 'ignore' }); };
  migrar();
  const um = sql => JSON.parse(psql(/^\s*select/i.test(sql) ? `select row_to_json(q) from (${sql}) q` : `with q as (${sql}) select row_to_json(q) from q`));
  const conta = (nome, email, criada, confirmado = true) => {
    const f = um(`insert into families (name, created_at) values ('${nome}', '${criada}') returning id`).id;
    const u = um(`insert into users (name,email,password_hash,created_at${confirmado ? ',email_verified_at' : ''}) values ('${nome}','${email}','x','${criada}'${confirmado ? ',now()' : ''}) returning id`).id;
    psql(`insert into family_profiles (id,family_id,name,base_role,emoji,is_default) values (gen_random_uuid(),'${f}','Administrador','admin','👑',true)`);
    psql(`insert into memberships (family_id,user_id,role,status) values ('${f}','${u}','admin','active')`);
    return { f, u };
  };
  const dono = conta('Valdenicio', 'valdenicio31@gmail.com', '2026-09-01');
  const impostor = conta('Impostor', 'contato@viaiasolucoes.com', '2026-10-15', false);
  const cliente = conta('Carla', 'carla@t.com', '2026-10-12');
  const atrasado = conta('Davi', 'davi@t.com', '2026-10-12');
  migrar(); // cria as assinaturas de teste que faltam
  const relogio = new Date('2026-10-20T15:00:00Z');
  psql(`update subscriptions set exempt=true where family_id='${dono.f}'`);
  psql(`update subscriptions set exempt=false, status='active', plan_id=(select id from plans where name='anual'), current_period_end='2027-10-13T02:59:59Z', contracted_at='2026-10-12T15:00:00Z' where family_id='${cliente.f}'`);
  psql(`insert into payments (family_id, external_payment_id, status, amount_cents, plan_name, period, due_date, paid_at) values ('${cliente.f}','pay_1','confirmed',6990,'anual','yearly','2026-10-12','2026-10-12T15:00:00Z')`);
  psql(`update subscriptions set exempt=false, status='past_due', plan_id=(select id from plans where name='mensal'), overdue_since='2026-10-16', current_period_end='2026-10-16T02:59:59Z' where family_id='${atrasado.f}'`);
  psql(`update subscriptions set exempt=false, status='trial', current_period_end='2026-10-19T15:00:00Z' where family_id='${impostor.f}'`);
  // dado financeiro do cliente, que o painel não pode mostrar
  psql(`insert into accounts (family_id, owner_user_id, name, type, balance_cents) values ('${cliente.f}','${cliente.u}','Conta secreta da Carla','checking',987654321)`);

  const app = appFalso();
  registrarDono(app, { query, requireAuth: (_req, _res, next) => next(), env: {}, agora: () => relogio });
  const como = c => ({ familyId: c.f, sub: c.u, role: 'admin' });

  await t.test('só o dono com e-mail confirmado entra; para os outros a rota nem existe', async () => {
    assert.equal((await app.chamar('get', '/owner/me', { quem: como(dono) })).json.dono, true);
    assert.equal((await app.chamar('get', '/owner/me', { quem: como(cliente) })).json.dono, false);
    assert.equal((await app.chamar('get', '/owner/me', { quem: como(impostor) })).json.dono, false, 'e-mail de dono sem confirmação não vale');
    assert.equal((await app.chamar('get', '/owner/accounts', { quem: como(cliente) })).status, 404);
    assert.equal((await app.chamar('get', '/owner/accounts', { quem: como(impostor) })).status, 404);
    assert.equal((await app.chamar('post', `/owner/accounts/${cliente.f}/courtesy`, { quem: como(cliente), corpo: { cortesia: true } })).status, 404);
    assert.equal(um(`select exempt from subscriptions where family_id='${cliente.f}'`).exempt, false);
  });

  await t.test('redefinir a senha pelo e-mail confirma o endereço', async () => {
    psql(`update users set email_verified_at=now() where id='${impostor.u}'`);
    assert.equal((await app.chamar('get', '/owner/me', { quem: como(impostor) })).json.dono, true);
    psql(`update users set email_verified_at=null where id='${impostor.u}'`);
  });

  await t.test('a lista traz a situação de cada conta e o resumo', async () => {
    const r = await app.chamar('get', '/owner/accounts', { quem: como(dono) });
    assert.equal(r.status, 200);
    const por = email => r.json.contas.find(c => c.email === email);
    assert.deepEqual([por('carla@t.com').situacao, por('carla@t.com').plano, por('carla@t.com').total_pago_cents], ['ativa', 'anual', 6990]);
    assert.deepEqual([por('davi@t.com').situacao, por('davi@t.com').dias_em_atraso], ['atrasada', 4]);
    assert.equal(por('valdenicio31@gmail.com').situacao, 'cortesia');
    assert.equal(por('contato@viaiasolucoes.com').situacao, 'teste_encerrado');
    assert.deepEqual([r.json.resumo.total, r.json.resumo.adimplentes, r.json.resumo.inadimplentes], [4, 1, 1]);
    assert.equal(r.json.resumo.receita_mensal_cents, Math.round(6990 / 12) + 990);
    assert.equal(r.json.resumo.recebido_no_mes_cents, 6990);
  });

  await t.test('a resposta não traz nada das finanças do cliente', async () => {
    const texto = JSON.stringify((await app.chamar('get', '/owner/accounts', { quem: como(dono) })).json);
    assert.ok(!texto.includes('Conta secreta da Carla'));
    assert.ok(!texto.includes('987654321'));
    assert.ok(!/balance|saldo|password/i.test(texto));
  });

  await t.test('prorrogar o teste: só de quem não assinou, contando de hoje se já venceu, com registro', async () => {
    const r = await app.chamar('post', `/owner/accounts/${impostor.f}/trial`, { quem: como(dono), corpo: { dias: 7 } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.ate.slice(0, 10), '2026-10-27');
    assert.equal((await app.chamar('post', `/owner/accounts/${cliente.f}/trial`, { quem: como(dono), corpo: { dias: 7 } })).status, 409);
    assert.equal((await app.chamar('post', `/owner/accounts/${impostor.f}/trial`, { quem: como(dono), corpo: { dias: 500 } })).status, 400);
    assert.equal(um(`select count(*)::int n from audit_events where action='owner_trial_extended' and actor_user_id='${dono.u}'`).n, 1);
  });

  await t.test('cortesia: dá e tira, e ao tirar o teste recomeça', async () => {
    assert.equal((await app.chamar('post', `/owner/accounts/${impostor.f}/courtesy`, { quem: como(dono), corpo: { cortesia: true } })).json.cortesia, true);
    let lista = (await app.chamar('get', '/owner/accounts', { quem: como(dono) })).json.contas;
    assert.equal(lista.find(c => c.id === impostor.f).situacao, 'cortesia');
    await app.chamar('post', `/owner/accounts/${impostor.f}/courtesy`, { quem: como(dono), corpo: { cortesia: false } });
    lista = (await app.chamar('get', '/owner/accounts', { quem: como(dono) })).json.contas;
    const depois = lista.find(c => c.id === impostor.f);
    assert.deepEqual([depois.situacao, depois.dias_restantes], ['teste', 14]);
    assert.equal(um(`select count(*)::int n from audit_events where action like 'owner_courtesy%'`).n, 2);
  });
});

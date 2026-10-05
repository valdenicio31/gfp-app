/* Empréstimos: as regras da API e as rotas de ponta a ponta.

   Primeira parte — regras puras de api/src/emprestimos.js, sempre executadas.
   O cronograma usado nos testes vem do mesmo v2-emprestimos-calculo.js que a
   tela usa, então o que a tela manda é exatamente o que a API confere.

   Segunda parte — as rotas contra um PostgreSQL de verdade, com todas as
   migrações aplicadas. Só roda quando GFP_TEST_PG aponta para um banco de
   teste (psql na linha de comando), por exemplo:
     GFP_TEST_PG="postgres://postgres@127.0.0.1:5433/gfp" npm test
   O banco é apagado e recriado pelas migrações: NUNCA aponte para produção. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validarContrato, validarCronograma, pontuarCandidato, ordenarCandidatos, resumir, registrarEmprestimos } from '../api/src/emprestimos.js';

const daRaiz = caminho => fileURLToPath(new URL('../' + caminho, import.meta.url));
const ctx = vm.createContext({});
ctx.window = ctx;
vm.runInContext(readFileSync(daRaiz('v2-emprestimos-calculo.js'), 'utf8'), ctx, { filename: 'v2-emprestimos-calculo.js' });
const { gerarParcelas, resumoDoContrato } = ctx.GFPEmprestimos;

// O corpo que a tela manda ao cadastrar: contrato + cronograma calculado.
function corpoDaTela({ principalCents = 1000000, parcelas = 12, taxaMensal = 0.0199, primeiraEm = '2026-10-10', ...resto } = {}) {
  const gerado = gerarParcelas({ principalCents, parcelas, taxaMensal, primeiraEm });
  return {
    name: 'Consignado Caixa', lender: 'Caixa', kind: 'consignado',
    principalCents, monthlyRate: gerado.taxaMensal, installmentCents: gerado.parcelaCents, firstDueOn: primeiraEm,
    installments: gerado.parcelas.map(p => ({
      number: p.numero, dueOn: p.vence_em, amountCents: p.valor_cents,
      interestCents: p.juros_cents, balanceAfterCents: p.saldo_depois_cents
    })),
    ...resto
  };
}

/* ---------- regras puras ---------- */

test('cronograma gerado pela tela passa na conferência da API', () => {
  for (const [pv, n, taxa] of [[1000000, 12, 0.0199], [3500000, 84, 0.0172], [50000, 1, 0], [12345678, 60, 0.035]]) {
    const corpo = corpoDaTela({ principalCents: pv, parcelas: n, taxaMensal: taxa });
    assert.equal(validarCronograma(pv, corpo.installments), null, `${n}x de ${pv}`);
    assert.ok(validarContrato(corpo).dados, `contrato ${n}x`);
  }
});

test('conferência recusa cronograma adulterado', () => {
  const corpo = corpoDaTela();
  const semUma = corpo.installments.slice(0, -1);
  assert.match(validarCronograma(corpo.principalCents, semUma), /não devolve/);
  const trocada = corpo.installments.map(p => ({ ...p }));
  [trocada[2].number, trocada[3].number] = [trocada[3].number, trocada[2].number];
  assert.match(validarCronograma(corpo.principalCents, trocada), /fora de ordem/);
  const dataRuim = corpo.installments.map((p, i) => (i === 5 ? { ...p, dueOn: '2026-02-30' } : p));
  assert.match(validarCronograma(corpo.principalCents, dataRuim), /data de vencimento/);
  const volta = corpo.installments.map((p, i) => (i === 5 ? { ...p, dueOn: '2020-01-01' } : p));
  assert.match(validarCronograma(corpo.principalCents, volta), /antes da anterior/);
  const juros = corpo.installments.map((p, i) => (i === 0 ? { ...p, interestCents: p.amountCents + 1 } : p));
  assert.match(validarCronograma(corpo.principalCents, juros), /juros/);
  assert.match(validarContrato({ ...corpo, name: 'x' }).erro, /nome/);
  assert.match(validarContrato({ ...corpo, kind: 'agiota' }).erro, /Tipo/);
  assert.match(validarContrato({ ...corpo, alreadyPaid: 13 }).erro, /mais parcelas pagas/);
});

test('candidato para vincular: valor e data na janela, exato primeiro', () => {
  const parcela = { amount_cents: 94900, due_on: '2026-11-10' };
  const l = (id, amount_cents, occurred_on, type = 'expense') => ({ id, amount_cents, occurred_on, type });
  assert.equal(pontuarCandidato(parcela, l('a', 94900, '2026-11-10', 'income')), null, 'entrada não paga parcela');
  assert.equal(pontuarCandidato(parcela, l('a', 94900, '2026-11-26')), null, '16 dias depois: fora da janela');
  assert.equal(pontuarCandidato(parcela, l('a', 70000, '2026-11-10')), null, 'abaixo de 80%');
  assert.equal(pontuarCandidato(parcela, l('a', 110000, '2026-11-10')), null, 'acima de 110%');
  const ordem = ordenarCandidatos(parcela, [
    l('perto-diferente', 95000, '2026-11-10'),
    l('exato-longe', 94900, '2026-11-15'),
    l('exato-perto', 94900, '2026-11-09'),
    l('fora', 50000, '2026-11-10')
  ]).map(c => c.id);
  assert.deepEqual(ordem, ['exato-perto', 'exato-longe', 'perto-diferente']);
});

test('resumo da API bate com o resumo da tela', () => {
  const gerado = gerarParcelas({ principalCents: 1000000, parcelas: 12, taxaMensal: 0.0199, primeiraEm: '2026-10-10' });
  const tela = gerado.parcelas.map((p, i) => ({ ...p, paga: i < 4, pago_cents: i === 3 ? p.valor_cents - 1500 : null }));
  const api = tela.map(p => ({
    number: p.numero, due_on: p.vence_em, amount_cents: p.valor_cents, interest_cents: p.juros_cents,
    paid_on: p.paga ? p.vence_em : null, paid_cents: p.paga ? (p.pago_cents ?? p.valor_cents) : null
  }));
  const a = resumoDoContrato(1000000, tela);
  const b = resumir(1000000, api);
  for (const campo of ['total_contratado_cents', 'juros_total_cents', 'juros_pagos_cents', 'pago_cents', 'economia_cents', 'parcelas_pagas', 'saldo_devedor_cents']) {
    assert.equal(b[campo], a[campo], campo);
  }
  assert.equal(b.economia_cents, 1500);
  assert.equal(b.proxima_parcela.number, 5);
});

/* ---------- rotas contra PostgreSQL ---------- */

const PG = process.env.GFP_TEST_PG;

// Um pg mínimo sobre o psql: suficiente para as consultas das rotas.
function literal(valor) {
  if (valor === null || valor === undefined) return 'NULL';
  if (typeof valor === 'number') return String(valor);
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';
  return `'${String(valor).replace(/'/g, "''")}'`;
}
function sqlCom(texto, params) {
  return texto.replace(/\$(\d+)/g, (_, n) => literal(params[Number(n) - 1]));
}
function psql(sql) {
  return execFileSync('psql', [PG, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
async function query(texto, params = []) {
  const sql = sqlCom(texto, params).trim();
  const inicio = sql.slice(0, 6).toLowerCase();
  if (inicio === 'select' || inicio.startsWith('with')) {
    return { rows: JSON.parse(psql(`select coalesce(json_agg(q),'[]'::json) from (${sql}) q`)) };
  }
  if (/\breturning\b/i.test(sql)) {
    return { rows: JSON.parse(psql(`with q as (${sql}) select coalesce(json_agg(q),'[]'::json) from q`)) };
  }
  psql(sql);
  return { rows: [] };
}
const transaction = async trabalho => trabalho({ query });

// Um express mínimo: registra as rotas e as executa na ordem.
function appFalso() {
  const rotas = [];
  const app = {};
  for (const metodo of ['get', 'post', 'patch', 'delete']) {
    app[metodo] = (caminho, ...handlers) => rotas.push({ metodo, caminho, handlers });
  }
  app.chamar = async (metodo, url, { corpo, quem } = {}) => {
    const [caminho, busca = ''] = url.split('?');
    for (const rota of rotas) {
      if (rota.metodo !== metodo) continue;
      const partes = rota.caminho.split('/'), pedidas = caminho.split('/');
      if (partes.length !== pedidas.length) continue;
      const params = {};
      if (!partes.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = decodeURIComponent(pedidas[i])), true) : p === pedidas[i]))) continue;
      const req = { params, body: corpo, query: Object.fromEntries(new URLSearchParams(busca)), auth: quem };
      let status = 200, json;
      const res = { status(s) { status = s; return res; }, json(j) { json = j; return res; } };
      for (const h of rota.handlers) {
        let seguiu = false;
        await h(req, res, () => { seguiu = true; });
        if (!seguiu) break;
      }
      return { status, json };
    }
    return { status: 404, json: { error: 'rota' } };
  };
  return app;
}
const requireAuth = (req, _res, next) => next();
const allowRoles = (...papeis) => (req, res, next) => (papeis.includes(req.auth.role) ? next() : res.status(403).json({ error: 'Sem permissão' }));
const isUuid = v => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
async function contaGravavel(req, accountId) {
  const r = await query('select id,owner_user_id,is_private from accounts where id=$1 and family_id=$2', [accountId, req.auth.familyId]);
  const l = r.rows[0];
  if (!l) return null;
  return l.owner_user_id === req.auth.sub || (req.auth.role === 'admin' && l.is_private === false) ? l : null;
}

test('rotas de empréstimo de ponta a ponta', { skip: !PG && 'defina GFP_TEST_PG para rodar contra um PostgreSQL de teste' }, async t => {
  // Banco limpo com todas as migrações, na ordem do db.js.
  psql('drop schema public cascade; create schema public;');
  const lista = readFileSync(daRaiz('api/src/db.js'), 'utf8').match(/'\.\.\/sql\/[^']+'/g).map(s => s.slice(4, -1));
  for (const arquivo of lista) execFileSync('psql', [PG, '-v', 'ON_ERROR_STOP=1', '-q', '-f', daRaiz('api/' + arquivo)], { stdio: 'ignore' });

  const um = sql => JSON.parse(psql(/^\s*select/i.test(sql) ? `select row_to_json(q) from (${sql}) q` : `with q as (${sql}) select row_to_json(q) from q`));
  const f1 = um(`insert into families (name) values ('Silva') returning id`).id;
  const f2 = um(`insert into families (name) values ('Outra') returning id`).id;
  const admin = um(`insert into users (name,email,password_hash) values ('Ana','ana@t.com','x') returning id`).id;
  const adulto = um(`insert into users (name,email,password_hash) values ('Beto','beto@t.com','x') returning id`).id;
  const estranho = um(`insert into users (name,email,password_hash) values ('Zé','ze@t.com','x') returning id`).id;
  const conta = um(`insert into accounts (family_id,owner_user_id,name,type,balance_cents) values ('${f1}','${admin}','Corrente','checking',500000) returning id`).id;
  const saldo = () => Number(um(`select balance_cents b from accounts where id='${conta}'`).b);
  const eu = { familyId: f1, sub: admin, role: 'admin' };

  const app = appFalso();
  registrarEmprestimos(app, { query, transaction, requireAuth, allowRoles, contaGravavel, isUuid });

  const corpo = corpoDaTela({ accountId: conta, alreadyPaid: 2 });
  const criado = await app.chamar('post', '/loans', { corpo, quem: eu });
  assert.equal(criado.status, 201, JSON.stringify(criado.json));
  const id = criado.json.id;

  await t.test('cadastro grava contrato, cronograma e parcelas já pagas', async () => {
    const r = await app.chamar('get', `/loans/${id}`, { quem: eu });
    assert.equal(r.status, 200);
    assert.equal(r.json.parcelas.length, 12);
    assert.equal(r.json.resumo.parcelas_pagas, 2);
    assert.equal(r.json.parcelas[0].payment_mode, 'marked');
    assert.equal(r.json.parcelas[0].transaction_id, null, 'parcela antiga não cria lançamento');
    assert.equal(r.json.status, 'active');
    assert.equal(saldo(), 500000, 'cadastrar não mexe no saldo');
  });

  await t.test('outra família não enxerga nem mexe', async () => {
    const outro = { familyId: f2, sub: estranho, role: 'admin' };
    assert.equal((await app.chamar('get', `/loans/${id}`, { quem: outro })).status, 404);
    assert.equal((await app.chamar('get', '/loans', { quem: outro })).json.length, 0);
    assert.equal((await app.chamar('post', `/loans/${id}/installments/3/pay`, { corpo: { mode: 'mark' }, quem: outro })).status, 404);
    assert.equal((await app.chamar('delete', `/loans/${id}`, { quem: outro })).status, 404);
  });

  await t.test('dependente e somente leitura não dão baixa', async () => {
    for (const role of ['dependent', 'viewer']) {
      const r = await app.chamar('post', `/loans/${id}/installments/3/pay`, { corpo: { mode: 'mark' }, quem: { ...eu, sub: adulto, role } });
      assert.equal(r.status, 403, role);
    }
  });

  const p3 = (await app.chamar('get', `/loans/${id}`, { quem: eu })).json.parcelas[2];

  await t.test('débito do extrato é achado e vinculado, sem duplicar', async () => {
    // O extrato trouxe o débito dois dias depois do vencimento, sem categoria.
    const debito = um(`insert into transactions (family_id,account_id,created_by,type,description,amount_cents,occurred_on)
      values ('${f1}','${conta}','${admin}','expense','DEB CONSIGNADO CAIXA',${p3.amount_cents},'${p3.due_on}'::date + 2) returning id`).id;
    um(`insert into transactions (family_id,account_id,created_by,type,description,amount_cents,occurred_on)
      values ('${f1}','${conta}','${admin}','expense','Mercado',${p3.amount_cents + 90000},'${p3.due_on}') returning id`);
    const cand = await app.chamar('get', `/loans/${id}/installments/3/candidates`, { quem: eu });
    assert.equal(cand.status, 200);
    assert.equal(cand.json.length, 1, 'só o débito compatível');
    assert.equal(cand.json[0].id, debito);
    assert.equal(cand.json[0].exato, true);

    const antes = saldo();
    const r = await app.chamar('post', `/loans/${id}/installments/3/pay`, { corpo: { mode: 'link', transactionId: debito }, quem: eu });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(saldo(), antes, 'vincular não mexe no saldo');
    assert.equal(um(`select category c from transactions where id='${debito}'`).c, 'Empréstimos', 'débito ganha a categoria');
    const denovo = await app.chamar('get', `/loans/${id}/installments/4/candidates`, { quem: eu });
    assert.ok(!denovo.json.some(c => c.id === debito), 'lançamento já usado não volta como candidato');
    const outra = await app.chamar('post', `/loans/${id}/installments/4/pay`, { corpo: { mode: 'link', transactionId: debito }, quem: eu });
    assert.equal(outra.status, 409, 'um lançamento paga uma parcela só');
  });

  await t.test('sem débito no extrato, cria a despesa e desconta da conta', async () => {
    const antes = saldo();
    const r = await app.chamar('post', `/loans/${id}/installments/4/pay`, { corpo: { mode: 'create', paidCents: 90000, paidOn: '2027-01-05' }, quem: eu });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(saldo(), antes - 90000);
    const l = um(`select description, category, supplier, type, amount_cents from transactions where id='${r.json.transactionId}'`);
    assert.equal(l.type, 'expense');
    assert.equal(l.category, 'Empréstimos');
    assert.equal(l.supplier, 'Caixa');
    assert.match(l.description, /^Parcela 4\/12 — Consignado Caixa$/);
    const resumo = (await app.chamar('get', `/loans/${id}`, { quem: eu })).json.resumo;
    assert.equal(resumo.parcelas_pagas, 4);
    assert.ok(resumo.economia_cents > 0, 'pagou menos que a parcela: economia por antecipação');
    assert.equal((await app.chamar('post', `/loans/${id}/installments/4/pay`, { corpo: { mode: 'mark' }, quem: eu })).status, 409, 'não paga duas vezes');
  });

  await t.test('desfazer: apaga só o lançamento que o GFP criou', async () => {
    const antes = saldo();
    const criada = (await app.chamar('get', `/loans/${id}`, { quem: eu })).json.parcelas[3];
    const r = await app.chamar('delete', `/loans/${id}/installments/4/pay`, { quem: eu });
    assert.equal(r.json.lancamentoApagado, true);
    assert.equal(saldo(), antes + 90000, 'saldo volta');
    assert.equal(psql(`select count(*) from transactions where id='${criada.transaction_id}'`), '0');

    const vinculada = (await app.chamar('get', `/loans/${id}`, { quem: eu })).json.parcelas[2];
    const r2 = await app.chamar('delete', `/loans/${id}/installments/3/pay`, { quem: eu });
    assert.equal(r2.json.lancamentoApagado, false);
    assert.equal(psql(`select count(*) from transactions where id='${vinculada.transaction_id}'`), '1', 'débito do extrato continua');
  });

  await t.test('corrigir parcela aberta; parcela paga não se altera', async () => {
    const r = await app.chamar('patch', `/loans/${id}/installments/12`, { corpo: { amountCents: 95000, dueOn: '2027-09-15' }, quem: eu });
    assert.equal(r.status, 200);
    const p12 = (await app.chamar('get', `/loans/${id}`, { quem: eu })).json.parcelas[11];
    assert.equal(p12.amount_cents, 95000);
    assert.equal(p12.due_on, '2027-09-15');
    assert.equal(p12.amortization_cents, 95000 - p12.interest_cents);
    assert.equal((await app.chamar('patch', `/loans/${id}/installments/1`, { corpo: { amountCents: 1 }, quem: eu })).status, 409);
  });

  await t.test('pagar todas encerra o contrato; desfazer reabre', async () => {
    for (let n = 3; n <= 12; n += 1) await app.chamar('post', `/loans/${id}/installments/${n}/pay`, { corpo: { mode: 'mark' }, quem: eu });
    assert.equal((await app.chamar('get', `/loans/${id}`, { quem: eu })).json.status, 'settled');
    await app.chamar('delete', `/loans/${id}/installments/12/pay`, { quem: eu });
    assert.equal((await app.chamar('get', `/loans/${id}`, { quem: eu })).json.status, 'active');
  });

  await t.test('apagar: só sem baixa por lançamento', async () => {
    await app.chamar('post', `/loans/${id}/installments/12/pay`, { corpo: { mode: 'create' }, quem: eu });
    assert.equal((await app.chamar('delete', `/loans/${id}`, { quem: eu })).status, 409);
    await app.chamar('delete', `/loans/${id}/installments/12/pay`, { quem: eu });
    assert.equal((await app.chamar('delete', `/loans/${id}`, { quem: eu })).status, 200);
    assert.equal(psql(`select count(*) from loan_installments where loan_id='${id}'`), '0', 'parcelas vão junto');
  });

  await t.test('lista traz o resumo de cada contrato', async () => {
    await app.chamar('post', '/loans', { corpo: corpoDaTela({ name: 'Pessoal Nubank', kind: 'pessoal', principalCents: 300000, parcelas: 6 }), quem: eu });
    const r = await app.chamar('get', '/loans', { quem: eu });
    assert.equal(r.json.length, 1);
    assert.equal(r.json[0].resumo.parcelas_total, 6);
    assert.equal(r.json[0].resumo.saldo_devedor_cents, r.json[0].resumo.total_contratado_cents);
  });
});

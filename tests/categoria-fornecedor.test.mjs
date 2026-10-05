/* A categoria dada a um fornecedor vale para todos os lançamentos dele.

   A regra de quando replicar roda sempre. A replicação em si roda contra um
   PostgreSQL de teste quando GFP_TEST_PG está definido (ver emprestimos.test.mjs;
   o banco é recriado — nunca aponte para produção). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deveReplicar, replicarCategoriaDoFornecedor } from '../api/src/categoria-fornecedor.js';

test('replica quando a categoria ou o fornecedor muda — e só com os dois preenchidos', () => {
  assert.equal(deveReplicar(null, { category: 'Mercado', supplier: 'Assaí' }), true, 'lançamento novo');
  assert.equal(deveReplicar(null, { category: 'Mercado', supplier: '' }), false, 'sem fornecedor');
  assert.equal(deveReplicar(null, { category: null, supplier: 'Assaí' }), false, 'sem categoria');
  const antes = { category: 'Outros', supplier: 'Assaí' };
  assert.equal(deveReplicar(antes, { category: 'Mercado', supplier: 'Assaí' }), true, 'categoria mudou');
  assert.equal(deveReplicar(antes, { category: 'Outros', supplier: 'Extra' }), true, 'fornecedor mudou');
  assert.equal(deveReplicar(antes, { category: 'Outros', supplier: ' assaí ' }), false, 'nada mudou: só valor ou data');
  assert.equal(deveReplicar(antes, { category: '', supplier: 'Assaí' }), false, 'tirar a categoria não se replica');
});

const PG = process.env.GFP_TEST_PG;
const daRaiz = caminho => fileURLToPath(new URL('../' + caminho, import.meta.url));
const literal = v => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const psql = sql => execFileSync('psql', [PG, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function executar(texto, params = []) {
  const sql = texto.replace(/\$(\d+)/g, (_, n) => literal(params[Number(n) - 1])).trim();
  if (/\breturning\b/i.test(sql)) return { rows: JSON.parse(psql(`with q as (${sql}) select coalesce(json_agg(q),'[]'::json) from q`)) };
  psql(sql);
  return { rows: [] };
}

test('replicação no banco', { skip: !PG && 'defina GFP_TEST_PG para rodar contra um PostgreSQL de teste' }, async () => {
  psql('drop schema public cascade; create schema public;');
  const lista = readFileSync(daRaiz('api/src/db.js'), 'utf8').match(/'\.\.\/sql\/[^']+'/g).map(s => s.slice(4, -1));
  for (const arquivo of lista) execFileSync('psql', [PG, '-v', 'ON_ERROR_STOP=1', '-q', '-f', daRaiz('api/' + arquivo)], { stdio: 'ignore' });
  const um = sql => JSON.parse(psql(`with q as (${sql}) select row_to_json(q) from q`));
  const f1 = um(`insert into families (name) values ('Ana') returning id`).id;
  const f2 = um(`insert into families (name) values ('Outra') returning id`).id;
  const eu = um(`insert into users (name,email,password_hash) values ('Ana','ana@t.com','x') returning id`).id;
  const outro = um(`insert into users (name,email,password_hash) values ('Zé','ze@t.com','x') returning id`).id;
  const conta = um(`insert into accounts (family_id,owner_user_id,name,type) values ('${f1}','${eu}','Corrente','checking') returning id`).id;
  const alheia = um(`insert into accounts (family_id,owner_user_id,name,type) values ('${f2}','${outro}','Corrente','checking') returning id`).id;
  const lanc = (familia, c, quem, tipo, forn, cat) => um(`insert into transactions (family_id,account_id,created_by,type,description,amount_cents,occurred_on,supplier,category)
    values ('${familia}','${c}','${quem}','${tipo}','x',1000,'2026-10-01',${literal(forn)},${literal(cat)}) returning id`).id;
  const editado = lanc(f1, conta, eu, 'expense', 'Assaí Atacadista', 'Mercado');
  const semCategoria = lanc(f1, conta, eu, 'expense', 'Assaí Atacadista', null);
  const outraCategoria = lanc(f1, conta, eu, 'expense', 'ASSAÍ ATACADISTA ', 'Outros');
  const jaIgual = lanc(f1, conta, eu, 'expense', 'Assaí Atacadista', 'Mercado');
  const outroFornecedor = lanc(f1, conta, eu, 'expense', 'Posto Ipiranga', 'Transporte');
  const semFornecedor = lanc(f1, conta, eu, 'expense', null, null);
  const transferencia = lanc(f1, conta, eu, 'transfer', 'Assaí Atacadista', null);
  const deOutraConta = lanc(f2, alheia, outro, 'expense', 'Assaí Atacadista', 'Outros');
  const cat = id => JSON.parse(psql(`select row_to_json(q) from (select category c from transactions where id='${id}') q`)).c;

  const n = await replicarCategoriaDoFornecedor(executar, { familyId: f1, userId: eu, isAdmin: true, supplier: 'Assaí Atacadista', category: 'Mercado', type: 'expense', exceto: editado });
  assert.equal(n, 2, 'muda o sem categoria e o que tinha outra');
  assert.equal(cat(semCategoria), 'Mercado');
  assert.equal(cat(outraCategoria), 'Mercado', 'nome com maiúsculas e espaço é o mesmo fornecedor');
  assert.equal(cat(jaIgual), 'Mercado');
  assert.equal(cat(outroFornecedor), 'Transporte', 'outro fornecedor não muda');
  assert.equal(cat(semFornecedor), null);
  assert.equal(cat(transferencia), null, 'transferência fica de fora');
  assert.equal(cat(deOutraConta), 'Outros', 'lançamento de outra pessoa nunca muda');

  const cadastro = () => JSON.parse(psql(`select coalesce(json_agg(q),'[]'::json) from (select name, kind, category from partners where family_id='${f1}') q`));
  assert.deepEqual(cadastro(), [{ name: 'Assaí Atacadista', kind: 'supplier', category: 'Mercado' }], 'cadastro criado com a categoria');

  // Mudar de ideia: a nova categoria vale para todos e atualiza o cadastro, sem duplicar.
  const n2 = await replicarCategoriaDoFornecedor(executar, { familyId: f1, userId: eu, isAdmin: true, supplier: 'assaí atacadista', category: 'Alimentação', type: 'expense', exceto: null });
  assert.equal(n2, 4);
  assert.deepEqual(cadastro(), [{ name: 'Assaí Atacadista', kind: 'supplier', category: 'Alimentação' }]);
  assert.equal(cat(deOutraConta), 'Outros');
});

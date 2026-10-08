/* Central: recorte por banco e conta, e os painéis do ano corrente.
 * Empréstimos: quanto cada parcela paga custou de juros e quanto economizou.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { recortePedido, sqlDoRecorte, contaNoRecorte, completarMeses, completarAnos, SEM_BANCO } from '../api/src/painel.js';
import { custoDaParcela, resumir } from '../api/src/emprestimos.js';

const CONTA = '4e3a9f5e-c0c1-4f34-9970-5b681b9c5ab2';
const BANCO = 'b00b7478-5cc7-4b38-a9a5-af459b41ce70';

test('sem filtro, a Central vem consolidada', () => {
  const r = recortePedido({});
  assert.equal(r.ativo, false);
  assert.deepEqual([r.accountId, r.bankId, r.semBanco], [null, null, false]);
});

test('filtro por conta, por banco e por contas sem banco', () => {
  assert.equal(recortePedido({ account_id: CONTA }).accountId, CONTA);
  assert.equal(recortePedido({ bank_id: BANCO }).bankId, BANCO);
  const sem = recortePedido({ bank_id: SEM_BANCO });
  assert.equal(sem.semBanco, true);
  assert.equal(sem.bankId, null);
});

test('filtro torto é recusado, não ignorado', () => {
  assert.ok(recortePedido({ account_id: "x' or 1=1" }).erro);
  assert.ok(recortePedido({ bank_id: 'abc' }).erro);
});

test('o trecho de SQL usa só parâmetros numerados', () => {
  const sql = sqlDoRecorte(6, 'origem');
  assert.match(sql, /origem\.id=\$6::uuid/);
  assert.match(sql, /origem\.bank_id=\$7::uuid/);
  assert.match(sql, /\$8::boolean/);
});

test('conta dentro e fora do recorte', () => {
  const nubank = { id: CONTA, bank_id: BANCO }, dinheiro = { id: 'x', bank_id: null };
  assert.equal(contaNoRecorte(nubank, recortePedido({})), true);
  assert.equal(contaNoRecorte(nubank, recortePedido({ bank_id: BANCO })), true);
  assert.equal(contaNoRecorte(dinheiro, recortePedido({ bank_id: BANCO })), false);
  assert.equal(contaNoRecorte(dinheiro, recortePedido({ bank_id: SEM_BANCO })), true);
  assert.equal(contaNoRecorte(nubank, recortePedido({ bank_id: SEM_BANCO })), false);
});

test('meses sem movimento entram zerados, sempre doze', () => {
  const meses = completarMeses(2026, [{ mes: 3, receitas_cents: '1000', despesas_cents: '400' }]);
  assert.equal(meses.length, 12);
  assert.deepEqual(meses[2], { ano: 2026, mes: 3, ym: '2026-03', receitas_cents: 1000, despesas_cents: 400 });
  assert.equal(meses[0].receitas_cents, 0);
});

test('últimos cinco anos, do mais antigo para o corrente', () => {
  const anos = completarAnos(2026, [{ ano: 2025, receitas_cents: 5, despesas_cents: 3 }]);
  assert.deepEqual(anos.map(a => a.ano), [2022, 2023, 2024, 2025, 2026]);
  assert.equal(anos[3].receitas_cents, 5);
  assert.equal(anos[4].despesas_cents, 0);
});

test('antecipação: o desconto sai dos juros e vira economia', () => {
  const p = { paid_on: '2026-10-01', amount_cents: 100000, interest_cents: 30000, paid_cents: 88000 };
  assert.deepEqual(custoDaParcela(p), { pago_cents: 88000, juros_pagos_cents: 18000, economia_cents: 12000 });
});

test('atraso com multa: o excesso entra como juro, sem economia', () => {
  const p = { paid_on: '2026-10-01', amount_cents: 100000, interest_cents: 30000, paid_cents: 104000 };
  assert.deepEqual(custoDaParcela(p), { pago_cents: 104000, juros_pagos_cents: 34000, economia_cents: 0 });
});

test('parcela em aberto não conta como paga', () => {
  assert.deepEqual(custoDaParcela({ paid_on: null, amount_cents: 100000, interest_cents: 30000 }), { pago_cents: 0, juros_pagos_cents: 0, economia_cents: 0 });
});

test('resumo: pagas, a pagar e juros fecham com o contrato', () => {
  const parcelas = [
    { number: 1, due_on: '2026-08-10', amount_cents: 100000, interest_cents: 30000, paid_on: '2026-08-10', paid_cents: 100000 },
    { number: 2, due_on: '2026-09-10', amount_cents: 100000, interest_cents: 20000, paid_on: '2026-08-20', paid_cents: 92000 },
    { number: 3, due_on: '2026-10-10', amount_cents: 100000, interest_cents: 10000, paid_on: null, paid_cents: null }
  ];
  const r = resumir(240000, parcelas, '2026-10-01');
  assert.equal(r.parcelas_pagas, 2);
  assert.equal(r.parcelas_a_pagar, 1);
  assert.equal(r.pago_cents, 192000);
  assert.equal(r.economia_cents, 8000);
  assert.equal(r.juros_pagos_cents, 42000);
  assert.equal(r.juros_a_pagar_cents, 10000);
  assert.equal(r.juros_pagos_cents + r.juros_a_pagar_cents + r.economia_cents, r.juros_total_cents);
});

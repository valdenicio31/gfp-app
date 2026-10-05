/* Empréstimos do GFP — rotas da API e as regras que elas aplicam.

   O cronograma nasce na tela, pela mesma matemática testada em
   v2-emprestimos-calculo.js, e chega aqui pronto. A API não confia nele de
   olhos fechados: confere número, datas, valores e que a soma das
   amortizações devolve exatamente o valor emprestado.

   Pagar uma parcela segue a regra "vincular ou criar":
   - se o débito já está nos lançamentos (veio no extrato), a parcela é
     ligada a ele e nada novo entra na conta;
   - se não está, o sistema cria a despesa na conta escolhida;
   - parcelas de antes do cadastro podem ser só marcadas como pagas.

   As regras puras (validar, pontuar candidatos, resumir) ficam exportadas à
   parte para os testes; registrarEmprestimos recebe de server.js o banco e a
   autenticação, então este arquivo não depende de nenhuma biblioteca. */

export const TIPOS = ['consignado', 'pessoal', 'cdc', 'financiamento', 'cheque_especial', 'outro'];
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CENTAVOS = 999999999999;

const texto = (valor, max) => {
  const limpo = String(valor ?? '').trim();
  return limpo ? limpo.slice(0, max) : null;
};
const inteiro = valor => (Number.isInteger(valor) ? valor : NaN);
const dataValida = valor => {
  if (typeof valor !== 'string' || !DATA.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
};
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/* ---------- validação do contrato e do cronograma ---------- */

export function validarContrato(corpo = {}) {
  const nome = texto(corpo.name, 80);
  if (!nome || nome.length < 2) return { erro: 'Dê um nome ao empréstimo (por exemplo, "Consignado Caixa").' };
  const tipo = corpo.kind || 'pessoal';
  if (!TIPOS.includes(tipo)) return { erro: 'Tipo de empréstimo inválido.' };
  const principal = inteiro(corpo.principalCents);
  if (!(principal > 0 && principal <= MAX_CENTAVOS)) return { erro: 'Informe o valor emprestado.' };
  const taxa = Number(corpo.monthlyRate ?? 0);
  if (!(taxa >= 0 && taxa < 2)) return { erro: 'Taxa de juros inválida.' };
  const parcela = inteiro(corpo.installmentCents);
  if (!(parcela > 0 && parcela <= MAX_CENTAVOS)) return { erro: 'Informe o valor da parcela.' };
  if (!dataValida(corpo.firstDueOn)) return { erro: 'Informe a data da primeira parcela.' };
  const jaPagas = corpo.alreadyPaid == null ? 0 : inteiro(corpo.alreadyPaid);
  if (!(jaPagas >= 0)) return { erro: 'Número de parcelas já pagas inválido.' };

  const cronograma = Array.isArray(corpo.installments) ? corpo.installments : [];
  const erroCronograma = validarCronograma(principal, cronograma);
  if (erroCronograma) return { erro: erroCronograma };
  if (jaPagas > cronograma.length) return { erro: 'Há mais parcelas pagas do que parcelas no contrato.' };

  return {
    dados: {
      name: nome,
      lender: texto(corpo.lender, 80),
      kind: tipo,
      principalCents: principal,
      monthlyRate: taxa,
      installmentCents: parcela,
      firstDueOn: corpo.firstDueOn,
      accountId: corpo.accountId || null,
      category: texto(corpo.category, 40) || 'Empréstimos',
      notes: texto(corpo.notes, 400),
      alreadyPaid: jaPagas,
      installments: cronograma.map(p => ({
        number: p.number, dueOn: p.dueOn, amountCents: p.amountCents,
        interestCents: p.interestCents, amortizationCents: p.amountCents - p.interestCents,
        balanceAfterCents: p.balanceAfterCents
      }))
    }
  };
}

export function validarCronograma(principalCents, parcelas) {
  if (!Array.isArray(parcelas) || !parcelas.length) return 'O cronograma de parcelas está vazio.';
  if (parcelas.length > 600) return 'Um contrato pode ter no máximo 600 parcelas.';
  let anterior = null;
  let amortizado = 0;
  for (let i = 0; i < parcelas.length; i += 1) {
    const p = parcelas[i] || {};
    if (p.number !== i + 1) return `A parcela ${i + 1} está fora de ordem no cronograma.`;
    if (!dataValida(p.dueOn)) return `A parcela ${i + 1} está sem data de vencimento válida.`;
    if (anterior && p.dueOn < anterior) return `A parcela ${i + 1} vence antes da anterior.`;
    if (!(Number.isInteger(p.amountCents) && p.amountCents > 0 && p.amountCents <= MAX_CENTAVOS)) return `O valor da parcela ${i + 1} é inválido.`;
    if (!(Number.isInteger(p.interestCents) && p.interestCents >= 0 && p.interestCents <= p.amountCents)) return `Os juros da parcela ${i + 1} são inválidos.`;
    if (!(Number.isInteger(p.balanceAfterCents) && p.balanceAfterCents >= 0)) return `O saldo depois da parcela ${i + 1} é inválido.`;
    amortizado += p.amountCents - p.interestCents;
    anterior = p.dueOn;
  }
  // A última parcela absorve os arredondamentos, então a conta fecha no centavo.
  if (amortizado !== principalCents) return 'O cronograma não devolve o valor emprestado: confira as parcelas.';
  return null;
}

/* ---------- escolha do lançamento para vincular ---------- */

/* Um lançamento é candidato a pagar a parcela quando é uma saída, está a até
   15 dias do vencimento e o valor fica entre 80% (antecipação com desconto de
   juros) e 110% (atraso com multa) da parcela. Os melhores vêm primeiro: valor
   exato e data mais próxima. */
export const JANELA_DIAS = 15;
export function pontuarCandidato(parcela, lancamento) {
  const valor = Number(parcela.amount_cents);
  const quanto = Number(lancamento.amount_cents);
  if (lancamento.type !== 'expense') return null;
  if (quanto < valor * 0.8 || quanto > valor * 1.1) return null;
  const dias = Math.abs(diasEntre(parcela.due_on, lancamento.occurred_on));
  if (dias > JANELA_DIAS) return null;
  const diferenca = Math.abs(quanto - valor);
  // Valor pesa mais que data: o mesmo valor 5 dias depois é mais provável que
  // um valor parecido no dia certo.
  return { pontos: (diferenca === 0 ? 0 : 1000 + diferenca / 100) + dias, exato: diferenca === 0, dias };
}

export function ordenarCandidatos(parcela, lancamentos) {
  return lancamentos
    .map(l => ({ lancamento: l, nota: pontuarCandidato(parcela, l) }))
    .filter(item => item.nota)
    .sort((a, b) => a.nota.pontos - b.nota.pontos)
    .map(({ lancamento, nota }) => ({ ...lancamento, exato: nota.exato, dias: nota.dias }));
}

/* ---------- resumo do contrato (espelha resumoDoContrato da tela) ---------- */

export function resumir(principalCents, parcelas, hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })) {
  const pagas = parcelas.filter(p => p.paid_on);
  const soma = (lista, f) => lista.reduce((s, p) => s + Number(f(p) || 0), 0);
  const total = soma(parcelas, p => p.amount_cents);
  const previstoPagas = soma(pagas, p => p.amount_cents);
  const pagoDeFato = soma(pagas, p => p.paid_cents ?? p.amount_cents);
  const abertas = parcelas.filter(p => !p.paid_on);
  const proxima = abertas.sort((a, b) => String(a.due_on).localeCompare(String(b.due_on)))[0] || null;
  return {
    principal_cents: Number(principalCents),
    total_contratado_cents: total,
    juros_total_cents: Math.max(total - Number(principalCents), 0),
    juros_pagos_cents: soma(pagas, p => p.interest_cents),
    pago_cents: pagoDeFato,
    economia_cents: Math.max(previstoPagas - pagoDeFato, 0),
    parcelas_pagas: pagas.length,
    parcelas_total: parcelas.length,
    saldo_devedor_cents: soma(abertas, p => p.amount_cents),
    parcelas_atrasadas: abertas.filter(p => String(p.due_on) < hoje).length,
    proxima_parcela: proxima ? { number: proxima.number, due_on: proxima.due_on, amount_cents: Number(proxima.amount_cents) } : null
  };
}

/* ---------- rotas ---------- */

export function registrarEmprestimos(app, { query, transaction, requireAuth, allowRoles, contaGravavel, isUuid }) {
  const escrever = allowRoles('admin', 'adult');
  const ISO = col => `to_char(${col},'YYYY-MM-DD')`;
  const CAMPOS_PARCELA = `id, number, ${ISO('due_on')} due_on, amount_cents, interest_cents, amortization_cents,
    balance_after_cents, ${ISO('paid_on')} paid_on, paid_cents, payment_mode, transaction_id`;

  const numeros = linha => {
    for (const campo of ['amount_cents', 'interest_cents', 'amortization_cents', 'balance_after_cents', 'paid_cents', 'principal_cents', 'installment_cents']) {
      if (linha[campo] != null) linha[campo] = Number(linha[campo]);
    }
    if (linha.monthly_rate != null) linha.monthly_rate = Number(linha.monthly_rate);
    return linha;
  };

  async function contratoDaFamilia(req, id) {
    if (!isUuid(id)) return null;
    const achado = await query(`select l.*, ${ISO('l.first_due_on')} first_due_on, a.name conta_nome
      from loans l left join accounts a on a.id=l.account_id
      where l.id=$1 and l.family_id=$2`, [id, req.auth.familyId]);
    return achado.rows[0] ? numeros(achado.rows[0]) : null;
  }
  async function parcelasDo(contratoId, familyId) {
    const r = await query(`select ${CAMPOS_PARCELA} from loan_installments
      where loan_id=$1 and family_id=$2 order by number`, [contratoId, familyId]);
    return r.rows.map(numeros);
  }
  async function parcelaDo(req, contrato, numero) {
    const n = Number(numero);
    if (!Number.isInteger(n) || n < 1) return null;
    const r = await query(`select ${CAMPOS_PARCELA} from loan_installments
      where loan_id=$1 and family_id=$2 and number=$3`, [contrato.id, req.auth.familyId, n]);
    return r.rows[0] ? numeros(r.rows[0]) : null;
  }
  // Com todas as parcelas pagas o contrato se encerra sozinho; desfeita uma
  // baixa, volta a ativo. Cancelado é decisão da família e não muda aqui.
  async function atualizarSituacao(executar, contratoId) {
    await executar(`update loans set status = case
        when status='cancelled' then status
        when not exists (select 1 from loan_installments where loan_id=$1 and paid_on is null) then 'settled'
        else 'active' end, updated_at=now() where id=$1`, [contratoId]);
  }

  app.get('/loans', requireAuth, async (req, res) => {
    const contratos = await query(`select l.*, ${ISO('l.first_due_on')} first_due_on, a.name conta_nome
      from loans l left join accounts a on a.id=l.account_id
      where l.family_id=$1 order by (l.status='active') desc, l.created_at desc`, [req.auth.familyId]);
    const parcelas = await query(`select loan_id, number, ${ISO('due_on')} due_on, amount_cents, interest_cents, paid_on, paid_cents
      from loan_installments where family_id=$1`, [req.auth.familyId]);
    const porContrato = new Map();
    for (const p of parcelas.rows) {
      if (!porContrato.has(p.loan_id)) porContrato.set(p.loan_id, []);
      porContrato.get(p.loan_id).push(p);
    }
    res.json(contratos.rows.map(c => ({ ...numeros(c), resumo: resumir(c.principal_cents, porContrato.get(c.id) || []) })));
  });

  app.get('/loans/:id', requireAuth, async (req, res) => {
    const contrato = await contratoDaFamilia(req, req.params.id);
    if (!contrato) return res.status(404).json({ error: 'Empréstimo não encontrado' });
    const parcelas = await parcelasDo(contrato.id, req.auth.familyId);
    res.json({ ...contrato, parcelas, resumo: resumir(contrato.principal_cents, parcelas) });
  });

  app.post('/loans', requireAuth, escrever, async (req, res) => {
    const { erro, dados } = validarContrato(req.body);
    if (erro) return res.status(400).json({ error: erro });
    if (dados.accountId && (!isUuid(dados.accountId) || !await contaGravavel(req, dados.accountId))) {
      return res.status(404).json({ error: 'Conta não encontrada' });
    }
    const id = await transaction(async client => {
      const criado = await client.query(`insert into loans (family_id, created_by, name, lender, kind, principal_cents,
          installments_count, monthly_rate, installment_cents, first_due_on, account_id, category, notes)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
        [req.auth.familyId, req.auth.sub, dados.name, dados.lender, dados.kind, dados.principalCents,
          dados.installments.length, dados.monthlyRate, dados.installmentCents, dados.firstDueOn,
          dados.accountId, dados.category, dados.notes]);
      const contratoId = criado.rows[0].id;
      for (const p of dados.installments) {
        const jaPaga = p.number <= dados.alreadyPaid;
        await client.query(`insert into loan_installments (family_id, loan_id, number, due_on, amount_cents,
            interest_cents, amortization_cents, balance_after_cents, paid_on, paid_cents, payment_mode, paid_by)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [req.auth.familyId, contratoId, p.number, p.dueOn, p.amountCents, p.interestCents, p.amortizationCents,
            p.balanceAfterCents, jaPaga ? p.dueOn : null, jaPaga ? p.amountCents : null, jaPaga ? 'marked' : null,
            jaPaga ? req.auth.sub : null]);
      }
      await atualizarSituacao((sql, params) => client.query(sql, params), contratoId);
      return contratoId;
    });
    res.status(201).json({ id });
  });

  app.patch('/loans/:id', requireAuth, escrever, async (req, res) => {
    const contrato = await contratoDaFamilia(req, req.params.id);
    if (!contrato) return res.status(404).json({ error: 'Empréstimo não encontrado' });
    const corpo = req.body || {};
    const nome = corpo.name === undefined ? contrato.name : texto(corpo.name, 80);
    if (!nome || nome.length < 2) return res.status(400).json({ error: 'Dê um nome ao empréstimo.' });
    const tipo = corpo.kind === undefined ? contrato.kind : corpo.kind;
    if (!TIPOS.includes(tipo)) return res.status(400).json({ error: 'Tipo de empréstimo inválido.' });
    let conta = corpo.accountId === undefined ? contrato.account_id : (corpo.accountId || null);
    if (conta && conta !== contrato.account_id && (!isUuid(conta) || !await contaGravavel(req, conta))) {
      return res.status(404).json({ error: 'Conta não encontrada' });
    }
    let situacao = contrato.status;
    if (corpo.status !== undefined) {
      if (!['active', 'cancelled'].includes(corpo.status)) return res.status(400).json({ error: 'Situação inválida.' });
      situacao = corpo.status;
    }
    await query(`update loans set name=$1, lender=$2, kind=$3, account_id=$4, category=$5, notes=$6, status=$7, updated_at=now()
      where id=$8 and family_id=$9`,
      [nome, corpo.lender === undefined ? contrato.lender : texto(corpo.lender, 80), tipo, conta,
        corpo.category === undefined ? contrato.category : (texto(corpo.category, 40) || 'Empréstimos'),
        corpo.notes === undefined ? contrato.notes : texto(corpo.notes, 400), situacao, contrato.id, req.auth.familyId]);
    if (situacao === 'active') await atualizarSituacao(query, contrato.id);
    res.json({ id: contrato.id });
  });

  // Apagar só vale para contrato cadastrado por engano: com parcela paga por
  // lançamento, apagar faria sumir o vínculo com o dinheiro que saiu.
  app.delete('/loans/:id', requireAuth, escrever, async (req, res) => {
    const contrato = await contratoDaFamilia(req, req.params.id);
    if (!contrato) return res.status(404).json({ error: 'Empréstimo não encontrado' });
    const pagas = await query(`select count(*)::int n from loan_installments
      where loan_id=$1 and payment_mode in ('linked','created')`, [contrato.id]);
    if (pagas.rows[0].n > 0) {
      return res.status(409).json({ error: 'Este empréstimo tem parcelas pagas com lançamento. Desfaça as baixas ou marque-o como cancelado.' });
    }
    await query('delete from loans where id=$1 and family_id=$2', [contrato.id, req.auth.familyId]);
    res.json({ apagado: 1 });
  });

  // Corrigir uma parcela que o contrato traz diferente do cálculo.
  app.patch('/loans/:id/installments/:number', requireAuth, escrever, async (req, res) => {
    const contrato = await contratoDaFamilia(req, req.params.id);
    if (!contrato) return res.status(404).json({ error: 'Empréstimo não encontrado' });
    const parcela = await parcelaDo(req, contrato, req.params.number);
    if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada' });
    if (parcela.paid_on) return res.status(409).json({ error: 'Parcela paga não pode ser alterada. Desfaça a baixa antes.' });
    const corpo = req.body || {};
    const vence = corpo.dueOn === undefined ? parcela.due_on : corpo.dueOn;
    if (!dataValida(vence)) return res.status(400).json({ error: 'Data de vencimento inválida.' });
    const valor = corpo.amountCents === undefined ? parcela.amount_cents : corpo.amountCents;
    if (!(Number.isInteger(valor) && valor > 0 && valor <= MAX_CENTAVOS)) return res.status(400).json({ error: 'Valor da parcela inválido.' });
    const juros = Math.min(parcela.interest_cents, valor);
    await query(`update loan_installments set due_on=$1, amount_cents=$2, interest_cents=$3, amortization_cents=$4
      where id=$5 and family_id=$6`, [vence, valor, juros, valor - juros, parcela.id, req.auth.familyId]);
    res.json({ number: parcela.number });
  });

  // Lançamentos que parecem ser o pagamento desta parcela.
  app.get('/loans/:id/installments/:number/candidates', requireAuth, async (req, res) => {
    const contrato = await contratoDaFamilia(req, req.params.id);
    if (!contrato) return res.status(404).json({ error: 'Empréstimo não encontrado' });
    const parcela = await parcelaDo(req, contrato, req.params.number);
    if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada' });
    const podeVerTudo = req.auth.role === 'admin';
    const r = await query(`select t.id, t.type, t.description, t.amount_cents, ${ISO('t.occurred_on')} occurred_on,
        t.account_id, a.name conta_nome
      from transactions t join accounts a on a.id=t.account_id
      where t.family_id=$1 and t.type='expense'
        and t.occurred_on between ($2::date - $3::int) and ($2::date + $3::int)
        and t.amount_cents between $4 and $5
        and (a.owner_user_id=$6 or ($7::boolean=true and a.is_private=false))
        and not exists (select 1 from loan_installments li where li.transaction_id=t.id)
        and not exists (select 1 from scheduled_bill_payments sp where sp.transaction_id=t.id)
      limit 50`,
      [req.auth.familyId, parcela.due_on, JANELA_DIAS, Math.floor(parcela.amount_cents * 0.8),
        Math.ceil(parcela.amount_cents * 1.1), req.auth.sub, podeVerTudo]);
    res.json(ordenarCandidatos(parcela, r.rows.map(l => ({ ...l, amount_cents: Number(l.amount_cents) }))).slice(0, 5));
  });

  // Dar baixa: vincular a um lançamento, criar um, ou só marcar.
  app.post('/loans/:id/installments/:number/pay', requireAuth, escrever, async (req, res) => {
    const contrato = await contratoDaFamilia(req, req.params.id);
    if (!contrato) return res.status(404).json({ error: 'Empréstimo não encontrado' });
    const parcela = await parcelaDo(req, contrato, req.params.number);
    if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada' });
    if (parcela.paid_on) return res.status(409).json({ error: 'Esta parcela já foi paga' });
    const corpo = req.body || {};
    const modo = corpo.mode;

    if (modo === 'link') {
      if (!isUuid(corpo.transactionId)) return res.status(400).json({ error: 'Escolha o lançamento do pagamento' });
      const achado = await query(`select t.id, t.type, t.amount_cents, ${ISO('t.occurred_on')} occurred_on, t.account_id
        from transactions t where t.id=$1 and t.family_id=$2`, [corpo.transactionId, req.auth.familyId]);
      const lancamento = achado.rows[0];
      if (!lancamento || !await contaGravavel(req, lancamento.account_id)) return res.status(404).json({ error: 'Lançamento não encontrado' });
      if (lancamento.type !== 'expense') return res.status(400).json({ error: 'Só uma saída pode pagar a parcela' });
      const usado = await query(`select 1 from loan_installments where transaction_id=$1
        union all select 1 from scheduled_bill_payments where transaction_id=$1`, [lancamento.id]);
      if (usado.rows.length) return res.status(409).json({ error: 'Este lançamento já paga outra conta ou parcela' });
      await transaction(async client => {
        await client.query(`update loan_installments set paid_on=$1, paid_cents=$2, payment_mode='linked',
            transaction_id=$3, paid_by=$4 where id=$5`,
          [lancamento.occurred_on, Number(lancamento.amount_cents), lancamento.id, req.auth.sub, parcela.id]);
        // O débito do extrato costuma vir sem categoria: ganha a do contrato.
        await client.query(`update transactions set category=$1 where id=$2 and family_id=$3 and category is null`,
          [contrato.category, lancamento.id, req.auth.familyId]);
        await atualizarSituacao((sql, params) => client.query(sql, params), contrato.id);
      });
      return res.status(201).json({ mode: 'linked', transactionId: lancamento.id });
    }

    const pagoEm = corpo.paidOn || parcela.due_on;
    if (!dataValida(pagoEm)) return res.status(400).json({ error: 'Data do pagamento inválida' });
    const valor = corpo.paidCents == null ? parcela.amount_cents : corpo.paidCents;
    if (!(Number.isInteger(valor) && valor > 0 && valor <= MAX_CENTAVOS)) return res.status(400).json({ error: 'Valor pago inválido' });

    if (modo === 'mark') {
      await transaction(async client => {
        await client.query(`update loan_installments set paid_on=$1, paid_cents=$2, payment_mode='marked', paid_by=$3 where id=$4`,
          [pagoEm, valor, req.auth.sub, parcela.id]);
        await atualizarSituacao((sql, params) => client.query(sql, params), contrato.id);
      });
      return res.status(201).json({ mode: 'marked' });
    }

    if (modo !== 'create') return res.status(400).json({ error: 'Forma de baixa inválida' });
    const contaId = corpo.accountId || contrato.account_id;
    if (!contaId) return res.status(400).json({ error: 'Escolha a conta de onde sai o dinheiro' });
    if (!isUuid(contaId) || !await contaGravavel(req, contaId)) return res.status(404).json({ error: 'Conta não encontrada' });
    const descricao = `Parcela ${parcela.number}/${contrato.installments_count} — ${contrato.name}`.slice(0, 140);
    const lancamentoId = await transaction(async client => {
      const criado = await client.query(`insert into transactions (family_id, account_id, created_by, type, description,
          amount_cents, occurred_on, category, supplier)
        values ($1,$2,$3,'expense',$4,$5,$6,$7,$8) returning id`,
        [req.auth.familyId, contaId, req.auth.sub, descricao, valor, pagoEm, contrato.category, contrato.lender]);
      const novo = criado.rows[0].id;
      await client.query('update accounts set balance_cents=balance_cents-$1 where id=$2 and family_id=$3',
        [valor, contaId, req.auth.familyId]);
      await client.query(`update loan_installments set paid_on=$1, paid_cents=$2, payment_mode='created',
          transaction_id=$3, paid_by=$4 where id=$5`, [pagoEm, valor, novo, req.auth.sub, parcela.id]);
      await atualizarSituacao((sql, params) => client.query(sql, params), contrato.id);
      return novo;
    });
    res.status(201).json({ mode: 'created', transactionId: lancamentoId, accountId: contaId, amountCents: valor });
  });

  // Desfazer a baixa. O lançamento só é apagado se foi o GFP que o criou;
  // o que veio do extrato continua lá, apenas sem o vínculo.
  app.delete('/loans/:id/installments/:number/pay', requireAuth, escrever, async (req, res) => {
    const contrato = await contratoDaFamilia(req, req.params.id);
    if (!contrato) return res.status(404).json({ error: 'Empréstimo não encontrado' });
    const parcela = await parcelaDo(req, contrato, req.params.number);
    if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada' });
    if (!parcela.paid_on) return res.status(404).json({ error: 'Esta parcela não está paga' });
    let apagouLancamento = false;
    await transaction(async client => {
      if (parcela.payment_mode === 'created' && parcela.transaction_id) {
        const lanc = await client.query('select account_id, amount_cents from transactions where id=$1 and family_id=$2',
          [parcela.transaction_id, req.auth.familyId]);
        if (lanc.rows[0]) {
          await client.query('update accounts set balance_cents=balance_cents+$1 where id=$2 and family_id=$3',
            [Number(lanc.rows[0].amount_cents), lanc.rows[0].account_id, req.auth.familyId]);
          await client.query('delete from transactions where id=$1 and family_id=$2', [parcela.transaction_id, req.auth.familyId]);
          apagouLancamento = true;
        }
      }
      await client.query(`update loan_installments set paid_on=null, paid_cents=null, payment_mode=null,
          transaction_id=null, paid_by=null where id=$1`, [parcela.id]);
      await atualizarSituacao((sql, params) => client.query(sql, params), contrato.id);
    });
    res.json({ desfeito: 1, lancamentoApagado: apagouLancamento });
  });
}

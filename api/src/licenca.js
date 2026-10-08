/* Licença do GFP — o que a conta pode fazer, a partir da assinatura gravada.

   Regras (as mesmas dos Termos de Uso):
   - conta de cortesia: liberada sem prazo;
   - teste grátis: 14 dias com tudo liberado; depois, só consulta;
   - assinatura em dia: tudo liberado;
   - cobrança em atraso: tudo liberado por 10 dias, com aviso; depois, só consulta;
   - assinatura cancelada: tudo liberado até o fim do período já pago; depois, só consulta.

   "Só consulta" quer dizer: a pessoa entra, vê e exporta os dados, mas não
   inclui, altera nem apaga nada até contratar. Os dados nunca são apagados
   por falta de pagamento.

   Tudo aqui é função pura — sem banco e sem relógio próprio — para os testes
   cobrirem cada caso com a data que quiserem. */

export const DIAS_DE_TESTE = 14;
export const DIAS_DE_TOLERANCIA = 10;
export const DIAS_DE_ARREPENDIMENTO = 7;

export const PLANOS = {
  mensal: { id: 'mensal', nome: 'Mensal', preco_cents: 990, ciclo: 'monthly', ciclo_asaas: 'MONTHLY', formas: ['cartao'], forma_asaas: 'CREDIT_CARD' },
  // No anual a pessoa escolhe a forma na fatura: cartão, Pix ou boleto.
  anual: { id: 'anual', nome: 'Anual', preco_cents: 6990, ciclo: 'yearly', ciclo_asaas: 'YEARLY', formas: ['cartao', 'pix', 'boleto'], forma_asaas: 'UNDEFINED' }
};

const DIA = 86400000;
const comoData = valor => (valor instanceof Date ? valor : new Date(valor));
const soDia = data => comoData(data).toISOString().slice(0, 10);

/* Fim do período pago por uma cobrança: o vencimento mais um mês ou um ano.
   Dia 31 num mês de 30 cai no último dia do mês, não no mês seguinte. */
export function fimDoPeriodo(vencimentoIso, ciclo) {
  const [ano, mes, dia] = String(vencimentoIso).slice(0, 10).split('-').map(Number);
  const alvoAno = ciclo === 'yearly' ? ano + 1 : (mes === 12 ? ano + 1 : ano);
  const alvoMes = ciclo === 'yearly' ? mes : (mes === 12 ? 1 : mes + 1);
  const ultimoDia = new Date(Date.UTC(alvoAno, alvoMes, 0)).getUTCDate();
  // até o fim do dia em Brasília (UTC-3)
  return new Date(Date.UTC(alvoAno, alvoMes - 1, Math.min(dia, ultimoDia), 23 + 3, 59, 59));
}

/* A situação da conta. `assinatura` é a linha de subscriptions (ou null). */
export function situacaoDaLicenca(assinatura, agora = new Date()) {
  const base = { plano: null, ate: null, dias_restantes: null, proxima_cobranca: null, pode_desistir: false, aguardando_pagamento: false };
  // Sem registro é falha nossa, não do cliente: não trava ninguém por isso.
  if (!assinatura) return { ...base, situacao: 'cortesia', acesso: 'total' };
  const s = assinatura;
  const fim = s.current_period_end ? comoData(s.current_period_end) : null;
  const diasAte = data => Math.max(Math.ceil((data.getTime() - agora.getTime()) / DIA), 0);
  const comum = {
    ...base,
    plano: s.plan_name || null,
    ate: fim ? fim.toISOString() : null,
    proxima_cobranca: s.next_due_on ? soDia(s.next_due_on) : null,
    aguardando_pagamento: Boolean(s.pending_plan && s.external_subscription_id && s.status !== 'active' && s.status !== 'past_due'),
    plano_pendente: s.pending_plan || null
  };

  if (s.exempt) return { ...comum, situacao: 'cortesia', acesso: 'total', plano: null, ate: null };

  if (s.status === 'trial') {
    if (fim && agora <= fim) return { ...comum, situacao: 'teste', acesso: 'total', plano: null, dias_restantes: diasAte(fim) };
    return { ...comum, situacao: 'teste_encerrado', acesso: 'consulta', plano: null };
  }

  const contratado = s.contracted_at ? comoData(s.contracted_at) : null;
  const podeDesistir = Boolean(contratado && agora.getTime() - contratado.getTime() <= DIAS_DE_ARREPENDIMENTO * DIA);

  if (s.status === 'active') {
    // Se o aviso de atraso do Asaas não chegou, o prazo pago mais a tolerância ainda protege.
    if (fim && agora.getTime() > fim.getTime() + DIAS_DE_TOLERANCIA * DIA) return { ...comum, situacao: 'suspensa', acesso: 'consulta' };
    return { ...comum, situacao: 'ativa', acesso: 'total', pode_desistir: podeDesistir };
  }

  if (s.status === 'past_due') {
    const desde = s.overdue_since ? comoData(`${soDia(s.overdue_since)}T03:00:00Z`) : fim || agora;
    const limite = new Date(desde.getTime() + DIAS_DE_TOLERANCIA * DIA);
    if (agora <= limite) return { ...comum, situacao: 'atrasada', acesso: 'total', dias_restantes: diasAte(limite), ate: limite.toISOString() };
    return { ...comum, situacao: 'suspensa', acesso: 'consulta', ate: limite.toISOString() };
  }

  if (s.status === 'cancelled') {
    if (fim && agora <= fim) return { ...comum, situacao: 'cancelada', acesso: 'total', dias_restantes: diasAte(fim), proxima_cobranca: null };
    return { ...comum, situacao: 'encerrada', acesso: 'consulta', proxima_cobranca: null };
  }

  return { ...comum, situacao: 'encerrada', acesso: 'consulta', proxima_cobranca: null };
}

/* CPF ou CNPJ com os dígitos verificadores certos. O Asaas exige o documento
   para emitir a cobrança; conferir aqui evita criar cliente com número torto. */
export function documentoValido(valor) {
  const d = String(valor ?? '').replace(/\D/g, '');
  if (/^(\d)\1+$/.test(d)) return false;
  const digito = (base, pesos) => {
    const resto = base.split('').reduce((soma, n, i) => soma + Number(n) * pesos[i], 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  if (d.length === 11) {
    const d1 = digito(d.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = digito(d.slice(0, 9) + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return d.endsWith(`${d1}${d2}`);
  }
  if (d.length === 14) {
    const d1 = digito(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = digito(d.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return d.endsWith(`${d1}${d2}`);
  }
  return false;
}

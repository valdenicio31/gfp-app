/* Matemática dos empréstimos do GFP.

   Serve para consignado, pessoal, CDC — qualquer contrato de parcela fixa, que
   é como o mercado brasileiro trabalha (Tabela Price). O cadastro pede valor,
   número de parcelas, a taxa OU o valor da parcela, e a data da primeira: com
   isso o cronograma inteiro é gerado, e cada parcela pode ser corrigida depois
   se o contrato trouxer algum valor diferente.

   Tudo em centavos inteiros. Dinheiro em ponto flutuante acumula erro, e num
   cronograma de 60 parcelas o erro aparece no total. */

const CENTAVOS = valor => Math.round(Number(valor) || 0);

/* ---------- taxa e parcela: um determina o outro ---------- */

// Price: parcela fixa que amortiza PV em n vezes à taxa i por período.
function parcelaPrice(principalCents, parcelas, taxaMensal) {
  const pv = CENTAVOS(principalCents), n = Math.trunc(parcelas), i = Number(taxaMensal);
  if (!(pv > 0) || !(n > 0)) return null;
  if (!i) return Math.round(pv / n);                       // sem juros: divide igual
  return Math.round(pv * i / (1 - Math.pow(1 + i, -n)));
}

// O caminho inverso não tem fórmula fechada: acha-se a taxa por aproximação.
// A parcela cresce junto com a taxa, então bisseção resolve com segurança.
function taxaPelaParcela(principalCents, parcelas, parcelaCents) {
  const pv = CENTAVOS(principalCents), n = Math.trunc(parcelas), pmt = CENTAVOS(parcelaCents);
  if (!(pv > 0) || !(n > 0) || !(pmt > 0)) return null;
  if (pmt * n <= pv) return 0;                             // não há juros a achar
  let baixa = 0, alta = 2;                                 // 0% a 200% ao mês cobre qualquer contrato
  for (let passo = 0; passo < 200; passo += 1) {
    const meio = (baixa + alta) / 2;
    if (parcelaPrice(pv, n, meio) < pmt) baixa = meio; else alta = meio;
  }
  return (baixa + alta) / 2;
}

/* ---------- datas ---------- */

// Mesma data todo mês. Em mês curto, cai no último dia — 31/01 vira 28/02,
// que é o que o banco faz, e não 03/03.
function mesesDepois(dataIso, meses) {
  const [ano, mes, dia] = String(dataIso).split('-').map(Number);
  const alvo = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

/* ---------- cronograma ---------- */

/** Gera as parcelas do contrato.
 *  Informe taxaMensal OU parcelaCents — o que faltar é deduzido do outro. */
function gerarParcelas({ principalCents, parcelas, taxaMensal, parcelaCents, primeiraEm }) {
  const pv = CENTAVOS(principalCents), n = Math.trunc(parcelas);
  if (!(pv > 0) || !(n > 0) || !primeiraEm) return { erro: 'Informe o valor, o número de parcelas e a data da primeira.' };

  let taxa = Number(taxaMensal);
  let pmt = CENTAVOS(parcelaCents);
  if (!pmt && !(taxa >= 0)) return { erro: 'Informe a taxa ou o valor da parcela.' };
  if (!pmt) pmt = parcelaPrice(pv, n, taxa);
  else if (!(taxa >= 0)) taxa = taxaPelaParcela(pv, n, pmt);

  const lista = [];
  let saldo = pv;
  for (let k = 1; k <= n; k += 1) {
    const juros = Math.round(saldo * taxa);
    // A última parcela zera o saldo: os arredondamentos de todas as outras
    // sobram nela, que é como o banco fecha o contrato.
    const ehUltima = k === n;
    const valor = ehUltima ? saldo + juros : pmt;
    const amortizacao = valor - juros;
    saldo -= amortizacao;
    lista.push({
      numero: k,
      vence_em: mesesDepois(primeiraEm, k - 1),
      valor_cents: valor,
      juros_cents: juros,
      amortizacao_cents: amortizacao,
      saldo_depois_cents: Math.max(saldo, 0),
      paga: false,
      paga_em: null,
      pago_cents: null
    });
  }
  return { taxaMensal: taxa, parcelaCents: pmt, parcelas: lista };
}

/* ---------- o que o contrato custou ---------- */

/** O que uma parcela paga custou de verdade.
 *
 *  Antecipou e o banco deu desconto: o desconto é juro que deixou de ser
 *  cobrado — sai dos juros pagos e entra na economia. Pagou a mais (atraso
 *  com multa): o excesso entra como juro pago. Parcela em aberto devolve zeros.
 */
function custoDaParcela(parcela) {
  if (!parcela || !parcela.paga) return { pago_cents: 0, juros_pagos_cents: 0, economia_cents: 0 };
  const valor = CENTAVOS(parcela.valor_cents);
  const pago = CENTAVOS(parcela.pago_cents ?? parcela.valor_cents);
  const juros = CENTAVOS(parcela.juros_cents);
  return {
    pago_cents: pago,
    juros_pagos_cents: Math.min(Math.max(juros + (pago - valor), 0), pago),
    economia_cents: Math.max(valor - pago, 0)
  };
}

/** Resumo de um contrato a partir das suas parcelas.
 *
 *  juros_total_cents      o que o contrato cobra de juros do começo ao fim
 *  juros_pagos_cents      juros já efetivamente pagos (descontado o que a antecipação poupou)
 *  juros_a_pagar_cents    juros das parcelas que ainda estão em aberto
 *  economia_cents         o que deixou de ser pago ao antecipar parcelas
 *  parcelas_pagas / parcelas_a_pagar   quantas já foram e quantas faltam
 *  saldo_devedor_cents    quanto falta amortizar
 */
function resumoDoContrato(principalCents, listaParcelas) {
  const pv = CENTAVOS(principalCents);
  const parcelas = Array.isArray(listaParcelas) ? listaParcelas : [];
  const total = parcelas.reduce((soma, p) => soma + CENTAVOS(p.valor_cents), 0);
  const pagas = parcelas.filter(p => p.paga);
  const abertas = parcelas.filter(p => !p.paga);
  const custo = campo => pagas.reduce((soma, p) => soma + custoDaParcela(p)[campo], 0);

  return {
    principal_cents: pv,
    total_contratado_cents: total,
    juros_total_cents: Math.max(total - pv, 0),
    juros_pagos_cents: custo('juros_pagos_cents'),
    juros_a_pagar_cents: abertas.reduce((soma, p) => soma + CENTAVOS(p.juros_cents), 0),
    pago_cents: custo('pago_cents'),
    economia_cents: custo('economia_cents'),
    parcelas_pagas: pagas.length,
    parcelas_a_pagar: abertas.length,
    parcelas_total: parcelas.length,
    saldo_devedor_cents: abertas.reduce((soma, p) => soma + CENTAVOS(p.valor_cents), 0)
  };
}

const GFPEmprestimos = {
  parcelaPrice, taxaPelaParcela, mesesDepois, gerarParcelas, custoDaParcela, resumoDoContrato
};
if (typeof window !== 'undefined') window.GFPEmprestimos = GFPEmprestimos;
if (typeof module !== 'undefined' && module.exports) module.exports = GFPEmprestimos;

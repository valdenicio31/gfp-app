/* Painéis da Central que não dependem do mês aberto.

   - O recorte por banco e conta: a Central pode mostrar tudo consolidado, um
     banco inteiro ou uma conta só. O recorte vale para o que nasce dos
     lançamentos (saldo, receitas, despesas, gráficos e transferências);
     agenda, metas, orçamento e cartões continuam sendo da conta inteira.
   - Os painéis de Receitas e de Despesas: por tipo e por mês, sempre no ano
     corrente, e o total de cada um dos últimos cinco anos.

   Como emprestimos.js, este arquivo não depende de biblioteca nenhuma: recebe
   de server.js a função de consulta, e por isso roda nos testes. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SEM_BANCO = 'none';

/* Lê account_id e bank_id da URL. bank_id=none pede as contas sem banco
   (dinheiro em espécie, por exemplo). Valor torto devolve erro, para a tela
   avisar em vez de mostrar o consolidado como se fosse o recorte pedido. */
export function recortePedido(consulta = {}) {
  const conta = String(consulta.account_id ?? '').trim();
  const banco = String(consulta.bank_id ?? '').trim();
  if (conta && !UUID.test(conta)) return { erro: 'Conta inválida no filtro' };
  if (banco && banco !== SEM_BANCO && !UUID.test(banco)) return { erro: 'Banco inválido no filtro' };
  return {
    accountId: conta || null,
    bankId: banco && banco !== SEM_BANCO ? banco : null,
    semBanco: banco === SEM_BANCO,
    ativo: Boolean(conta || banco)
  };
}

/* Trecho de WHERE do recorte. Usa três parâmetros seguidos a partir de $n:
   conta, banco e "só contas sem banco". Nulos não filtram nada. */
export function sqlDoRecorte(n, alias = 'a') {
  return ` and ($${n}::uuid is null or ${alias}.id=$${n}::uuid)`
    + ` and ($${n + 1}::uuid is null or ${alias}.bank_id=$${n + 1}::uuid)`
    + ` and ($${n + 2}::boolean=false or ${alias}.bank_id is null)`;
}
export const parametrosDoRecorte = recorte => [recorte.accountId, recorte.bankId, recorte.semBanco];

export function contaNoRecorte(conta, recorte) {
  if (recorte.accountId && conta.id !== recorte.accountId) return false;
  if (recorte.bankId && conta.bank_id !== recorte.bankId) return false;
  if (recorte.semBanco && conta.bank_id) return false;
  return true;
}

/* O banco só devolve os meses e anos que têm movimento: completo os vazios
   para a barra de cada mês ficar sempre no mesmo lugar. */
export function completarMeses(ano, linhas) {
  const porMes = new Map(linhas.map(l => [Number(l.mes), l]));
  const meses = [];
  for (let mes = 1; mes <= 12; mes += 1) {
    const linha = porMes.get(mes);
    meses.push({
      ano, mes, ym: `${ano}-${String(mes).padStart(2, '0')}`,
      receitas_cents: Number(linha?.receitas_cents || 0),
      despesas_cents: Number(linha?.despesas_cents || 0)
    });
  }
  return meses;
}

export function completarAnos(anoFinal, linhas, quantos = 5) {
  const porAno = new Map(linhas.map(l => [Number(l.ano), l]));
  const anos = [];
  for (let ano = anoFinal - quantos + 1; ano <= anoFinal; ano += 1) {
    const linha = porAno.get(ano);
    anos.push({
      ano,
      receitas_cents: Number(linha?.receitas_cents || 0),
      despesas_cents: Number(linha?.despesas_cents || 0)
    });
  }
  return anos;
}

export const anoCorrente = () => Number(new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 4));

/* Receitas e despesas do ano corrente (por tipo e por mês) e dos últimos cinco
   anos. Transferência entre contas não é uma coisa nem outra e fica de fora. */
export async function painelDoAno({ query, familia, quem, ehAdmin, recorte, ano = anoCorrente() }) {
  const visivel = '(a.owner_user_id=$2 or ($3::boolean=true and a.is_private=false))';
  const base = [familia, quem, ehAdmin];
  const doRecorte = parametrosDoRecorte(recorte);
  const inicio = `${ano}-01-01`, fim = `${ano}-12-31`;
  const primeiroAno = ano - 4;

  const [porTipo, porMes, porAno] = await Promise.all([
    /* Sem categoria vira "Outros", como no painel do mês. */
    query(`select coalesce(nullif(trim(t.category),''),'Outros') category, t.type,
        sum(t.amount_cents)::bigint total_cents, count(*)::int quantos
      from transactions t join accounts a on a.id=t.account_id
      where t.family_id=$1 and ${visivel} and t.type in ('income','expense')
        and t.occurred_on between $4 and $5${sqlDoRecorte(6)}
      group by 1,2 order by 3 desc`, [...base, inicio, fim, ...doRecorte]),
    query(`select extract(month from t.occurred_on)::int mes,
        coalesce(sum(case when t.type='income' then t.amount_cents end),0)::bigint receitas_cents,
        coalesce(sum(case when t.type='expense' then t.amount_cents end),0)::bigint despesas_cents,
        count(*) filter (where t.type='income')::int receitas_quantos,
        count(*) filter (where t.type='expense')::int despesas_quantos
      from transactions t join accounts a on a.id=t.account_id
      where t.family_id=$1 and ${visivel} and t.occurred_on between $4 and $5${sqlDoRecorte(6)}
      group by 1 order by 1`, [...base, inicio, fim, ...doRecorte]),
    query(`select extract(year from t.occurred_on)::int ano,
        coalesce(sum(case when t.type='income' then t.amount_cents end),0)::bigint receitas_cents,
        coalesce(sum(case when t.type='expense' then t.amount_cents end),0)::bigint despesas_cents
      from transactions t join accounts a on a.id=t.account_id
      where t.family_id=$1 and ${visivel} and t.occurred_on between $4 and $5${sqlDoRecorte(6)}
      group by 1 order by 1`, [...base, `${primeiroAno}-01-01`, fim, ...doRecorte])
  ]);

  const tipos = tipo => porTipo.rows.filter(l => l.type === tipo)
    .map(l => ({ category: l.category, total_cents: Number(l.total_cents), quantos: Number(l.quantos) }));
  const meses = completarMeses(ano, porMes.rows);
  const soma = campo => meses.reduce((total, m) => total + m[campo], 0);
  const quantos = campo => porMes.rows.reduce((total, l) => total + Number(l[campo] || 0), 0);

  return {
    ano,
    meses,
    receitas: { total_cents: soma('receitas_cents'), quantos: quantos('receitas_quantos'), por_tipo: tipos('income') },
    despesas: { total_cents: soma('despesas_cents'), quantos: quantos('despesas_quantos'), por_tipo: tipos('expense') },
    ultimos_anos: completarAnos(ano, porAno.rows, 5)
  };
}

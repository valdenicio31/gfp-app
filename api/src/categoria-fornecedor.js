/* Categoria que acompanha o fornecedor ou cliente.

   Quando a pessoa define a categoria de um lançamento que tem fornecedor (ou
   cliente), ela está dizendo como classifica aquele parceiro — não só aquele
   lançamento. Então a categoria vai para TODOS os outros lançamentos do mesmo
   parceiro, inclusive os que tinham outra, e fica gravada no cadastro dele
   para as próximas importações já chegarem classificadas.

   O nome é comparado sem diferenciar maiúsculas nem espaços nas pontas.
   Transferências entre contas ficam de fora: não são receita nem despesa.
   Só entram lançamentos das contas que quem pediu pode alterar.

   `executar(sql, params)` é o query do banco ou o client de uma transação. */

export const deveReplicar = (antes, depois) => {
  const limpo = valor => String(valor ?? '').trim();
  const categoria = limpo(depois.category), parceiro = limpo(depois.supplier);
  if (!categoria || !parceiro) return false;
  if (!antes) return true;                                   // lançamento novo
  return limpo(antes.category) !== categoria || limpo(antes.supplier).toLowerCase() !== parceiro.toLowerCase();
};

export async function replicarCategoriaDoFornecedor(executar, { familyId, userId, isAdmin, supplier, category, type, exceto }) {
  const parceiro = String(supplier ?? '').trim();
  const categoria = String(category ?? '').trim();
  if (!parceiro || !categoria) return 0;

  const alterados = await executar(`update transactions t set category=$1
    from accounts a
    where a.id=t.account_id and t.family_id=$2
      and lower(btrim(t.supplier))=lower($3)
      and t.type<>'transfer'
      and t.category is distinct from $1
      and ($4::uuid is null or t.id<>$4::uuid)
      and (a.owner_user_id=$5 or ($6::boolean=true and a.is_private=false))
    returning t.id`,
    [categoria, familyId, parceiro, exceto || null, userId, isAdmin === true]);

  // O cadastro guarda a categoria: é dele que a importação tira a classificação.
  const cadastro = await executar(`update partners set category=$1
    where family_id=$2 and lower(btrim(name))=lower($3) returning id`, [categoria, familyId, parceiro]);
  if (!cadastro.rows.length) {
    await executar(`insert into partners (family_id, name, kind, category) values ($1,$2,$3,$4)
      on conflict (family_id, name) do update set category=excluded.category`,
      [familyId, parceiro.slice(0, 120), type === 'income' ? 'client' : 'supplier', categoria]);
  }
  return alterados.rows.length;
}

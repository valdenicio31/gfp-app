/* Painel do dono — a gestão dos clientes do GFP.

   Mostra as contas e as assinaturas: quem está em teste, quem paga em dia,
   quem atrasou. Não mostra — e nenhuma consulta daqui lê — lançamentos,
   saldos, contas bancárias ou qualquer dado financeiro do cliente. O dono vê
   o cliente como assinante, nunca as finanças dele.

   O acesso é só para os e-mails da lista de donos, e só quando o e-mail da
   conta foi confirmado. As ações (cortesia, prorrogar teste) ficam
   registradas na auditoria com quem fez.

   Sem biblioteca, como os outros módulos: roda nos testes. */

import { situacaoDaLicenca, PLANOS, DIAS_DE_TESTE } from './licenca.js';

const DONOS_PADRAO = ['valdenicio31@gmail.com', 'contato@viaiasolucoes.com'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = 86400000;

export function emailsDosDonos(env = process.env) {
  const lista = String(env.OWNER_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return lista.length ? lista : DONOS_PADRAO;
}

export async function ehDono(query, userId, env = process.env) {
  const r = await query('select email, email_verified_at from users where id=$1', [userId]);
  const usuario = r.rows[0];
  return Boolean(usuario && usuario.email_verified_at && emailsDosDonos(env).includes(String(usuario.email).toLowerCase()));
}

/* Quanto cada conta rende por mês: o anual entra como um doze avos. */
const receitaMensal = plano => (plano === 'anual' ? Math.round(PLANOS.anual.preco_cents / 12) : plano === 'mensal' ? PLANOS.mensal.preco_cents : 0);

export function resumirContas(contas) {
  const porSituacao = {};
  for (const c of contas) porSituacao[c.situacao] = (porSituacao[c.situacao] || 0) + 1;
  const pagantes = contas.filter(c => ['ativa', 'atrasada'].includes(c.situacao));
  return {
    total: contas.length,
    por_situacao: porSituacao,
    adimplentes: contas.filter(c => c.situacao === 'ativa').length,
    inadimplentes: contas.filter(c => ['atrasada', 'suspensa'].includes(c.situacao)).length,
    em_teste: porSituacao.teste || 0,
    testes_vencendo: contas.filter(c => c.situacao === 'teste' && c.dias_restantes <= 5).length,
    receita_mensal_cents: pagantes.reduce((t, c) => t + receitaMensal(c.plano), 0)
  };
}

async function listarContas(query, agora) {
  /* Uma linha por conta, com o titular. Só dados de cadastro e de assinatura. */
  const r = await query(`select f.id, f.name conta, f.created_at,
      u.name titular, u.email,
      s.status, s.exempt, s.current_period_end, s.contracted_at, s.cancelled_at, s.pending_plan, s.external_subscription_id,
      to_char(s.overdue_since,'YYYY-MM-DD') overdue_since, to_char(s.next_due_on,'YYYY-MM-DD') next_due_on,
      p.name plan_name,
      (select max(pg.paid_at) from payments pg where pg.family_id=f.id and pg.status='confirmed') ultimo_pagamento,
      (select coalesce(sum(pg.amount_cents),0) from payments pg where pg.family_id=f.id and pg.status='confirmed') total_pago_cents
    from families f
    left join lateral (select m.user_id from memberships m where m.family_id=f.id and m.status='active'
      order by (m.role='admin') desc limit 1) dono on true
    left join users u on u.id=dono.user_id
    left join subscriptions s on s.family_id=f.id
    left join plans p on p.id=s.plan_id
    order by f.created_at desc limit 2000`);
  return r.rows.map(l => {
    const licenca = situacaoDaLicenca(l.status ? l : null, agora);
    const atraso = l.overdue_since && ['atrasada', 'suspensa'].includes(licenca.situacao)
      ? Math.max(Math.floor((agora.getTime() - Date.parse(`${l.overdue_since}T03:00:00Z`)) / DIA), 0) : null;
    return {
      id: l.id, conta: l.conta, titular: l.titular || null, email: l.email || null, criada_em: l.created_at,
      situacao: licenca.situacao, acesso: licenca.acesso, plano: licenca.plano, cortesia: Boolean(l.exempt),
      ate: licenca.ate, dias_restantes: licenca.dias_restantes, proxima_cobranca: licenca.proxima_cobranca,
      aguardando_pagamento: licenca.aguardando_pagamento, dias_em_atraso: atraso,
      ultimo_pagamento: l.ultimo_pagamento || null, total_pago_cents: Number(l.total_pago_cents || 0)
    };
  });
}

export function registrarDono(app, { query, requireAuth, env = process.env, agora = () => new Date() }) {
  const soDono = async (req, res, next) => {
    // 404, e não 403: quem não é dono não precisa saber que o painel existe
    if (!await ehDono(query, req.auth.sub, env)) return res.status(404).json({ error: 'Rota não encontrada' });
    next();
  };
  const auditar = (req, acao, familyId, dados) => query(`insert into audit_events (family_id, actor_user_id, action, entity_type, entity_id, metadata)
    values ($1,$2,$3,'subscription',$1,$4::jsonb)`, [familyId, req.auth.sub, acao, JSON.stringify(dados)]);

  app.get('/owner/me', requireAuth, async (req, res) => {
    res.json({ dono: await ehDono(query, req.auth.sub, env) });
  });

  app.get('/owner/accounts', requireAuth, soDono, async (_req, res) => {
    const contas = await listarContas(query, agora());
    const inicioDoMes = `${agora().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)}-01`;
    const mes = await query(`select
        coalesce((select sum(amount_cents) from payments where status='confirmed' and paid_at >= $1::date),0)::bigint recebido_cents,
        (select count(*) from billing_events where event_type='cancelled' and created_at >= $1::date)::int cancelamentos,
        (select count(*) from billing_events where event_type='refund' and created_at >= $1::date)::int estornos,
        (select count(*) from families where created_at >= $1::date)::int contas_novas`, [inicioDoMes]);
    const m = mes.rows[0] || {};
    res.json({
      resumo: { ...resumirContas(contas), recebido_no_mes_cents: Number(m.recebido_cents || 0), cancelamentos_no_mes: Number(m.cancelamentos || 0),
        estornos_no_mes: Number(m.estornos || 0), contas_novas_no_mes: Number(m.contas_novas || 0) },
      contas
    });
  });

  /* Cortesia: libera a conta sem prazo e sem cobrança — ou tira a cortesia. */
  app.post('/owner/accounts/:id/courtesy', requireAuth, soDono, async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Conta não encontrada' });
    const ligar = req.body?.cortesia === true;
    const r = await query(`update subscriptions set exempt=$1, updated_at=now() where family_id=$2 returning status, external_subscription_id`, [ligar, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Conta não encontrada' });
    // sem a cortesia, quem nunca assinou volta a um teste completo a partir de agora
    if (!ligar && r.rows[0].status === 'trial') {
      await query(`update subscriptions set current_period_end=$1::timestamptz where family_id=$2`, [new Date(agora().getTime() + DIAS_DE_TESTE * DIA).toISOString(), req.params.id]);
    }
    await auditar(req, ligar ? 'owner_courtesy_on' : 'owner_courtesy_off', req.params.id, {});
    res.json({ cortesia: ligar });
  });

  /* Prorrogar o teste grátis de uma conta que ainda não assinou. */
  app.post('/owner/accounts/:id/trial', requireAuth, soDono, async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Conta não encontrada' });
    const dias = Number(req.body?.dias);
    if (!Number.isInteger(dias) || dias < 1 || dias > 90) return res.status(400).json({ error: 'Informe de 1 a 90 dias.' });
    const atual = await query('select status, current_period_end from subscriptions where family_id=$1', [req.params.id]);
    if (!atual.rows.length) return res.status(404).json({ error: 'Conta não encontrada' });
    if (atual.rows[0].status !== 'trial') return res.status(409).json({ error: 'Só dá para prorrogar o teste de quem ainda não assinou.' });
    // conta a partir do fim do teste, ou de agora se ele já venceu
    const fim = atual.rows[0].current_period_end ? new Date(atual.rows[0].current_period_end) : agora();
    const base = fim > agora() ? fim : agora();
    const novoFim = new Date(base.getTime() + dias * DIA).toISOString();
    await query('update subscriptions set current_period_end=$1::timestamptz, updated_at=now() where family_id=$2', [novoFim, req.params.id]);
    await auditar(req, 'owner_trial_extended', req.params.id, { dias });
    res.json({ ate: novoFim });
  });
}

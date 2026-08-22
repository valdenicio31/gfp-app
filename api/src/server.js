import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { migrate, query, transaction } from './db.js';
import { allowRoles, requireAuth, signToken } from './auth.js';
import nodemailer from 'nodemailer';
import passwordResetRouter from './password-reset.js';

const app = express();
const port = Number(process.env.PORT || 10000);
const missingConfig = ['DATABASE_URL', 'JWT_SECRET'].filter(key => !process.env[key]);
if (missingConfig.length) {
  console.error(`Configuração obrigatória ausente: ${missingConfig.join(', ')}`);
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET deve possuir pelo menos 32 caracteres');
  process.exit(1);
}
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false }));
app.use(express.json({ limit: '300kb' }));
app.use('/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }));
app.use('/auth/password-reset', passwordResetRouter);

app.get('/health', async (_req, res) => {
  try {
    await query('select 1');
    res.json({ status: 'ok', service: 'gfp-familiar-api' });
  } catch {
    res.status(503).json({ status: 'degraded', service: 'gfp-familiar-api' });
  }
});

app.get('/address/cep/:cep', rateLimit({windowMs:60*1000,limit:30}), async(req,res)=>{
  const cep=String(req.params.cep||'').replace(/\D/g,'');
  if(!/^\d{8}$/.test(cep)) return res.status(400).json({error:'CEP deve ter 8 números'});
  try{const response=await fetch(`https://viacep.com.br/ws/${cep}/json/`,{signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error('provider');const data=await response.json();if(data.erro)return res.status(404).json({error:'CEP não encontrado'});res.json({cep:data.cep,street:data.logradouro||'',complement:data.complemento||'',district:data.bairro||'',city:data.localidade||'',state:data.uf||''});}
  catch(error){if(error.message==='provider')return res.status(502).json({error:'Serviço de CEP indisponível'});res.status(504).json({error:'A consulta de CEP demorou demais'});}
});

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  familyName: z.string().trim().min(2).max(80),
  email: z.email().transform(value => value.toLowerCase()),
  password: z.string().min(10).max(128)
});

app.post('/auth/register-family', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados de cadastro inválidos' });
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Banco não configurado' });
  const { name, familyName, email, password } = parsed.data;
  const familyId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    await transaction(async client => {
      await client.query('insert into families (id, name) values ($1,$2)', [familyId, familyName]);
      await client.query('insert into users (id, name, email, password_hash) values ($1,$2,$3,$4)', [userId, name, email, passwordHash]);
      const defaults=[['Administrador','admin','👑'],['Adulto','adult','👤'],['Dependente','dependent','🧒'],['Somente leitura','viewer','👁️']];
      let adminProfileId;
      for (const [profileName,baseRole,emoji] of defaults) {
        const profileId=crypto.randomUUID();
        await client.query('insert into family_profiles (id,family_id,name,base_role,emoji,is_default) values ($1,$2,$3,$4,$5,true)', [profileId,familyId,profileName,baseRole,emoji]);
        if (baseRole==='admin') adminProfileId=profileId;
      }
      await client.query("insert into memberships (family_id,user_id,role,status,profile_id) values ($1,$2,'admin','active',$3)", [familyId, userId, adminProfileId]);
    });
    res.status(201).json({ token: signToken({ id: userId, family_id: familyId, role: 'admin' }) });
  } catch (error) {
    res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'E-mail já cadastrado' : 'Não foi possível criar a família' });
  }
});

const loginSchema = z.object({ email: z.email().transform(v => v.toLowerCase()), password: z.string().min(1).max(128) });
app.post('/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Credenciais inválidas' });
  const result = await query(`select u.id,u.password_hash,m.family_id,m.role from users u join memberships m on m.user_id=u.id where u.email=$1 and m.status='active' limit 1`, [parsed.data.email]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) return res.status(401).json({ error: 'E-mail ou senha incorretos' });
  res.json({ token: signToken(user) });
});

app.get('/me', requireAuth, async (req, res) => {
  const result = await query(`select u.id,u.name,u.email,m.role,m.family_id,f.name family_name from users u join memberships m on m.user_id=u.id join families f on f.id=m.family_id where u.id=$1 and m.family_id=$2 and m.status='active'`, [req.auth.sub, req.auth.familyId]);
  res.json(result.rows[0] || null);
});

app.get('/family/members', requireAuth, allowRoles('admin'), async (req, res) => {
  const result = await query(`select u.id,u.name,u.email,u.phone,u.avatar_emoji,u.photo_data,u.city,u.state,case when u.cpf is null then null else '***.***.***-'||right(u.cpf,2) end cpf_masked,m.role,m.status,p.id profile_id,coalesce(p.name,m.role) profile_name,coalesce(p.emoji,'👤') emoji from memberships m join users u on u.id=m.user_id left join family_profiles p on p.id=m.profile_id where m.family_id=$1 order by u.name`, [req.auth.familyId]);
  res.json(result.rows);
});

app.get('/family/profiles', requireAuth, async (req,res)=>{
  const result=await query(`select id,name,base_role,emoji,is_default from family_profiles where family_id=$1 order by case base_role when 'admin' then 0 else 1 end,is_default desc,name`,[req.auth.familyId]);
  res.json(result.rows);
});

const profileSchema=z.object({name:z.string().trim().min(2).max(50),baseRole:z.enum(['adult','dependent','viewer']),emoji:z.string().trim().min(1).max(12).default('👤')});
app.post('/family/profiles',requireAuth,allowRoles('admin'),async(req,res)=>{
  const parsed=profileSchema.safeParse(req.body);
  if(!parsed.success) return res.status(400).json({error:'Perfil inválido'});
  const id=crypto.randomUUID();
  try{await query('insert into family_profiles (id,family_id,name,base_role,emoji) values ($1,$2,$3,$4,$5)',[id,req.auth.familyId,parsed.data.name,parsed.data.baseRole,parsed.data.emoji]);res.status(201).json({id,...parsed.data});}
  catch(error){res.status(error.code==='23505'?409:500).json({error:error.code==='23505'?'Já existe um perfil com esse nome':'Não foi possível criar o perfil'});}
});

const validCpf=cpf=>{if(!/^\d{11}$/.test(cpf)||/^(\d)\1+$/.test(cpf))return false;const check=size=>{let sum=0;for(let i=0;i<size;i++)sum+=Number(cpf[i])*(size+1-i);const rest=(sum*10)%11;return (rest===10?0:rest)===Number(cpf[size])};return check(9)&&check(10)};
const inviteSchema = z.object({name:z.string().trim().min(2).max(80),cpf:z.string().refine(validCpf),email:z.email().transform(value=>value.toLowerCase()),birthDate:z.iso.date(),phone:z.string().regex(/^\d{10,11}$/),profileId:z.uuid(),avatarEmoji:z.string().min(1).max(12).default('👤'),photoData:z.string().max(210000).refine(value=>!value||/^data:image\/(png|jpeg|webp);base64,/.test(value)).default(''),cep:z.string().regex(/^\d{8}$/),street:z.string().trim().min(2).max(120),number:z.string().trim().min(1).max(20),complement:z.string().trim().max(80).default(''),district:z.string().trim().min(2).max(80),city:z.string().trim().min(2).max(80),state:z.string().trim().length(2).transform(value=>value.toUpperCase())});
app.post('/family/invitations', requireAuth, allowRoles('admin'), async (req, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Convite inválido' });
  const duplicate=await query(`select 1 from users where email=$1 or cpf=$2 union all select 1 from invitations where accepted_at is null and expires_at>now() and (email=$1 or cpf=$2) limit 1`,[parsed.data.email,parsed.data.cpf]);
  if(duplicate.rows[0]) return res.status(409).json({error:'CPF ou e-mail já cadastrado ou com convite pendente'});
  const profile=await query(`select id,base_role from family_profiles where id=$1 and family_id=$2 and base_role<>'admin'`,[parsed.data.profileId,req.auth.familyId]);
  if(!profile.rows[0]) return res.status(404).json({error:'Perfil não encontrado ou não permitido'});
  const count = await query(`select (select count(*) from memberships where family_id=$1 and status in ('active','invited')) +
    (select count(*) from invitations where family_id=$1 and accepted_at is null and expires_at>now()) total`, [req.auth.familyId]);
  const family = await query('select member_limit from families where id=$1', [req.auth.familyId]);
  if (Number(count.rows[0].total) >= family.rows[0].member_limit) return res.status(409).json({ error: 'Limite da licença familiar atingido' });
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const id = crypto.randomUUID();
  const d=parsed.data;
  await query(`insert into invitations (id,family_id,email,role,token_hash,expires_at,created_by,profile_id,name,cpf,birth_date,phone,avatar_emoji,photo_data,cep,street,address_number,complement,district,city,state)
    values ($1,$2,$3,$4,$5,now()+interval '7 days',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`, [id,req.auth.familyId,d.email,profile.rows[0].base_role,tokenHash,req.auth.sub,profile.rows[0].id,d.name,d.cpf,d.birthDate,d.phone,d.avatarEmoji,d.photoData||null,d.cep,d.street,d.number,d.complement,d.district,d.city,d.state]);
  res.status(201).json({ id, inviteCode: token, expiresInDays: 7 });
});

app.get('/family/invitations', requireAuth, allowRoles('admin'), async (req, res) => {
  const result = await query(`select id,email,role,expires_at,accepted_at,created_at from invitations where family_id=$1 order by created_at desc`, [req.auth.familyId]);
  res.json(result.rows);
});

const acceptInviteSchema = z.object({ token: z.string().min(32), name: z.string().trim().min(2).max(80), password: z.string().min(10).max(128) });
app.post('/auth/accept-invitation', async (req, res) => {
  const parsed = acceptInviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados do convite inválidos' });
  const tokenHash = crypto.createHash('sha256').update(parsed.data.token).digest('hex');
  const invite = await query(`select * from invitations where token_hash=$1 and accepted_at is null and expires_at>now()`, [tokenHash]);
  if (!invite.rows[0]) return res.status(404).json({ error: 'Convite inválido ou expirado' });
  const item = invite.rows[0], userId = crypto.randomUUID(), passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await transaction(async client => {
    await client.query(`insert into users (id,name,email,password_hash,cpf,birth_date,phone,avatar_emoji,photo_data,cep,street,address_number,complement,district,city,state) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, [userId,item.name||parsed.data.name,item.email,passwordHash,item.cpf,item.birth_date,item.phone,item.avatar_emoji,item.photo_data,item.cep,item.street,item.address_number,item.complement,item.district,item.city,item.state]);
    await client.query(`insert into memberships (family_id,user_id,role,status,profile_id) values ($1,$2,$3,'active',$4)`, [item.family_id,userId,item.role,item.profile_id]);
    await client.query('update invitations set accepted_at=now() where id=$1', [item.id]);
  });
  res.status(201).json({ token: signToken({ id:userId,family_id:item.family_id,role:item.role }) });
});

const accountSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(['checking','savings','cash','investment']),
  balanceCents: z.number().int().min(-999999999999).max(999999999999).default(0),
  isPrivate: z.boolean().default(false),
  bankId: z.uuid().nullish(),
  branchId: z.uuid().nullish(),
  accountNumber: z.string().trim().max(30).nullish()
});

app.get('/accounts', requireAuth, async (req, res) => {
  const familyScope = req.auth.role === 'admin' && req.query.scope === 'family';
  const result = await query(`select a.id,a.name,a.type,a.balance_cents,a.is_private,a.owner_user_id,
      a.bank_id,a.branch_id,a.account_number,b.name bank_name,b.code bank_code,f.number branch_number,f.name branch_name
    from accounts a
    left join banks b on b.id=a.bank_id
    left join bank_branches f on f.id=a.branch_id
    where a.family_id=$1 and (a.owner_user_id=$2 or ($3::boolean=true and a.is_private=false)) order by a.name`,
    [req.auth.familyId, req.auth.sub, familyScope]);
  res.json(result.rows);
});

app.post('/accounts', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  const parsed = accountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados da conta inválidos' });
  const id = crypto.randomUUID();
  const { name, type, balanceCents, isPrivate, bankId, branchId, accountNumber } = parsed.data;
  // banco e agência precisam ser da própria família
  for (const [valor, tabela] of [[bankId, 'banks'], [branchId, 'bank_branches']]) {
    if (!valor) continue;
    const existe = await query(`select 1 from ${tabela} where id=$1 and family_id=$2`, [valor, req.auth.familyId]);
    if (!existe.rows[0]) return res.status(404).json({ error: tabela === 'banks' ? 'Banco não encontrado' : 'Agência não encontrada' });
  }
  await query(`insert into accounts (id,family_id,owner_user_id,name,type,balance_cents,is_private,bank_id,branch_id,account_number)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, req.auth.familyId, req.auth.sub, name, type, balanceCents, isPrivate, bankId || null, branchId || null, accountNumber || null]);
  res.status(201).json({ id, name, type, balance_cents: balanceCents, is_private: isPrivate, bank_id: bankId || null, branch_id: branchId || null, account_number: accountNumber || null });
});

const SEM_CATEGORIA = '__sem_categoria__';
const isoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const listaFiltro = value => String(value ?? '').split('|').map(item => item.trim()).filter(Boolean).slice(0, 80);

const transactionSchema = z.object({
  accountId: z.uuid(),
  type: z.enum(['income','expense']),
  description: z.string().trim().min(2).max(140),
  amountCents: z.number().int().positive().max(999999999999),
  occurredOn: z.iso.date(),
  category: z.string().trim().max(40).nullish(),
  supplier: z.string().trim().max(120).nullish()
});
const transactionPatchSchema = transactionSchema.partial();
const bulkDeleteSchema = z.object({
  ids: z.array(z.uuid()).max(1000).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  accountId: z.uuid().optional()
});

// Monta o filtro compartilhado por lista, resumo e exclusão em lote.
// Só devolve lançamentos que o usuário pode ver: os das contas dele e,
// para o administrador em visão familiar, as contas não privadas da família.
function filtroLancamentos(req, origem = {}) {
  const familyScope = req.auth.role === 'admin' && req.query.scope === 'family';
  const params = [req.auth.familyId, req.auth.sub, familyScope];
  const where = ['t.family_id=$1', '(a.owner_user_id=$2 or ($3::boolean=true and a.is_private=false))'];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('$?', `$${params.length}`)); };

  const de = origem.from ?? req.query.from;
  const ate = origem.to ?? req.query.to;
  if (isoDate(de)) add('t.occurred_on>=$?::date', de);
  if (isoDate(ate)) add('t.occurred_on<=$?::date', ate);

  const contaUnica = origem.accountId;
  if (isUuid(contaUnica)) add('t.account_id=$?::uuid', contaUnica);

  const ids = Array.isArray(origem.ids) ? origem.ids.filter(isUuid) : [];
  if (ids.length) add('t.id=any($?::uuid[])', ids);

  const categorias = listaFiltro(req.query.categories);
  if (categorias.length) {
    const nomes = categorias.filter(item => item !== SEM_CATEGORIA);
    const semCategoria = categorias.includes(SEM_CATEGORIA);
    params.push(nomes);
    const trecho = `t.category=any($${params.length}::text[])`;
    where.push(semCategoria ? `(${trecho} or t.category is null or t.category='')` : trecho);
  }

  const contas = listaFiltro(req.query.accounts).filter(isUuid);
  if (contas.length) add('t.account_id=any($?::uuid[])', contas);

  const tipos = listaFiltro(req.query.types).filter(item => ['income','expense','transfer'].includes(item));
  if (tipos.length) add('t.type=any($?::text[])', tipos);

  const meses = listaFiltro(req.query.months).filter(item => /^\d{4}-\d{2}$/.test(item));
  if (meses.length) add(`to_char(t.occurred_on,'YYYY-MM')=any($?::text[])`, meses);

  const busca = String(req.query.search ?? '').trim().slice(0, 80);
  if (busca) {
    params.push(busca);
    const alvo = `$${params.length}`;
    where.push(`(t.description ilike '%'||${alvo}||'%' or coalesce(t.supplier,'') ilike '%'||${alvo}||'%')`);
  }

  return { where: where.join(' and '), params, familyScope };
}

const COLUNAS_LANCAMENTO = `t.id,t.type,t.description,t.amount_cents,to_char(t.occurred_on,'YYYY-MM-DD') occurred_on,t.account_id,t.category,t.supplier,t.created_by,a.name account_name,a.is_private`;

app.get('/transactions', requireAuth, async (req, res) => {
  const { where, params } = filtroLancamentos(req);
  const limite = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);
  const itens = await query(`select ${COLUNAS_LANCAMENTO}
    from transactions t join accounts a on a.id=t.account_id
    where ${where}
    order by t.occurred_on desc,t.created_at desc limit ${limite}`, params);

  // Sem envelope a resposta continua sendo a lista pura (compatível com o que já existe).
  if (!['1','true','sim'].includes(String(req.query.envelope || ''))) return res.json(itens.rows);

  const resumo = await query(`select count(*)::int total,
      coalesce(sum(case when t.type='income' then t.amount_cents else 0 end),0)::bigint income_cents,
      coalesce(sum(case when t.type='expense' then t.amount_cents else 0 end),0)::bigint expense_cents
    from transactions t join accounts a on a.id=t.account_id where ${where}`, params);

  // Listas de valores de cada coluna — é o que alimenta o filtro no estilo AutoFiltro.
  // Elas ignoram os filtros ativos de propósito: a lista da coluna mostra sempre todos os valores.
  const escopo = filtroLancamentos({ auth: req.auth, query: { scope: req.query.scope } });
  const [categorias, contas, tipos, meses] = await Promise.all([
    query(`select coalesce(nullif(t.category,''),'${SEM_CATEGORIA}') valor,count(*)::int total
      from transactions t join accounts a on a.id=t.account_id where ${escopo.where} group by 1 order by 1`, escopo.params),
    query(`select t.account_id valor,a.name rotulo,count(*)::int total
      from transactions t join accounts a on a.id=t.account_id where ${escopo.where} group by 1,2 order by 2`, escopo.params),
    query(`select t.type valor,count(*)::int total
      from transactions t join accounts a on a.id=t.account_id where ${escopo.where} group by 1 order by 1`, escopo.params),
    query(`select to_char(t.occurred_on,'YYYY-MM') valor,count(*)::int total
      from transactions t join accounts a on a.id=t.account_id where ${escopo.where} group by 1 order by 1 desc`, escopo.params)
  ]);

  const linha = resumo.rows[0] || { total: 0, income_cents: 0, expense_cents: 0 };
  res.json({
    items: itens.rows,
    summary: {
      total: linha.total,
      incomeCents: Number(linha.income_cents),
      expenseCents: Number(linha.expense_cents),
      netCents: Number(linha.income_cents) - Number(linha.expense_cents),
      shown: itens.rows.length
    },
    facets: {
      categories: categorias.rows,
      accounts: contas.rows,
      types: tipos.rows,
      months: meses.rows
    }
  });
});

// Uma conta só pode receber lançamento de quem é dono dela; o administrador
// também alcança as contas familiares não privadas.
async function contaGravavel(req, accountId) {
  const conta = await query(`select id,owner_user_id,is_private from accounts where id=$1 and family_id=$2`, [accountId, req.auth.familyId]);
  const linha = conta.rows[0];
  if (!linha) return null;
  const propria = linha.owner_user_id === req.auth.sub;
  const familiarDoAdmin = req.auth.role === 'admin' && linha.is_private === false;
  return propria || familiarDoAdmin ? linha : null;
}

async function lancamentoGravavel(req, id) {
  const resultado = await query(`select t.id,t.type,t.amount_cents,t.account_id,a.owner_user_id,a.is_private
    from transactions t join accounts a on a.id=t.account_id
    where t.id=$1 and t.family_id=$2 and (a.owner_user_id=$3 or ($4::boolean=true and a.is_private=false))`,
    [id, req.auth.familyId, req.auth.sub, req.auth.role === 'admin']);
  return resultado.rows[0] || null;
}

const efeito = linha => (linha.type === 'income' ? Number(linha.amount_cents) : -Number(linha.amount_cents));

app.post('/transactions', requireAuth, allowRoles('admin','adult','dependent'), async (req, res) => {
  const parsed = transactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados do lançamento inválidos' });
  const { accountId, type, description, amountCents, occurredOn, category, supplier } = parsed.data;
  if (!await contaGravavel(req, accountId)) return res.status(404).json({ error: 'Conta não encontrada' });
  const id = crypto.randomUUID();
  await transaction(async client => {
    await client.query(`insert into transactions (id,family_id,account_id,created_by,type,description,amount_cents,occurred_on,category,supplier)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, req.auth.familyId, accountId, req.auth.sub, type, description, amountCents, occurredOn, category || null, supplier || null]);
    await client.query(`update accounts set balance_cents=balance_cents+$1 where id=$2 and family_id=$3`,
      [type === 'income' ? amountCents : -amountCents, accountId, req.auth.familyId]);
  });
  res.status(201).json({ id });
});

app.patch('/transactions/:id', requireAuth, allowRoles('admin','adult','dependent'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Lançamento inválido' });
  const parsed = transactionPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados do lançamento inválidos' });
  const atual = await lancamentoGravavel(req, req.params.id);
  if (!atual) return res.status(404).json({ error: 'Lançamento não encontrado' });

  const destino = parsed.data.accountId ?? atual.account_id;
  if (destino !== atual.account_id && !await contaGravavel(req, destino)) {
    return res.status(404).json({ error: 'Conta de destino não encontrada' });
  }
  const novo = {
    type: parsed.data.type ?? atual.type,
    amount_cents: parsed.data.amountCents ?? Number(atual.amount_cents)
  };

  await transaction(async client => {
    const campos = [], valores = [];
    const setar = (coluna, valor) => { valores.push(valor); campos.push(`${coluna}=$${valores.length}`); };
    if (parsed.data.accountId !== undefined) setar('account_id', destino);
    if (parsed.data.type !== undefined) setar('type', parsed.data.type);
    if (parsed.data.description !== undefined) setar('description', parsed.data.description);
    if (parsed.data.amountCents !== undefined) setar('amount_cents', parsed.data.amountCents);
    if (parsed.data.occurredOn !== undefined) setar('occurred_on', parsed.data.occurredOn);
    if (parsed.data.category !== undefined) setar('category', parsed.data.category || null);
    if (parsed.data.supplier !== undefined) setar('supplier', parsed.data.supplier || null);
    if (campos.length) {
      valores.push(req.params.id, req.auth.familyId);
      await client.query(`update transactions set ${campos.join(',')} where id=$${valores.length - 1} and family_id=$${valores.length}`, valores);
    }
    // Desfaz o efeito antigo no saldo e aplica o novo — mesmo se a conta mudou.
    await client.query(`update accounts set balance_cents=balance_cents-$1 where id=$2 and family_id=$3`,
      [efeito(atual), atual.account_id, req.auth.familyId]);
    await client.query(`update accounts set balance_cents=balance_cents+$1 where id=$2 and family_id=$3`,
      [efeito(novo), destino, req.auth.familyId]);
  });
  res.json({ id: req.params.id });
});

app.delete('/transactions/:id', requireAuth, allowRoles('admin','adult','dependent'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Lançamento inválido' });
  const atual = await lancamentoGravavel(req, req.params.id);
  if (!atual) return res.status(404).json({ error: 'Lançamento não encontrado' });
  await transaction(async client => {
    await client.query(`delete from transactions where id=$1 and family_id=$2`, [req.params.id, req.auth.familyId]);
    await client.query(`update accounts set balance_cents=balance_cents-$1 where id=$2 and family_id=$3`,
      [efeito(atual), atual.account_id, req.auth.familyId]);
  });
  res.json({ deleted: 1 });
});

const importItemSchema = z.object({
  occurredOn: z.iso.date(),
  description: z.string().trim().min(1).max(140),
  amountCents: z.number().int().positive().max(999999999999),
  type: z.enum(['income','expense']),
  category: z.string().trim().max(40).nullish(),
  supplier: z.string().trim().max(120).nullish(),
  identificador: z.string().trim().max(80).nullish()
});
const importSchema = z.object({
  accountId: z.uuid(),
  source: z.string().trim().max(120).optional(),
  items: z.array(importItemSchema).min(1).max(500)
});
const importCheckSchema = z.object({
  accountId: z.uuid(),
  items: z.array(z.object({
    occurredOn: z.iso.date(),
    amountCents: z.number().int().positive(),
    type: z.enum(['income','expense']),
    // a descrição entra na marca de importação, então precisa vir também na conferência
    description: z.string().trim().max(140).optional(),
    identificador: z.string().trim().max(80).nullish()
  })).min(1).max(500)
});

// A marca de importação: o identificador do próprio banco quando existe,
// senão a combinação de conta, data, tipo, valor e descrição enxuta.
function marcaDeImportacao(familyId, accountId, item) {
  const enxuta = String(item.description || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40);
  const base = item.identificador
    ? `${familyId}|${accountId}|fitid|${item.identificador}`
    : `${familyId}|${accountId}|${item.occurredOn}|${item.type}|${item.amountCents}|${enxuta}`;
  return crypto.createHash('sha256').update(base).digest('hex');
}

// Antes de importar, diz quais linhas já existem — por marca de importação
// ou por já haver lançamento igual (mesma data, tipo e valor) naquela conta.
app.post('/transactions/import-check', requireAuth, allowRoles('admin','adult','dependent'), async (req, res) => {
  const parsed = importCheckSchema.safeParse(req.body);
  if (!parsed.success) {
    const semConta = !req.body?.accountId;
    return res.status(400).json({ error: semConta ? 'Escolha a conta que vai receber os lançamentos' : 'Dados da conferência inválidos' });
  }
  if (!await contaGravavel(req, parsed.data.accountId)) return res.status(404).json({ error: 'Conta não encontrada' });

  const marcas = parsed.data.items.map(item => marcaDeImportacao(req.auth.familyId, parsed.data.accountId, item));
  const jaImportados = await query(
    `select import_hash from transactions where family_id=$1 and import_hash=any($2::text[])`,
    [req.auth.familyId, marcas]);
  const conhecidos = new Set(jaImportados.rows.map(linha => linha.import_hash));

  const iguais = await query(
    `select to_char(occurred_on,'YYYY-MM-DD') dia,type,amount_cents from transactions
     where family_id=$1 and account_id=$2 and occurred_on = any($3::date[])`,
    [req.auth.familyId, parsed.data.accountId, [...new Set(parsed.data.items.map(item => item.occurredOn))]]);
  const existentes = new Set(iguais.rows.map(linha => `${linha.dia}|${linha.type}|${linha.amount_cents}`));

  res.json(parsed.data.items.map((item, indice) => {
    const jaImportado = conhecidos.has(marcas[indice]);
    const pareceIgual = existentes.has(`${item.occurredOn}|${item.type}|${item.amountCents}`);
    return {
      index: indice,
      duplicado: jaImportado || pareceIgual,
      motivo: jaImportado ? 'este lançamento já foi importado antes'
        : pareceIgual ? 'já existe um lançamento igual nesta data e conta' : null
    };
  }));
});

// Importa o lote. A marca de importação é única por família, então mesmo
// que a mesma linha venha duas vezes só entra uma.
app.post('/transactions/import', requireAuth, allowRoles('admin','adult','dependent'), async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    const semConta = !req.body?.accountId;
    return res.status(400).json({ error: semConta ? 'Escolha a conta que vai receber os lançamentos' : 'Dados da importação inválidos' });
  }
  const { accountId, source, items } = parsed.data;
  if (!await contaGravavel(req, accountId)) return res.status(404).json({ error: 'Conta não encontrada' });

  const entraram = await transaction(async client => {
    const gravados = [];
    for (const item of items) {
      const resultado = await client.query(
        `insert into transactions (id,family_id,account_id,created_by,type,description,amount_cents,occurred_on,category,supplier,import_hash,import_source)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict (family_id,import_hash) where import_hash is not null do nothing
         returning id,type,amount_cents`,
        [crypto.randomUUID(), req.auth.familyId, accountId, req.auth.sub, item.type, item.description,
         item.amountCents, item.occurredOn, item.category || null, item.supplier || null,
         marcaDeImportacao(req.auth.familyId, accountId, item), (source || '').slice(0, 120) || null]);
      if (resultado.rows[0]) gravados.push(resultado.rows[0]);
    }
    const ajuste = gravados.reduce((soma, linha) =>
      soma + (linha.type === 'income' ? Number(linha.amount_cents) : -Number(linha.amount_cents)), 0);
    if (ajuste) {
      await client.query(`update accounts set balance_cents=balance_cents+$1 where id=$2 and family_id=$3`,
        [ajuste, accountId, req.auth.familyId]);
    }
    return gravados;
  });

  res.status(201).json({ inserted: entraram.length, duplicates: items.length - entraram.length });
});

// Exclusão em lote: por seleção (ids), por período (from/to) ou pelos dois.
// Apagar em lote é do administrador e do adulto.
app.post('/transactions/bulk-delete', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  const parsed = bulkDeleteSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'Seleção inválida' });
  const { ids, from, to, accountId } = parsed.data;
  if (!ids?.length && !from && !to) return res.status(400).json({ error: 'Escolha a seleção ou o período que será excluído' });

  const { where, params } = filtroLancamentos(req, { ids, from, to, accountId });
  const alvo = await query(`select t.id,t.type,t.amount_cents,t.account_id
    from transactions t join accounts a on a.id=t.account_id where ${where}`, params);
  if (!alvo.rows.length) return res.json({ deleted: 0, accounts: 0 });

  const porConta = new Map();
  for (const linha of alvo.rows) porConta.set(linha.account_id, (porConta.get(linha.account_id) || 0) + efeito(linha));

  await transaction(async client => {
    await client.query(`delete from transactions where family_id=$1 and id=any($2::uuid[])`,
      [req.auth.familyId, alvo.rows.map(linha => linha.id)]);
    for (const [conta, ajuste] of porConta) {
      await client.query(`update accounts set balance_cents=balance_cents-$1 where id=$2 and family_id=$3`,
        [ajuste, conta, req.auth.familyId]);
    }
  });
  res.json({ deleted: alvo.rows.length, accounts: porConta.size });
});

const reclassifySchema = z.object({
  terms: z.array(z.string().trim().min(3).max(80)).min(1).max(20),
  supplier: z.string().trim().max(120).nullish(),
  category: z.string().trim().max(40).nullish(),
  onlyUncategorized: z.boolean().default(true),
  accountId: z.uuid().nullish()
});

// Ensina de uma vez: aplica fornecedor e categoria a todos os lançamentos cuja
// descrição contém um dos termos. Por padrão só mexe no que está sem categoria.
app.post('/transactions/reclassify', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  const parsed = reclassifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados da classificação inválidos' });
  const { terms, supplier, category, onlyUncategorized, accountId } = parsed.data;
  if (!supplier && !category) return res.status(400).json({ error: 'Informe o fornecedor ou a categoria' });
  if (accountId && !await contaGravavel(req, accountId)) return res.status(404).json({ error: 'Conta não encontrada' });

  const params = [req.auth.familyId, req.auth.sub, req.auth.role === 'admin', terms.map(t => `%${t}%`)];
  const condicoes = [
    't.family_id=$1',
    '(a.owner_user_id=$2 or ($3::boolean=true and a.is_private=false))',
    't.description ilike any($4::text[])'
  ];
  if (onlyUncategorized) condicoes.push(`(t.category is null or t.category='')`);
  if (accountId) { params.push(accountId); condicoes.push(`t.account_id=$${params.length}::uuid`); }

  const alvo = await query(`select t.id from transactions t join accounts a on a.id=t.account_id
    where ${condicoes.join(' and ')}`, params);
  if (!alvo.rows.length) return res.json({ updated: 0 });

  const ids = alvo.rows.map(linha => linha.id);
  const campos = [], valores = [];
  if (category !== undefined && category !== null) { valores.push(category || null); campos.push(`category=$${valores.length}`); }
  if (supplier !== undefined && supplier !== null) { valores.push(supplier || null); campos.push(`supplier=$${valores.length}`); }
  valores.push(req.auth.familyId, ids);
  await query(`update transactions set ${campos.join(',')} where family_id=$${valores.length - 1} and id=any($${valores.length}::uuid[])`, valores);
  res.json({ updated: ids.length });
});

/* ---------- metas, orçamento e reserva ---------- */

const goalSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(600).nullish(),
  targetCents: z.number().int().positive().max(999999999999),
  deadline: z.iso.date().nullish(),
  emoji: z.string().trim().max(12).default('🎯')
});
const contributionSchema = z.object({
  amountCents: z.number().int().positive().max(999999999999),
  type: z.enum(['deposit','withdraw']).default('deposit'),
  note: z.string().trim().max(200).nullish()
});

app.get('/goals', requireAuth, async (req, res) => {
  const metas = await query(`select g.id,g.title,g.description,g.target_cents,g.current_cents,
      to_char(g.deadline,'YYYY-MM-DD') deadline,g.status,g.emoji,u.name criado_por,
      (select count(*)::int from goal_contributions c where c.goal_id=g.id) movimentos
    from goals g left join users u on u.id=g.created_by
    where g.family_id=$1 order by (g.status='completed'), g.deadline nulls last, g.created_at`, [req.auth.familyId]);
  res.json(metas.rows);
});

app.post('/goals', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  const parsed = goalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados da meta inválidos' });
  const { title, description, targetCents, deadline, emoji } = parsed.data;
  const criada = await query(`insert into goals (family_id,created_by,title,description,target_cents,deadline,emoji)
    values ($1,$2,$3,$4,$5,$6,$7) returning id,title,target_cents,current_cents,status,emoji`,
    [req.auth.familyId, req.auth.sub, title, description || null, targetCents, deadline || null, emoji]);
  res.status(201).json(criada.rows[0]);
});

app.patch('/goals/:id', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Meta inválida' });
  const parsed = goalSchema.partial().extend({ status: z.enum(['active','completed','cancelled']).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados da meta inválidos' });
  const campos = [], valores = [];
  const setar = (coluna, valor) => { valores.push(valor); campos.push(`${coluna}=$${valores.length}`); };
  if (parsed.data.title !== undefined) setar('title', parsed.data.title);
  if (parsed.data.description !== undefined) setar('description', parsed.data.description || null);
  if (parsed.data.targetCents !== undefined) setar('target_cents', parsed.data.targetCents);
  if (parsed.data.deadline !== undefined) setar('deadline', parsed.data.deadline || null);
  if (parsed.data.emoji !== undefined) setar('emoji', parsed.data.emoji);
  if (parsed.data.status !== undefined) setar('status', parsed.data.status);
  if (!campos.length) return res.json({ id: req.params.id });
  campos.push('updated_at=now()');
  valores.push(req.params.id, req.auth.familyId);
  const feito = await query(`update goals set ${campos.join(',')} where id=$${valores.length - 1} and family_id=$${valores.length}`, valores);
  if (!feito.rowCount) return res.status(404).json({ error: 'Meta não encontrada' });
  res.json({ id: req.params.id });
});

app.delete('/goals/:id', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Meta inválida' });
  const feito = await query('delete from goals where id=$1 and family_id=$2', [req.params.id, req.auth.familyId]);
  if (!feito.rowCount) return res.status(404).json({ error: 'Meta não encontrada' });
  res.json({ deleted: 1 });
});

// Depósito ou retirada na meta: guarda o movimento e recalcula o quanto já juntou.
app.post('/goals/:id/contributions', requireAuth, allowRoles('admin','adult','dependent'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Meta inválida' });
  const parsed = contributionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados do movimento inválidos' });
  const meta = await query('select id,target_cents,current_cents from goals where id=$1 and family_id=$2', [req.params.id, req.auth.familyId]);
  if (!meta.rows[0]) return res.status(404).json({ error: 'Meta não encontrada' });

  const { amountCents, type, note } = parsed.data;
  const atual = Number(meta.rows[0].current_cents);
  if (type === 'withdraw' && amountCents > atual) {
    return res.status(400).json({ error: `A meta tem ${(atual / 100).toFixed(2)} — não dá para retirar mais que isso` });
  }
  const novo = type === 'deposit' ? atual + amountCents : atual - amountCents;
  const alvo = Number(meta.rows[0].target_cents);

  await transaction(async client => {
    await client.query(`insert into goal_contributions (goal_id,family_id,user_id,amount_cents,type,note)
      values ($1,$2,$3,$4,$5,$6)`, [req.params.id, req.auth.familyId, req.auth.sub, amountCents, type, note || null]);
    await client.query(`update goals set current_cents=$1, status=$2, updated_at=now() where id=$3 and family_id=$4`,
      [novo, novo >= alvo ? 'completed' : 'active', req.params.id, req.auth.familyId]);
  });
  res.status(201).json({ currentCents: novo, status: novo >= alvo ? 'completed' : 'active' });
});

app.get('/goals/:id/contributions', requireAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Meta inválida' });
  const lista = await query(`select c.id,c.amount_cents,c.type,c.note,c.created_at,u.name quem
    from goal_contributions c left join users u on u.id=c.user_id
    where c.goal_id=$1 and c.family_id=$2 order by c.created_at desc limit 100`, [req.params.id, req.auth.familyId]);
  res.json(lista.rows);
});

const budgetSchema = z.object({
  category: z.string().trim().min(2).max(50),
  limitCents: z.number().int().positive().max(999999999999),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100)
});

// Orçamento do mês com o realizado calculado dos lançamentos da própria categoria.
app.get('/budgets', requireAuth, async (req, res) => {
  const hoje = new Date();
  const mes = Number(req.query.month) || hoje.getUTCMonth() + 1;
  const ano = Number(req.query.year) || hoje.getUTCFullYear();
  if (mes < 1 || mes > 12 || ano < 2020 || ano > 2100) return res.status(400).json({ error: 'Período inválido' });
  const familyScope = req.auth.role === 'admin';

  const lista = await query(`select b.id,b.category,b.limit_cents,b.period_month,b.period_year,
      coalesce((select sum(t.amount_cents) from transactions t join accounts a on a.id=t.account_id
        where t.family_id=b.family_id and t.category=b.category and t.type='expense'
          and extract(month from t.occurred_on)=b.period_month and extract(year from t.occurred_on)=b.period_year
          and (a.owner_user_id=$2 or ($3::boolean=true and a.is_private=false))),0)::bigint realizado_cents
    from budgets b
    where b.family_id=$1 and b.period_month=$4 and b.period_year=$5 and b.is_active=true
    order by b.category`, [req.auth.familyId, req.auth.sub, familyScope, mes, ano]);
  res.json({ month: mes, year: ano, items: lista.rows });
});

app.post('/budgets', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  const parsed = budgetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados do orçamento inválidos' });
  const { category, limitCents, month, year } = parsed.data;
  try {
    const criado = await query(`insert into budgets (family_id,category,limit_cents,period_month,period_year)
      values ($1,$2,$3,$4,$5)
      on conflict (family_id,category,period_month,period_year)
      do update set limit_cents=excluded.limit_cents, is_active=true, updated_at=now()
      returning id,category,limit_cents,period_month,period_year`, [req.auth.familyId, category, limitCents, month, year]);
    res.status(201).json(criado.rows[0]);
  } catch {
    res.status(500).json({ error: 'Não foi possível salvar o orçamento' });
  }
});

app.delete('/budgets/:id', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Orçamento inválido' });
  const feito = await query('delete from budgets where id=$1 and family_id=$2', [req.params.id, req.auth.familyId]);
  if (!feito.rowCount) return res.status(404).json({ error: 'Orçamento não encontrado' });
  res.json({ deleted: 1 });
});

const reserveSchema = z.object({
  name: z.string().trim().min(2).max(80).default('Reserva de emergência'),
  targetCents: z.number().int().positive().max(999999999999),
  monthlyTargetCents: z.number().int().min(0).max(999999999999).default(0)
});

app.get('/reserves', requireAuth, async (req, res) => {
  const lista = await query(`select id,name,target_cents,current_cents,monthly_target_cents,is_active
    from reserves where family_id=$1 and is_active=true order by created_at`, [req.auth.familyId]);
  res.json(lista.rows);
});

app.post('/reserves', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  const parsed = reserveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados da reserva inválidos' });
  const { name, targetCents, monthlyTargetCents } = parsed.data;
  const criada = await query(`insert into reserves (family_id,owner_user_id,name,target_cents,monthly_target_cents)
    values ($1,$2,$3,$4,$5) returning id,name,target_cents,current_cents,monthly_target_cents`,
    [req.auth.familyId, req.auth.sub, name, targetCents, monthlyTargetCents]);
  res.status(201).json(criada.rows[0]);
});

app.patch('/reserves/:id', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Reserva inválida' });
  const parsed = reserveSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados da reserva inválidos' });
  const campos = [], valores = [];
  if (parsed.data.name !== undefined) { valores.push(parsed.data.name); campos.push(`name=$${valores.length}`); }
  if (parsed.data.targetCents !== undefined) { valores.push(parsed.data.targetCents); campos.push(`target_cents=$${valores.length}`); }
  if (parsed.data.monthlyTargetCents !== undefined) { valores.push(parsed.data.monthlyTargetCents); campos.push(`monthly_target_cents=$${valores.length}`); }
  if (!campos.length) return res.json({ id: req.params.id });
  campos.push('updated_at=now()');
  valores.push(req.params.id, req.auth.familyId);
  const feito = await query(`update reserves set ${campos.join(',')} where id=$${valores.length - 1} and family_id=$${valores.length}`, valores);
  if (!feito.rowCount) return res.status(404).json({ error: 'Reserva não encontrada' });
  res.json({ id: req.params.id });
});

app.post('/reserves/:id/movements', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Reserva inválida' });
  const parsed = contributionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados do movimento inválidos' });
  const reserva = await query('select id,current_cents from reserves where id=$1 and family_id=$2', [req.params.id, req.auth.familyId]);
  if (!reserva.rows[0]) return res.status(404).json({ error: 'Reserva não encontrada' });
  const atual = Number(reserva.rows[0].current_cents);
  const { amountCents, type, note } = parsed.data;
  if (type === 'withdraw' && amountCents > atual) {
    return res.status(400).json({ error: `A reserva tem ${(atual / 100).toFixed(2)} — não dá para retirar mais que isso` });
  }
  const novo = type === 'deposit' ? atual + amountCents : atual - amountCents;
  await transaction(async client => {
    await client.query(`insert into reserve_movements (reserve_id,family_id,user_id,amount_cents,type,note)
      values ($1,$2,$3,$4,$5,$6)`, [req.params.id, req.auth.familyId, req.auth.sub, amountCents, type, note || null]);
    await client.query('update reserves set current_cents=$1, updated_at=now() where id=$2 and family_id=$3',
      [novo, req.params.id, req.auth.familyId]);
  });
  res.status(201).json({ currentCents: novo });
});

app.delete('/reserves/:id', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Reserva inválida' });
  const feito = await query('update reserves set is_active=false, updated_at=now() where id=$1 and family_id=$2', [req.params.id, req.auth.familyId]);
  if (!feito.rowCount) return res.status(404).json({ error: 'Reserva não encontrada' });
  res.json({ deleted: 1 });
});

/* ---------- cadastros da família: categorias, bancos, agências, parceiros ---------- */

const CATEGORIAS_PADRAO = [
  ['Alimentação', 'expense', '🍽️', '#9a6500', '#fff5d8'],
  ['Casa', 'expense', '🏠', '#0b4a8f', '#e8f4ff'],
  ['Educação', 'expense', '🎓', '#6b21a8', '#f3e8ff'],
  ['Lazer', 'expense', '🎉', '#9d1a7f', '#ffeafc'],
  ['Saúde', 'expense', '⚕️', '#9f1239', '#ffeef0'],
  ['Transporte', 'expense', '🚗', '#3730a3', '#eef2ff'],
  ['Outros', 'both', '📦', '#08762d', '#ecfff2']
];

// Toda família começa com as sete categorias de sempre; dali em diante é ela que manda.
async function garantirCategorias(familyId) {
  const existentes = await query('select count(*)::int total from categories where family_id=$1', [familyId]);
  if (existentes.rows[0].total > 0) return;
  for (const [name, kind, emoji, color, background] of CATEGORIAS_PADRAO) {
    await query(`insert into categories (family_id,name,kind,emoji,color,background,is_default)
      values ($1,$2,$3,$4,$5,$6,true) on conflict (family_id,name) do nothing`,
      [familyId, name, kind, emoji, color, background]);
  }
}

const categorySchema = z.object({
  name: z.string().trim().min(2).max(40),
  kind: z.enum(['income','expense','both']).default('expense'),
  emoji: z.string().trim().max(12).nullish(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{3,8}$/).nullish(),
  background: z.string().trim().regex(/^#[0-9a-fA-F]{3,8}$/).nullish()
});

app.get('/categories', requireAuth, async (req, res) => {
  await garantirCategorias(req.auth.familyId);
  const result = await query(`select c.id,c.name,c.kind,c.emoji,c.color,c.background,c.is_default,
      (select count(*)::int from transactions t where t.family_id=c.family_id and t.category=c.name) usos
    from categories c where c.family_id=$1 order by c.name`, [req.auth.familyId]);
  res.json(result.rows);
});

app.post('/categories', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados da categoria inválidos' });
  const { name, kind, emoji, color, background } = parsed.data;
  try {
    const criada = await query(`insert into categories (family_id,name,kind,emoji,color,background)
      values ($1,$2,$3,$4,$5,$6) returning id,name,kind,emoji,color,background,is_default`,
      [req.auth.familyId, name, kind, emoji || null, color || null, background || null]);
    res.status(201).json({ ...criada.rows[0], usos: 0 });
  } catch (erro) {
    res.status(erro.code === '23505' ? 409 : 500).json({ error: erro.code === '23505' ? 'Já existe uma categoria com esse nome' : 'Não foi possível criar a categoria' });
  }
});

// Renomear categoria arrasta os lançamentos: o nome é a ligação entre os dois.
app.patch('/categories/:id', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Categoria inválida' });
  const parsed = categorySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados da categoria inválidos' });
  const atual = await query('select id,name from categories where id=$1 and family_id=$2', [req.params.id, req.auth.familyId]);
  if (!atual.rows[0]) return res.status(404).json({ error: 'Categoria não encontrada' });

  const campos = [], valores = [];
  const setar = (coluna, valor) => { valores.push(valor); campos.push(`${coluna}=$${valores.length}`); };
  if (parsed.data.name !== undefined) setar('name', parsed.data.name);
  if (parsed.data.kind !== undefined) setar('kind', parsed.data.kind);
  if (parsed.data.emoji !== undefined) setar('emoji', parsed.data.emoji || null);
  if (parsed.data.color !== undefined) setar('color', parsed.data.color || null);
  if (parsed.data.background !== undefined) setar('background', parsed.data.background || null);
  if (!campos.length) return res.json({ id: req.params.id });

  try {
    await transaction(async client => {
      valores.push(req.params.id, req.auth.familyId);
      await client.query(`update categories set ${campos.join(',')} where id=$${valores.length - 1} and family_id=$${valores.length}`, valores);
      if (parsed.data.name && parsed.data.name !== atual.rows[0].name) {
        await client.query('update transactions set category=$1 where family_id=$2 and category=$3',
          [parsed.data.name, req.auth.familyId, atual.rows[0].name]);
        await client.query('update partners set category=$1 where family_id=$2 and category=$3',
          [parsed.data.name, req.auth.familyId, atual.rows[0].name]);
      }
    });
    res.json({ id: req.params.id });
  } catch (erro) {
    res.status(erro.code === '23505' ? 409 : 500).json({ error: erro.code === '23505' ? 'Já existe uma categoria com esse nome' : 'Não foi possível alterar a categoria' });
  }
});

// Apagar categoria em uso exige dizer para onde vão os lançamentos.
app.delete('/categories/:id', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Categoria inválida' });
  const atual = await query('select id,name from categories where id=$1 and family_id=$2', [req.params.id, req.auth.familyId]);
  if (!atual.rows[0]) return res.status(404).json({ error: 'Categoria não encontrada' });
  const nome = atual.rows[0].name;
  const usos = await query('select count(*)::int total from transactions where family_id=$1 and category=$2', [req.auth.familyId, nome]);
  const destino = typeof req.query.reassignTo === 'string' ? req.query.reassignTo.trim() : '';

  if (usos.rows[0].total > 0 && !destino && req.query.reassignTo === undefined) {
    const quantos = usos.rows[0].total;
    return res.status(409).json({ error: `${quantos === 1 ? 'Existe 1 lançamento' : `Existem ${quantos} lançamentos`} nesta categoria`, usos: quantos });
  }
  if (destino) {
    const existe = await query('select 1 from categories where family_id=$1 and name=$2', [req.auth.familyId, destino]);
    if (!existe.rows[0]) return res.status(400).json({ error: 'Categoria de destino não encontrada' });
  }
  await transaction(async client => {
    await client.query('update transactions set category=$1 where family_id=$2 and category=$3', [destino || null, req.auth.familyId, nome]);
    await client.query('update partners set category=$1 where family_id=$2 and category=$3', [destino || null, req.auth.familyId, nome]);
    await client.query('delete from categories where id=$1 and family_id=$2', [req.params.id, req.auth.familyId]);
  });
  res.json({ deleted: 1, movidos: usos.rows[0].total, para: destino || null });
});

const bankSchema = z.object({ name: z.string().trim().min(2).max(80), code: z.string().trim().max(10).nullish() });
const branchSchema = z.object({ bankId: z.uuid(), number: z.string().trim().min(1).max(20), name: z.string().trim().max(80).nullish() });

app.get('/banks', requireAuth, async (req, res) => {
  const bancos = await query('select id,name,code from banks where family_id=$1 order by name', [req.auth.familyId]);
  const agencias = await query(`select id,bank_id,number,name,
      (select count(*)::int from accounts a where a.branch_id=bank_branches.id) contas
    from bank_branches where family_id=$1 order by number`, [req.auth.familyId]);
  res.json(bancos.rows.map(banco => ({ ...banco, branches: agencias.rows.filter(a => a.bank_id === banco.id) })));
});

app.post('/banks', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  const parsed = bankSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados do banco inválidos' });
  try {
    const criado = await query('insert into banks (family_id,name,code) values ($1,$2,$3) returning id,name,code',
      [req.auth.familyId, parsed.data.name, parsed.data.code || null]);
    res.status(201).json({ ...criado.rows[0], branches: [] });
  } catch (erro) {
    res.status(erro.code === '23505' ? 409 : 500).json({ error: erro.code === '23505' ? 'Já existe um banco com esse nome' : 'Não foi possível criar o banco' });
  }
});

app.patch('/banks/:id', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Banco inválido' });
  const parsed = bankSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados do banco inválidos' });
  const campos = [], valores = [];
  if (parsed.data.name !== undefined) { valores.push(parsed.data.name); campos.push(`name=$${valores.length}`); }
  if (parsed.data.code !== undefined) { valores.push(parsed.data.code || null); campos.push(`code=$${valores.length}`); }
  if (!campos.length) return res.json({ id: req.params.id });
  valores.push(req.params.id, req.auth.familyId);
  const feito = await query(`update banks set ${campos.join(',')} where id=$${valores.length - 1} and family_id=$${valores.length}`, valores);
  if (!feito.rowCount) return res.status(404).json({ error: 'Banco não encontrado' });
  res.json({ id: req.params.id });
});

app.delete('/banks/:id', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Banco inválido' });
  const contas = await query(`select count(*)::int total from accounts where family_id=$1 and bank_id=$2`, [req.auth.familyId, req.params.id]);
  if (contas.rows[0].total > 0) {
    const quantas = contas.rows[0].total;
    return res.status(409).json({ error: `${quantas === 1 ? 'Existe 1 conta' : `Existem ${quantas} contas`} neste banco`, contas: quantas });
  }
  const feito = await query('delete from banks where id=$1 and family_id=$2', [req.params.id, req.auth.familyId]);
  if (!feito.rowCount) return res.status(404).json({ error: 'Banco não encontrado' });
  res.json({ deleted: 1 });
});

app.post('/bank-branches', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  const parsed = branchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados da agência inválidos' });
  const banco = await query('select id from banks where id=$1 and family_id=$2', [parsed.data.bankId, req.auth.familyId]);
  if (!banco.rows[0]) return res.status(404).json({ error: 'Banco não encontrado' });
  try {
    const criada = await query('insert into bank_branches (family_id,bank_id,number,name) values ($1,$2,$3,$4) returning id,bank_id,number,name',
      [req.auth.familyId, parsed.data.bankId, parsed.data.number, parsed.data.name || null]);
    res.status(201).json({ ...criada.rows[0], contas: 0 });
  } catch (erro) {
    res.status(erro.code === '23505' ? 409 : 500).json({ error: erro.code === '23505' ? 'Este banco já tem uma agência com esse número' : 'Não foi possível criar a agência' });
  }
});

app.delete('/bank-branches/:id', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Agência inválida' });
  const contas = await query('select count(*)::int total from accounts where family_id=$1 and branch_id=$2', [req.auth.familyId, req.params.id]);
  if (contas.rows[0].total > 0) {
    const quantas = contas.rows[0].total;
    return res.status(409).json({ error: `${quantas === 1 ? 'Existe 1 conta' : `Existem ${quantas} contas`} nesta agência`, contas: quantas });
  }
  const feito = await query('delete from bank_branches where id=$1 and family_id=$2', [req.params.id, req.auth.familyId]);
  if (!feito.rowCount) return res.status(404).json({ error: 'Agência não encontrada' });
  res.json({ deleted: 1 });
});

const partnerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(['supplier','client','both']).default('supplier'),
  document: z.string().trim().max(20).nullish(),
  category: z.string().trim().max(40).nullish(),
  matchTerms: z.string().trim().max(600).nullish()
});

app.get('/partners', requireAuth, async (req, res) => {
  const result = await query(`select p.id,p.name,p.kind,p.document,p.category,p.match_terms,
      (select count(*)::int from transactions t where t.family_id=p.family_id and t.supplier=p.name) usos
    from partners p where p.family_id=$1 order by p.name`, [req.auth.familyId]);
  res.json(result.rows);
});

app.post('/partners', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  const parsed = partnerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados do cadastro inválidos' });
  const { name, kind, document, category, matchTerms } = parsed.data;
  try {
    const criado = await query(`insert into partners (family_id,name,kind,document,category,match_terms)
      values ($1,$2,$3,$4,$5,$6) returning id,name,kind,document,category,match_terms`,
      [req.auth.familyId, name, kind, document || null, category || null, matchTerms || null]);
    res.status(201).json({ ...criado.rows[0], usos: 0 });
  } catch (erro) {
    res.status(erro.code === '23505' ? 409 : 500).json({ error: erro.code === '23505' ? 'Já existe um cadastro com esse nome' : 'Não foi possível criar o cadastro' });
  }
});

app.patch('/partners/:id', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Cadastro inválido' });
  const parsed = partnerSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados do cadastro inválidos' });
  const atual = await query('select id,name from partners where id=$1 and family_id=$2', [req.params.id, req.auth.familyId]);
  if (!atual.rows[0]) return res.status(404).json({ error: 'Cadastro não encontrado' });

  const campos = [], valores = [];
  const setar = (coluna, valor) => { valores.push(valor); campos.push(`${coluna}=$${valores.length}`); };
  if (parsed.data.name !== undefined) setar('name', parsed.data.name);
  if (parsed.data.kind !== undefined) setar('kind', parsed.data.kind);
  if (parsed.data.document !== undefined) setar('document', parsed.data.document || null);
  if (parsed.data.category !== undefined) setar('category', parsed.data.category || null);
  if (parsed.data.matchTerms !== undefined) setar('match_terms', parsed.data.matchTerms || null);
  if (!campos.length) return res.json({ id: req.params.id });

  try {
    await transaction(async client => {
      valores.push(req.params.id, req.auth.familyId);
      await client.query(`update partners set ${campos.join(',')} where id=$${valores.length - 1} and family_id=$${valores.length}`, valores);
      if (parsed.data.name && parsed.data.name !== atual.rows[0].name) {
        await client.query('update transactions set supplier=$1 where family_id=$2 and supplier=$3',
          [parsed.data.name, req.auth.familyId, atual.rows[0].name]);
      }
    });
    res.json({ id: req.params.id });
  } catch (erro) {
    res.status(erro.code === '23505' ? 409 : 500).json({ error: erro.code === '23505' ? 'Já existe um cadastro com esse nome' : 'Não foi possível alterar o cadastro' });
  }
});

app.delete('/partners/:id', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Cadastro inválido' });
  const feito = await query('delete from partners where id=$1 and family_id=$2', [req.params.id, req.auth.familyId]);
  if (!feito.rowCount) return res.status(404).json({ error: 'Cadastro não encontrado' });
  res.json({ deleted: 1 });
});

// Conta: alterar nome, banco, agência e número; excluir só sem lançamento.
const accountPatchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  type: z.enum(['checking','savings','cash','investment']).optional(),
  isPrivate: z.boolean().optional(),
  bankId: z.uuid().nullish(),
  branchId: z.uuid().nullish(),
  accountNumber: z.string().trim().max(30).nullish()
});

app.patch('/accounts/:id', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Conta inválida' });
  const parsed = accountPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados da conta inválidos' });
  if (!await contaGravavel(req, req.params.id)) return res.status(404).json({ error: 'Conta não encontrada' });

  const campos = [], valores = [];
  const setar = (coluna, valor) => { valores.push(valor); campos.push(`${coluna}=$${valores.length}`); };
  if (parsed.data.name !== undefined) setar('name', parsed.data.name);
  if (parsed.data.type !== undefined) setar('type', parsed.data.type);
  if (parsed.data.isPrivate !== undefined) setar('is_private', parsed.data.isPrivate);
  if (parsed.data.bankId !== undefined) setar('bank_id', parsed.data.bankId || null);
  if (parsed.data.branchId !== undefined) setar('branch_id', parsed.data.branchId || null);
  if (parsed.data.accountNumber !== undefined) setar('account_number', parsed.data.accountNumber || null);
  if (!campos.length) return res.json({ id: req.params.id });
  valores.push(req.params.id, req.auth.familyId);
  await query(`update accounts set ${campos.join(',')} where id=$${valores.length - 1} and family_id=$${valores.length}`, valores);
  res.json({ id: req.params.id });
});

app.delete('/accounts/:id', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Conta inválida' });
  if (!await contaGravavel(req, req.params.id)) return res.status(404).json({ error: 'Conta não encontrada' });
  const lancamentos = await query('select count(*)::int total from transactions where family_id=$1 and account_id=$2', [req.auth.familyId, req.params.id]);
  if (lancamentos.rows[0].total > 0) {
    const quantos = lancamentos.rows[0].total;
    return res.status(409).json({ error: `Esta conta tem ${quantos === 1 ? '1 lançamento' : `${quantos} lançamentos`} — exclua ou mova os lançamentos primeiro`, lancamentos: quantos });
  }
  await query('delete from accounts where id=$1 and family_id=$2', [req.params.id, req.auth.familyId]);
  res.json({ deleted: 1 });
});

const cardSchema=z.object({name:z.string().trim().min(2).max(60),brand:z.string().trim().min(2).max(30),lastFour:z.string().regex(/^\d{4}$/),limitCents:z.number().int().positive(),closingDay:z.number().int().min(1).max(31),dueDay:z.number().int().min(1).max(31)});
app.get('/cards',requireAuth,async(req,res)=>{const familyScope=req.auth.role==='admin'&&req.query.scope==='family';const result=await query(`select c.*,u.name owner_name,coalesce((select sum(ceil(p.amount_cents::numeric/p.installments)) from card_purchases p where p.card_id=c.id),0) invoice_cents from credit_cards c join users u on u.id=c.owner_user_id where c.family_id=$1 and ($3::boolean=true or c.owner_user_id=$2) order by c.name`,[req.auth.familyId,req.auth.sub,familyScope]);res.json(result.rows)});
app.post('/cards',requireAuth,allowRoles('admin','adult'),async(req,res)=>{const parsed=cardSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Dados do cartão inválidos'});const d=parsed.data,id=crypto.randomUUID();await query(`insert into credit_cards(id,family_id,owner_user_id,name,brand,last_four,limit_cents,closing_day,due_day) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,req.auth.familyId,req.auth.sub,d.name,d.brand,d.lastFour,d.limitCents,d.closingDay,d.dueDay]);res.status(201).json({id})});
const purchaseSchema=z.object({cardId:z.uuid(),description:z.string().trim().min(2).max(120),category:z.string().trim().min(2).max(40),amountCents:z.number().int().positive(),installments:z.number().int().min(1).max(48),purchasedOn:z.iso.date()});
app.get('/card-purchases',requireAuth,async(req,res)=>{const familyScope=req.auth.role==='admin'&&req.query.scope==='family';const result=await query('select p.id,p.card_id,p.description,p.category,p.amount_cents,p.installments,p.purchased_on,ceil(p.amount_cents::numeric/p.installments) installment_cents,c.name card_name,c.last_four,u.name owner_name from card_purchases p join credit_cards c on c.id=p.card_id join users u on u.id=c.owner_user_id where p.family_id=$1 and ($3::boolean=true or c.owner_user_id=$2) order by p.purchased_on desc,p.created_at desc',[req.auth.familyId,req.auth.sub,familyScope]);res.json(result.rows)});
app.post('/card-purchases',requireAuth,allowRoles('admin','adult','dependent'),async(req,res)=>{const parsed=purchaseSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Compra inválida'});const d=parsed.data,card=await query('select id,owner_user_id from credit_cards where id=$1 and family_id=$2',[d.cardId,req.auth.familyId]);if(!card.rows[0]||card.rows[0].owner_user_id!==req.auth.sub)return res.status(404).json({error:'Cartão não encontrado'});const id=crypto.randomUUID();await query(`insert into card_purchases(id,family_id,card_id,created_by,description,category,amount_cents,installments,purchased_on) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,req.auth.familyId,d.cardId,req.auth.sub,d.description,d.category,d.amountCents,d.installments,d.purchasedOn]);res.status(201).json({id})});


/* ---------------- agenda de contas a pagar e a receber ---------------- */
/* Uma conta prevista é uma regra ("aluguel, todo dia 10"). O calendário
   expande a regra nos dias do mês pedido e marca o que já virou lançamento. */

const RECORRENCIAS = ['once', 'weekly', 'monthly', 'yearly'];

const contaPrevistaSchema = z.object({
  kind: z.enum(['payable', 'receivable']),
  description: z.string().trim().min(2).max(160),
  amountCents: z.number().int().positive(),
  category: z.string().trim().max(40).nullish(),
  supplier: z.string().trim().max(120).nullish(),
  accountId: z.uuid().nullish(),
  recurrence: z.enum(RECORRENCIAS).default('monthly'),
  firstDueOn: z.iso.date(),
  endsOn: z.iso.date().nullish(),
  dayOfMonth: z.number().int().min(1).max(31).nullish(),
  weekday: z.number().int().min(0).max(6).nullish(),
  monthOfYear: z.number().int().min(1).max(12).nullish(),
  isActive: z.boolean().optional()
});

const soData = valor => (valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor).slice(0, 10));
const diasNoMes = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const montarData = (ano, mes, dia) => `${ano}-${String(mes).padStart(2, '0')}-${String(Math.min(dia, diasNoMes(ano, mes))).padStart(2, '0')}`;

/* Todos os vencimentos de uma regra dentro do mês pedido. */
function vencimentosDoMes(regra, ano, mes) {
  const primeiro = soData(regra.first_due_on);
  const fim = regra.ends_on ? soData(regra.ends_on) : null;
  const inicioDoMes = montarData(ano, mes, 1);
  const fimDoMes = montarData(ano, mes, 31);
  const dentro = data => data >= primeiro && data >= inicioDoMes && data <= fimDoMes && (!fim || data <= fim);
  const datas = [];

  if (regra.recurrence === 'once') {
    if (dentro(primeiro)) datas.push(primeiro);
  } else if (regra.recurrence === 'monthly') {
    const dia = regra.day_of_month || Number(primeiro.slice(8, 10));
    const candidata = montarData(ano, mes, dia);
    if (dentro(candidata)) datas.push(candidata);
  } else if (regra.recurrence === 'yearly') {
    const mesAlvo = regra.month_of_year || Number(primeiro.slice(5, 7));
    if (mesAlvo === mes) {
      const dia = regra.day_of_month || Number(primeiro.slice(8, 10));
      const candidata = montarData(ano, mes, dia);
      if (dentro(candidata)) datas.push(candidata);
    }
  } else if (regra.recurrence === 'weekly') {
    const alvo = regra.weekday === null || regra.weekday === undefined
      ? new Date(`${primeiro}T00:00:00Z`).getUTCDay()
      : Number(regra.weekday);
    for (let dia = 1; dia <= diasNoMes(ano, mes); dia += 1) {
      const candidata = montarData(ano, mes, dia);
      if (new Date(`${candidata}T00:00:00Z`).getUTCDay() === alvo && dentro(candidata)) datas.push(candidata);
    }
  }
  return datas;
}

const emReais = cents => (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* Mês e ano pedidos na URL. Sem parâmetro, o mês de hoje; com parâmetro
   inválido, null — para a rota avisar em vez de mostrar o mês errado. */
function mesPedido(req) {
  const agora = new Date();
  const ano = req.query.year === undefined || req.query.year === '' ? agora.getFullYear() : Number(req.query.year);
  const mes = req.query.month === undefined || req.query.month === '' ? agora.getMonth() + 1 : Number(req.query.month);
  if (!Number.isInteger(ano) || !Number.isInteger(mes)) return null;
  if (mes < 1 || mes > 12 || ano < 2000 || ano > 2100) return null;
  return { ano, mes };
}

async function contaPrevistaDaFamilia(req, id) {
  const resultado = await query('select * from scheduled_bills where id=$1 and family_id=$2', [id, req.auth.familyId]);
  return resultado.rows[0] || null;
}

app.get('/scheduled-bills', requireAuth, async (req, res) => {
  const resultado = await query(`select b.*, to_char(b.first_due_on,'YYYY-MM-DD') first_due_on, to_char(b.ends_on,'YYYY-MM-DD') ends_on,
      a.name conta_nome, u.name criado_por
    from scheduled_bills b
    left join accounts a on a.id=b.account_id
    left join users u on u.id=b.created_by
    where b.family_id=$1 ${req.query.all === '1' ? '' : 'and b.is_active=true'}
    order by b.kind, b.day_of_month nulls last, b.description`, [req.auth.familyId]);
  res.json(resultado.rows);
});

app.post('/scheduled-bills', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  const parsed = contaPrevistaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados da conta prevista inválidos' });
  const d = parsed.data;
  if (d.accountId && !await contaGravavel(req, d.accountId)) return res.status(404).json({ error: 'Conta não encontrada' });
  const id = crypto.randomUUID();
  await query(`insert into scheduled_bills
      (id,family_id,created_by,kind,description,amount_cents,category,supplier,account_id,recurrence,day_of_month,weekday,month_of_year,first_due_on,ends_on)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [id, req.auth.familyId, req.auth.sub, d.kind, d.description, d.amountCents, d.category || null, d.supplier || null,
      d.accountId || null, d.recurrence,
      d.recurrence === 'monthly' || d.recurrence === 'yearly' ? (d.dayOfMonth || Number(d.firstDueOn.slice(8, 10))) : null,
      d.recurrence === 'weekly' ? (d.weekday ?? new Date(`${d.firstDueOn}T00:00:00Z`).getUTCDay()) : null,
      d.recurrence === 'yearly' ? (d.monthOfYear || Number(d.firstDueOn.slice(5, 7))) : null,
      d.firstDueOn, d.endsOn || null]);
  res.status(201).json({ id });
});

app.patch('/scheduled-bills/:id', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Conta prevista inválida' });
  const parsed = contaPrevistaSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados da conta prevista inválidos' });
  const atual = await contaPrevistaDaFamilia(req, req.params.id);
  if (!atual) return res.status(404).json({ error: 'Conta prevista não encontrada' });
  const d = parsed.data;
  if (d.accountId && !await contaGravavel(req, d.accountId)) return res.status(404).json({ error: 'Conta não encontrada' });

  const campos = [], valores = [];
  const setar = (coluna, valor) => { valores.push(valor); campos.push(`${coluna}=$${valores.length}`); };
  if (d.kind !== undefined) setar('kind', d.kind);
  if (d.description !== undefined) setar('description', d.description);
  if (d.amountCents !== undefined) setar('amount_cents', d.amountCents);
  if (d.category !== undefined) setar('category', d.category || null);
  if (d.supplier !== undefined) setar('supplier', d.supplier || null);
  if (d.accountId !== undefined) setar('account_id', d.accountId || null);
  if (d.recurrence !== undefined) setar('recurrence', d.recurrence);
  if (d.dayOfMonth !== undefined) setar('day_of_month', d.dayOfMonth || null);
  if (d.weekday !== undefined) setar('weekday', d.weekday ?? null);
  if (d.monthOfYear !== undefined) setar('month_of_year', d.monthOfYear || null);
  if (d.firstDueOn !== undefined) setar('first_due_on', d.firstDueOn);
  if (d.endsOn !== undefined) setar('ends_on', d.endsOn || null);
  if (d.isActive !== undefined) setar('is_active', d.isActive);
  if (!campos.length) return res.json({ id: req.params.id });
  valores.push(req.params.id, req.auth.familyId);
  await query(`update scheduled_bills set ${campos.join(',')}, updated_at=now() where id=$${valores.length - 1} and family_id=$${valores.length}`, valores);
  res.json({ id: req.params.id });
});

app.delete('/scheduled-bills/:id', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Conta prevista inválida' });
  const atual = await contaPrevistaDaFamilia(req, req.params.id);
  if (!atual) return res.status(404).json({ error: 'Conta prevista não encontrada' });
  const pagos = await query('select count(*)::int total from scheduled_bill_payments where bill_id=$1', [req.params.id]);
  if (pagos.rows[0].total > 0 && req.query.force !== '1') {
    await query('update scheduled_bills set is_active=false, updated_at=now() where id=$1 and family_id=$2', [req.params.id, req.auth.familyId]);
    return res.json({ desativada: 1, pagamentos: pagos.rows[0].total });
  }
  await query('delete from scheduled_bills where id=$1 and family_id=$2', [req.params.id, req.auth.familyId]);
  res.json({ deleted: 1 });
});

/* Pagar (ou receber): a previsão vira um lançamento de verdade. */
const pagamentoSchema = z.object({
  dueOn: z.iso.date(),
  accountId: z.uuid().optional(),
  amountCents: z.number().int().positive().optional(),
  occurredOn: z.iso.date().optional()
});

app.post('/scheduled-bills/:id/pay', requireAuth, allowRoles('admin','adult','dependent'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Conta prevista inválida' });
  const parsed = pagamentoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados do pagamento inválidos' });
  const regra = await contaPrevistaDaFamilia(req, req.params.id);
  if (!regra) return res.status(404).json({ error: 'Conta prevista não encontrada' });

  const contaId = parsed.data.accountId || regra.account_id;
  if (!contaId) return res.status(400).json({ error: 'Escolha a conta de onde sai o dinheiro' });
  if (!await contaGravavel(req, contaId)) return res.status(404).json({ error: 'Conta não encontrada' });

  const jaPago = await query('select id from scheduled_bill_payments where bill_id=$1 and due_on=$2', [regra.id, parsed.data.dueOn]);
  if (jaPago.rows[0]) return res.status(409).json({ error: 'Este vencimento já foi baixado' });

  const valor = parsed.data.amountCents || Number(regra.amount_cents);
  const quando = parsed.data.occurredOn || parsed.data.dueOn;
  const tipo = regra.kind === 'receivable' ? 'income' : 'expense';
  const lancamentoId = crypto.randomUUID();

  await transaction(async client => {
    await client.query(`insert into transactions (id,family_id,account_id,created_by,type,description,amount_cents,occurred_on,category,supplier)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [lancamentoId, req.auth.familyId, contaId, req.auth.sub, tipo, regra.description, valor, quando, regra.category || null, regra.supplier || null]);
    await client.query('update accounts set balance_cents=balance_cents+$1 where id=$2 and family_id=$3',
      [tipo === 'income' ? valor : -valor, contaId, req.auth.familyId]);
    await client.query(`insert into scheduled_bill_payments (family_id,bill_id,transaction_id,due_on,paid_on,amount_cents,created_by)
      values ($1,$2,$3,$4,$5,$6,$7)`,
      [req.auth.familyId, regra.id, lancamentoId, parsed.data.dueOn, quando, valor, req.auth.sub]);
    if (regra.recurrence === 'once') {
      await client.query('update scheduled_bills set is_active=false, updated_at=now() where id=$1', [regra.id]);
    }
  });
  res.status(201).json({ transactionId: lancamentoId, amountCents: valor, accountId: contaId });
});

/* Desfazer a baixa: apaga o lançamento e devolve o vencimento para a agenda. */
app.delete('/scheduled-bills/:id/pay', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Conta prevista inválida' });
  const dueOn = String(req.query.dueOn || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return res.status(400).json({ error: 'Vencimento inválido' });
  const baixa = await query(`select p.id,p.transaction_id,t.type,t.amount_cents,t.account_id
    from scheduled_bill_payments p left join transactions t on t.id=p.transaction_id
    where p.bill_id=$1 and p.due_on=$2 and p.family_id=$3`, [req.params.id, dueOn, req.auth.familyId]);
  const linha = baixa.rows[0];
  if (!linha) return res.status(404).json({ error: 'Este vencimento não está baixado' });
  await transaction(async client => {
    if (linha.transaction_id && linha.account_id) {
      await client.query('update accounts set balance_cents=balance_cents-$1 where id=$2 and family_id=$3',
        [efeito(linha), linha.account_id, req.auth.familyId]);
      await client.query('delete from transactions where id=$1 and family_id=$2', [linha.transaction_id, req.auth.familyId]);
    }
    await client.query('delete from scheduled_bill_payments where id=$1', [linha.id]);
    await client.query('update scheduled_bills set is_active=true, updated_at=now() where id=$1 and family_id=$2', [req.params.id, req.auth.familyId]);
  });
  res.json({ desfeito: 1 });
});

/* O mês inteiro em uma resposta: lançamentos, previsões, faturas e prazos de metas. */
app.get('/calendar', requireAuth, async (req, res) => {
  const periodo = mesPedido(req);
  if (!periodo) return res.status(400).json({ error: 'Mês inválido' });
  const { ano, mes } = periodo;
  const primeiro = montarData(ano, mes, 1);
  const ultimo = montarData(ano, mes, 31);
  const podeVerTudo = req.auth.role === 'admin';

  const [lancamentos, regras, baixas, cartoes, metas] = await Promise.all([
    query(`select t.id, to_char(t.occurred_on,'YYYY-MM-DD') occurred_on, t.type, t.description, t.amount_cents,
        t.category, t.supplier, a.name conta_nome
      from transactions t join accounts a on a.id=t.account_id
      where t.family_id=$1 and t.occurred_on between $2 and $3 and (a.owner_user_id=$4 or ($5::boolean=true and a.is_private=false))
      order by t.occurred_on, t.created_at`, [req.auth.familyId, primeiro, ultimo, req.auth.sub, podeVerTudo]),
    query(`select b.*, to_char(b.first_due_on,'YYYY-MM-DD') first_due_on, to_char(b.ends_on,'YYYY-MM-DD') ends_on, a.name conta_nome
      from scheduled_bills b left join accounts a on a.id=b.account_id
      where b.family_id=$1 and b.is_active=true`, [req.auth.familyId]),
    query(`select bill_id, to_char(due_on,'YYYY-MM-DD') due_on, transaction_id, amount_cents
      from scheduled_bill_payments where family_id=$1 and due_on between $2 and $3`, [req.auth.familyId, primeiro, ultimo]),
    query(`select c.id, c.name, c.last_four, c.due_day,
        coalesce((select sum(ceil(p.amount_cents::numeric/p.installments)) from card_purchases p where p.card_id=c.id),0) invoice_cents
      from credit_cards c where c.family_id=$1 and ($2::boolean=true or c.owner_user_id=$3)`,
      [req.auth.familyId, podeVerTudo, req.auth.sub]),
    query(`select id, title, emoji, to_char(deadline,'YYYY-MM-DD') deadline, target_cents, current_cents
      from goals where family_id=$1 and status='active' and deadline between $2 and $3`, [req.auth.familyId, primeiro, ultimo])
  ]);

  const pagoPor = new Map(baixas.rows.map(linha => [`${linha.bill_id}|${linha.due_on}`, linha]));
  const previstas = [];
  for (const regra of regras.rows) {
    for (const vencimento of vencimentosDoMes(regra, ano, mes)) {
      const baixa = pagoPor.get(`${regra.id}|${vencimento}`);
      previstas.push({
        id: regra.id, due_on: vencimento, kind: regra.kind, description: regra.description,
        amount_cents: baixa ? Number(baixa.amount_cents) : Number(regra.amount_cents),
        category: regra.category, supplier: regra.supplier,
        account_id: regra.account_id, conta_nome: regra.conta_nome,
        recurrence: regra.recurrence,
        pago: Boolean(baixa), transaction_id: baixa ? baixa.transaction_id : null
      });
    }
  }
  previstas.sort((a, b) => (a.due_on < b.due_on ? -1 : a.due_on > b.due_on ? 1 : a.description.localeCompare(b.description, 'pt-BR')));

  const faturas = cartoes.rows
    .filter(cartao => Number(cartao.invoice_cents) > 0)
    .map(cartao => ({ ...cartao, due_on: montarData(ano, mes, cartao.due_day) }));

  const somar = (lista, teste) => lista.filter(teste).reduce((soma, item) => soma + Number(item.amount_cents), 0);
  res.json({
    year: ano, month: mes,
    lancamentos: lancamentos.rows,
    previstas, faturas, metas: metas.rows,
    resumo: {
      entradas_cents: somar(lancamentos.rows, l => l.type === 'income'),
      saidas_cents: somar(lancamentos.rows, l => l.type === 'expense'),
      a_pagar_cents: somar(previstas, p => p.kind === 'payable' && !p.pago),
      a_receber_cents: somar(previstas, p => p.kind === 'receivable' && !p.pago),
      pago_cents: somar(previstas, p => p.kind === 'payable' && p.pago),
      faturas_cents: faturas.reduce((soma, f) => soma + Number(f.invoice_cents), 0)
    }
  });
});


/* ---------------- painel da Central, tudo calculado dos lançamentos ---------------- */
/* Uma resposta só, para a tela não ficar somando nada por conta própria e não
   existir número inventado: cada valor aqui sai de transactions, da agenda,
   das metas, do orçamento e da reserva da própria família. */

app.get('/dashboard', requireAuth, async (req, res) => {
  const periodo = mesPedido(req);
  if (!periodo) return res.status(400).json({ error: 'Mês inválido' });
  const { ano, mes } = periodo;
  const familia = req.auth.familyId, quem = req.auth.sub, ehAdmin = req.auth.role === 'admin';
  const primeiro = montarData(ano, mes, 1);
  const ultimo = montarData(ano, mes, 31);
  const anteriorMes = mes === 1 ? 12 : mes - 1;
  const anteriorAno = mes === 1 ? ano - 1 : ano;
  const hoje = new Date().toISOString().slice(0, 10);
  /* onze meses para trás mais o mês pedido = série de doze */
  const inicioSerie = montarData(mes === 12 ? ano : ano - 1, mes === 12 ? 1 : mes + 1, 1);
  const visivel = '(a.owner_user_id=$2 or ($3::boolean=true and a.is_private=false))';

  const [contas, doMes, doMesAnterior, serieMeses, serieAnos, porCategoria, porFornecedor,
    regras, baixas, orcamento, metas, reservas, cartoes] = await Promise.all([
    query(`select a.id, a.name, a.type, a.balance_cents, b.name banco
      from accounts a left join banks b on b.id=a.bank_id
      where a.family_id=$1 and ${visivel} order by a.name`, [familia, quem, ehAdmin]),
    query(`select t.type, sum(t.amount_cents)::bigint total, count(*)::int quantos
      from transactions t join accounts a on a.id=t.account_id
      where t.family_id=$1 and ${visivel} and t.occurred_on between $4 and $5 group by t.type`,
      [familia, quem, ehAdmin, primeiro, ultimo]),
    query(`select t.type, sum(t.amount_cents)::bigint total
      from transactions t join accounts a on a.id=t.account_id
      where t.family_id=$1 and ${visivel} and t.occurred_on between $4 and $5 group by t.type`,
      [familia, quem, ehAdmin, montarData(anteriorAno, anteriorMes, 1), montarData(anteriorAno, anteriorMes, 31)]),
    query(`select to_char(t.occurred_on,'YYYY-MM') ym,
        coalesce(sum(case when t.type='income' then t.amount_cents end),0)::bigint receitas_cents,
        coalesce(sum(case when t.type='expense' then t.amount_cents end),0)::bigint despesas_cents
      from transactions t join accounts a on a.id=t.account_id
      where t.family_id=$1 and ${visivel} and t.occurred_on between $4 and $5
      group by 1 order by 1`, [familia, quem, ehAdmin, inicioSerie, ultimo]),
    query(`select extract(year from t.occurred_on)::int ano,
        coalesce(sum(case when t.type='income' then t.amount_cents end),0)::bigint receitas_cents,
        coalesce(sum(case when t.type='expense' then t.amount_cents end),0)::bigint despesas_cents
      from transactions t join accounts a on a.id=t.account_id
      where t.family_id=$1 and ${visivel} group by 1 order by 1 desc limit 5`, [familia, quem, ehAdmin]),
    query(`select coalesce(t.category,'(sem categoria)') category, t.type,
        sum(t.amount_cents)::bigint total_cents, count(*)::int quantos
      from transactions t join accounts a on a.id=t.account_id
      where t.family_id=$1 and ${visivel} and t.occurred_on between $4 and $5
      group by 1,2 order by 3 desc`, [familia, quem, ehAdmin, primeiro, ultimo]),
    query(`select t.supplier, sum(t.amount_cents)::bigint total_cents, count(*)::int quantos
      from transactions t join accounts a on a.id=t.account_id
      where t.family_id=$1 and ${visivel} and t.type='expense' and t.supplier is not null
        and t.occurred_on between $4 and $5
      group by 1 order by 2 desc limit 12`, [familia, quem, ehAdmin, primeiro, ultimo]),
    query(`select * , to_char(first_due_on,'YYYY-MM-DD') first_due_on, to_char(ends_on,'YYYY-MM-DD') ends_on
      from scheduled_bills where family_id=$1 and is_active=true`, [familia]),
    query(`select bill_id, to_char(due_on,'YYYY-MM-DD') due_on from scheduled_bill_payments
      where family_id=$1 and due_on between $2 and $3`, [familia, primeiro, ultimo]),
    query(`select b.id, b.category, b.limit_cents,
        coalesce((select sum(t.amount_cents) from transactions t join accounts a on a.id=t.account_id
          where t.family_id=b.family_id and t.type='expense' and t.category=b.category
            and extract(month from t.occurred_on)=b.period_month and extract(year from t.occurred_on)=b.period_year
            and (a.owner_user_id=$2 or ($3::boolean=true and a.is_private=false))),0)::bigint realizado_cents
      from budgets b where b.family_id=$1 and b.is_active=true and b.period_month=$4 and b.period_year=$5
      order by b.category`, [familia, quem, ehAdmin, mes, ano]),
    query(`select id, title, emoji, target_cents, current_cents, status, to_char(deadline,'YYYY-MM-DD') deadline
      from goals where family_id=$1 order by status, deadline nulls last`, [familia]),
    query('select id, name, target_cents, current_cents, monthly_target_cents from reserves where family_id=$1 and is_active=true', [familia]),
    query(`select c.id, c.name, c.last_four, c.limit_cents, c.due_day,
        coalesce((select sum(ceil(p.amount_cents::numeric/p.installments)) from card_purchases p where p.card_id=c.id),0)::bigint invoice_cents
      from credit_cards c where c.family_id=$1 and ($2::boolean=true or c.owner_user_id=$3) order by c.name`,
      [familia, ehAdmin, quem])
  ]);

  const somaDe = (linhas, tipo) => Number(linhas.find(l => l.type === tipo)?.total || 0);
  const receitas = somaDe(doMes.rows, 'income'), despesas = somaDe(doMes.rows, 'expense');
  const receitasAntes = somaDe(doMesAnterior.rows, 'income'), despesasAntes = somaDe(doMesAnterior.rows, 'expense');

  /* a série sai do banco só com os meses que têm movimento — completo os vazios */
  const porMes = new Map(serieMeses.rows.map(l => [l.ym, l]));
  const serie = [];
  for (let i = 11; i >= 0; i -= 1) {
    const data = new Date(Date.UTC(ano, mes - 1 - i, 1));
    const ym = `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
    const linha = porMes.get(ym);
    serie.push({
      ym, mes: data.getUTCMonth() + 1, ano: data.getUTCFullYear(),
      receitas_cents: Number(linha?.receitas_cents || 0),
      despesas_cents: Number(linha?.despesas_cents || 0)
    });
  }

  /* vencimentos do mês, expandindo a recorrência da agenda */
  const pagos = new Set(baixas.rows.map(l => `${l.bill_id}|${l.due_on}`));
  const previstas = [];
  for (const regra of regras.rows) {
    for (const vencimento of vencimentosDoMes(regra, ano, mes)) {
      previstas.push({
        id: regra.id, due_on: vencimento, kind: regra.kind, description: regra.description,
        amount_cents: Number(regra.amount_cents), category: regra.category,
        pago: pagos.has(`${regra.id}|${vencimento}`)
      });
    }
  }
  const aPagar = previstas.filter(p => p.kind === 'payable' && !p.pago);
  const aReceber = previstas.filter(p => p.kind === 'receivable' && !p.pago);
  const atrasadas = previstas.filter(p => !p.pago && p.due_on < hoje);
  const proximas = previstas.filter(p => !p.pago && p.due_on >= hoje && p.due_on <= new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));

  const soma = (lista, campo = 'amount_cents') => lista.reduce((total, item) => total + Number(item[campo]), 0);
  const saldoTotal = contas.rows.reduce((total, conta) => total + Number(conta.balance_cents), 0);
  const metasAtivas = metas.rows.filter(m => m.status === 'active');
  const reserva = reservas.rows[0] || null;

  /* alertas de verdade: cada um aponta para um número que existe */
  const alertas = [];
  if (atrasadas.length) {
    alertas.push({ nivel: 'ruim', titulo: atrasadas.length === 1 ? '1 conta venceu e não foi baixada' : `${atrasadas.length} contas venceram e não foram baixadas`,
      detalhe: atrasadas.slice(0, 3).map(p => `${p.description} (${p.due_on.slice(8, 10)}/${p.due_on.slice(5, 7)})`).join(' · '), onde: 'calendario' });
  }
  for (const conta of contas.rows.filter(c => Number(c.balance_cents) < 0)) {
    alertas.push({ nivel: 'ruim', titulo: `${conta.name} está negativa`, detalhe: `Saldo de ${emReais(conta.balance_cents)}`, onde: 'lancamentos' });
  }
  for (const limite of orcamento.rows) {
    const uso = Number(limite.limit_cents) ? Math.round((Number(limite.realizado_cents) / Number(limite.limit_cents)) * 100) : 0;
    if (uso >= 100) alertas.push({ nivel: 'ruim', titulo: `${limite.category} passou do limite do mês`, detalhe: `${uso}% do planejado já foi gasto`, onde: 'metas' });
    else if (uso >= 85) alertas.push({ nivel: 'atencao', titulo: `${limite.category} está perto do limite`, detalhe: `${uso}% do planejado`, onde: 'metas' });
  }
  if (proximas.length) {
    alertas.push({ nivel: 'atencao', titulo: proximas.length === 1 ? '1 conta vence nos próximos dias' : `${proximas.length} contas vencem nos próximos dias`,
      detalhe: proximas.slice(0, 3).map(p => `${p.description} (${p.due_on.slice(8, 10)}/${p.due_on.slice(5, 7)})`).join(' · '), onde: 'calendario' });
  }
  for (const cartao of cartoes.rows.filter(c => Number(c.invoice_cents) > Number(c.limit_cents) * 0.8)) {
    alertas.push({ nivel: 'atencao', titulo: `Fatura do ${cartao.name} alta`, detalhe: `${Math.round((Number(cartao.invoice_cents) / Number(cartao.limit_cents)) * 100)}% do limite comprometido`, onde: 'cartoes' });
  }
  for (const meta of metasAtivas.filter(m => m.deadline && m.deadline >= hoje && m.deadline <= new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10))) {
    const uso = Math.round((Number(meta.current_cents) / Number(meta.target_cents)) * 100);
    if (uso < 80) alertas.push({ nivel: 'atencao', titulo: `A meta ${meta.title} vence em breve`, detalhe: `${uso}% juntado até agora`, onde: 'metas' });
  }
  if (despesas > receitas && receitas > 0) {
    alertas.push({ nivel: 'atencao', titulo: 'As saídas passaram as entradas neste mês', detalhe: `Diferença de ${emReais(despesas - receitas)}`, onde: 'lancamentos' });
  }
  if (!reserva) alertas.push({ nivel: 'info', titulo: 'A família ainda não tem reserva de emergência', detalhe: 'A recomendação comum é de três a seis meses de despesa', onde: 'metas' });
  if (!alertas.length) alertas.push({ nivel: 'bom', titulo: 'Nada pedindo atenção agora', detalhe: 'Contas em dia, orçamento respeitado e saldos positivos' });

  res.json({
    hoje, year: ano, month: mes,
    contas: contas.rows, saldo_total_cents: saldoTotal,
    mes: { receitas_cents: receitas, despesas_cents: despesas, resultado_cents: receitas - despesas, quantos: doMes.rows.reduce((t, l) => t + l.quantos, 0) },
    mes_anterior: { receitas_cents: receitasAntes, despesas_cents: despesasAntes, resultado_cents: receitasAntes - despesasAntes },
    serie_meses: serie,
    serie_anos: serieAnos.rows.map(l => ({ ano: l.ano, receitas_cents: Number(l.receitas_cents), despesas_cents: Number(l.despesas_cents) })).reverse(),
    por_categoria: porCategoria.rows.map(l => ({ ...l, total_cents: Number(l.total_cents) })),
    por_fornecedor: porFornecedor.rows.map(l => ({ ...l, total_cents: Number(l.total_cents) })),
    agenda: {
      a_pagar_cents: soma(aPagar), a_receber_cents: soma(aReceber),
      pago_cents: soma(previstas.filter(p => p.kind === 'payable' && p.pago)),
      atrasadas: atrasadas.slice(0, 8), proximas: proximas.slice(0, 8),
      quantas_atrasadas: atrasadas.length
    },
    orcamento: orcamento.rows.map(l => ({ ...l, limit_cents: Number(l.limit_cents), realizado_cents: Number(l.realizado_cents) })),
    metas: {
      quantas: metas.rows.length, ativas: metasAtivas.length,
      concluidas: metas.rows.filter(m => m.status === 'completed').length,
      guardado_cents: metas.rows.reduce((t, m) => t + Number(m.current_cents), 0),
      objetivo_cents: metas.rows.reduce((t, m) => t + Number(m.target_cents), 0),
      proximas: metasAtivas.slice(0, 4)
    },
    reserva: reserva ? { ...reserva, current_cents: Number(reserva.current_cents), target_cents: Number(reserva.target_cents) } : null,
    cartoes: cartoes.rows.map(c => ({ ...c, invoice_cents: Number(c.invoice_cents), limit_cents: Number(c.limit_cents) })),
    alertas
  });
});


app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
app.use((error, _req, res, _next) => {
  const errorId = crypto.randomUUID();
  console.error(`[${errorId}] Erro interno da API: ${error?.message || 'erro desconhecido'}`);
  res.status(500).json({ error: 'Erro interno da API', errorId });
});
try {
  await migrate();
  app.listen(port, () => console.log(`gfp-familiar-api:${port}`));
} catch (error) {
  console.error('Falha ao preparar o banco de dados', error.message);
  process.exit(1);
}

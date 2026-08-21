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
  isPrivate: z.boolean().default(false)
});

app.get('/accounts', requireAuth, async (req, res) => {
  const familyScope = req.auth.role === 'admin' && req.query.scope === 'family';
  const result = await query(`select id,name,type,balance_cents,is_private,owner_user_id
    from accounts where family_id=$1 and (owner_user_id=$2 or ($3::boolean=true and is_private=false)) order by name`,
    [req.auth.familyId, req.auth.sub, familyScope]);
  res.json(result.rows);
});

app.post('/accounts', requireAuth, allowRoles('admin','adult'), async (req, res) => {
  const parsed = accountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados da conta inválidos' });
  const id = crypto.randomUUID();
  const { name, type, balanceCents, isPrivate } = parsed.data;
  await query(`insert into accounts (id,family_id,owner_user_id,name,type,balance_cents,is_private)
    values ($1,$2,$3,$4,$5,$6,$7)`, [id, req.auth.familyId, req.auth.sub, name, type, balanceCents, isPrivate]);
  res.status(201).json({ id, name, type, balance_cents: balanceCents, is_private: isPrivate });
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
  if (!parsed.success) return res.status(400).json({ error: 'Dados da conferência inválidos' });
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
  if (!parsed.success) return res.status(400).json({ error: 'Dados da importação inválidos' });
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

const cardSchema=z.object({name:z.string().trim().min(2).max(60),brand:z.string().trim().min(2).max(30),lastFour:z.string().regex(/^\d{4}$/),limitCents:z.number().int().positive(),closingDay:z.number().int().min(1).max(31),dueDay:z.number().int().min(1).max(31)});
app.get('/cards',requireAuth,async(req,res)=>{const familyScope=req.auth.role==='admin'&&req.query.scope==='family';const result=await query(`select c.*,u.name owner_name,coalesce((select sum(ceil(p.amount_cents::numeric/p.installments)) from card_purchases p where p.card_id=c.id),0) invoice_cents from credit_cards c join users u on u.id=c.owner_user_id where c.family_id=$1 and ($3::boolean=true or c.owner_user_id=$2) order by c.name`,[req.auth.familyId,req.auth.sub,familyScope]);res.json(result.rows)});
app.post('/cards',requireAuth,allowRoles('admin','adult'),async(req,res)=>{const parsed=cardSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Dados do cartão inválidos'});const d=parsed.data,id=crypto.randomUUID();await query(`insert into credit_cards(id,family_id,owner_user_id,name,brand,last_four,limit_cents,closing_day,due_day) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,req.auth.familyId,req.auth.sub,d.name,d.brand,d.lastFour,d.limitCents,d.closingDay,d.dueDay]);res.status(201).json({id})});
const purchaseSchema=z.object({cardId:z.uuid(),description:z.string().trim().min(2).max(120),category:z.string().trim().min(2).max(40),amountCents:z.number().int().positive(),installments:z.number().int().min(1).max(48),purchasedOn:z.iso.date()});
app.get('/card-purchases',requireAuth,async(req,res)=>{const familyScope=req.auth.role==='admin'&&req.query.scope==='family';const result=await query('select p.id,p.card_id,p.description,p.category,p.amount_cents,p.installments,p.purchased_on,ceil(p.amount_cents::numeric/p.installments) installment_cents,c.name card_name,c.last_four,u.name owner_name from card_purchases p join credit_cards c on c.id=p.card_id join users u on u.id=c.owner_user_id where p.family_id=$1 and ($3::boolean=true or c.owner_user_id=$2) order by p.purchased_on desc,p.created_at desc',[req.auth.familyId,req.auth.sub,familyScope]);res.json(result.rows)});
app.post('/card-purchases',requireAuth,allowRoles('admin','adult','dependent'),async(req,res)=>{const parsed=purchaseSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Compra inválida'});const d=parsed.data,card=await query('select id,owner_user_id from credit_cards where id=$1 and family_id=$2',[d.cardId,req.auth.familyId]);if(!card.rows[0]||card.rows[0].owner_user_id!==req.auth.sub)return res.status(404).json({error:'Cartão não encontrado'});const id=crypto.randomUUID();await query(`insert into card_purchases(id,family_id,card_id,created_by,description,category,amount_cents,installments,purchased_on) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,req.auth.familyId,d.cardId,req.auth.sub,d.description,d.category,d.amountCents,d.installments,d.purchasedOn]);res.status(201).json({id})});


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

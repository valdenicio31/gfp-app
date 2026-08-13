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

const app = express();
const port = Number(process.env.PORT || 10000);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false }));
app.use(express.json({ limit: '200kb' }));
app.use('/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }));

app.get('/health', async (_req, res) => {
  try {
    await query('select 1');
    res.json({ status: 'ok', service: 'gfp-familiar-api' });
  } catch {
    res.status(503).json({ status: 'degraded', service: 'gfp-familiar-api' });
  }
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
  const result = await query(`select u.id,u.name,u.email,m.role,m.family_id,f.name family_name from users u join memberships m on m.user_id=u.id join families f on f.id=m.family_id where u.id=$1 and m.family_id=$2`, [req.auth.sub, req.auth.familyId]);
  res.json(result.rows[0] || null);
});

app.get('/family/members', requireAuth, allowRoles('admin','adult','viewer'), async (req, res) => {
  const result = await query(`select u.id,u.name,u.email,m.role,m.status,p.id profile_id,coalesce(p.name,m.role) profile_name,coalesce(p.emoji,'👤') emoji from memberships m join users u on u.id=m.user_id left join family_profiles p on p.id=m.profile_id where m.family_id=$1 order by u.name`, [req.auth.familyId]);
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

const inviteSchema = z.object({ email: z.email().transform(value => value.toLowerCase()), profileId: z.uuid() });
app.post('/family/invitations', requireAuth, allowRoles('admin'), async (req, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Convite inválido' });
  const profile=await query(`select id,base_role from family_profiles where id=$1 and family_id=$2 and base_role<>'admin'`,[parsed.data.profileId,req.auth.familyId]);
  if(!profile.rows[0]) return res.status(404).json({error:'Perfil não encontrado ou não permitido'});
  const count = await query(`select (select count(*) from memberships where family_id=$1 and status in ('active','invited')) +
    (select count(*) from invitations where family_id=$1 and accepted_at is null and expires_at>now()) total`, [req.auth.familyId]);
  const family = await query('select member_limit from families where id=$1', [req.auth.familyId]);
  if (Number(count.rows[0].total) >= family.rows[0].member_limit) return res.status(409).json({ error: 'Limite da licença familiar atingido' });
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const id = crypto.randomUUID();
  await query(`insert into invitations (id,family_id,email,role,token_hash,expires_at,created_by,profile_id)
    values ($1,$2,$3,$4,$5,now()+interval '7 days',$6,$7)`, [id,req.auth.familyId,parsed.data.email,profile.rows[0].base_role,tokenHash,req.auth.sub,profile.rows[0].id]);
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
    await client.query('insert into users (id,name,email,password_hash) values ($1,$2,$3,$4)', [userId,parsed.data.name,item.email,passwordHash]);
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
  const result = await query(`select id,name,type,balance_cents,is_private,owner_user_id
    from accounts where family_id=$1 and (is_private=false or owner_user_id=$2) order by name`,
    [req.auth.familyId, req.auth.sub]);
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

const transactionSchema = z.object({
  accountId: z.uuid(),
  type: z.enum(['income','expense']),
  description: z.string().trim().min(2).max(140),
  amountCents: z.number().int().positive().max(999999999999),
  occurredOn: z.iso.date()
});

app.get('/transactions', requireAuth, async (req, res) => {
  const result = await query(`select t.id,t.type,t.description,t.amount_cents,t.occurred_on,t.account_id,a.name account_name
    from transactions t join accounts a on a.id=t.account_id
    where t.family_id=$1 and (a.is_private=false or a.owner_user_id=$2)
    order by t.occurred_on desc,t.created_at desc limit 200`, [req.auth.familyId, req.auth.sub]);
  res.json(result.rows);
});

app.post('/transactions', requireAuth, allowRoles('admin','adult','dependent'), async (req, res) => {
  const parsed = transactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados do lançamento inválidos' });
  const { accountId, type, description, amountCents, occurredOn } = parsed.data;
  const account = await query(`select id,is_private,owner_user_id from accounts where id=$1 and family_id=$2`, [accountId, req.auth.familyId]);
  if (!account.rows[0] || (account.rows[0].is_private && account.rows[0].owner_user_id !== req.auth.sub)) return res.status(404).json({ error: 'Conta não encontrada' });
  const id = crypto.randomUUID();
  await transaction(async client => {
    await client.query(`insert into transactions (id,family_id,account_id,created_by,type,description,amount_cents,occurred_on)
      values ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, req.auth.familyId, accountId, req.auth.sub, type, description, amountCents, occurredOn]);
    await client.query(`update accounts set balance_cents=balance_cents+$1 where id=$2 and family_id=$3`,
      [type === 'income' ? amountCents : -amountCents, accountId, req.auth.familyId]);
  });
  res.status(201).json({ id });
});

app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
try {
  await migrate();
  app.listen(port, () => console.log(`gfp-familiar-api:${port}`));
} catch (error) {
  console.error('Falha ao preparar o banco de dados', error.message);
  process.exit(1);
}

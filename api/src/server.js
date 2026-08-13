import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, transaction } from './db.js';
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
      await client.query("insert into memberships (family_id,user_id,role,status) values ($1,$2,'admin','active')", [familyId, userId]);
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
  const result = await query(`select u.id,u.name,u.email,m.role,m.status from memberships m join users u on u.id=m.user_id where m.family_id=$1 order by u.name`, [req.auth.familyId]);
  res.json(result.rows);
});

app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
app.listen(port, () => console.log(`gfp-familiar-api:${port}`));

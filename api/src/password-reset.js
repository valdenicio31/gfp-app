import crypto from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, transaction } from './db.js';

const router = express.Router();
const genericRequestMessage = 'Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.';
const invalidTokenMessage = 'Link de recuperação inválido ou expirado.';

const requestSchema = z.object({
  email: z.email().transform(value => value.trim().toLowerCase())
});

const resetSchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().min(10).max(128)
});

const requestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: genericRequestMessage }
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }
});

export function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function buildResetUrl(token) {
  const appUrl = process.env.APP_URL || 'https://gfp-app.onrender.com/v2.html';
  const url = new URL(appUrl);
  url.searchParams.set('resetToken', token);
  return url.toString();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

async function sendResetEmail({ email, name, resetUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) return false;

  const safeName = escapeHtml(name || 'usuário');
  const safeUrl = escapeHtml(resetUrl);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Recuperação de senha — GFP Familiar',
      html: `<p>Olá, ${safeName}.</p><p>Recebemos uma solicitação para redefinir sua senha no GFP Familiar.</p><p><a href="${safeUrl}">Criar uma nova senha</a></p><p>Este link expira em 20 minutos e só pode ser usado uma vez. Se você não fez esta solicitação, ignore esta mensagem.</p>`,
      text: `Olá, ${name || 'usuário'}. Redefina sua senha do GFP Familiar em: ${resetUrl}\n\nO link expira em 20 minutos e só pode ser usado uma vez.`
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Falha no provedor de e-mail (${response.status}): ${detail.slice(0, 160)}`);
  }
  return true;
}

router.post('/request', requestLimiter, async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(202).json({ message: genericRequestMessage });

  let resetId;
  try {
    const result = await query('select id,name,email from users where email=$1 limit 1', [parsed.data.email]);
    const user = result.rows[0];
    if (!user) return res.status(202).json({ message: genericRequestMessage });

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashResetToken(token);
    resetId = crypto.randomUUID();

    await transaction(async client => {
      await client.query('update password_reset_tokens set used_at=now() where user_id=$1 and used_at is null', [user.id]);
      await client.query(`insert into password_reset_tokens (id,user_id,token_hash,expires_at)
        values ($1,$2,$3,now()+interval '20 minutes')`, [resetId, user.id, tokenHash]);
    });

    const resetUrl = buildResetUrl(token);
    let delivered = false;
    try {
      delivered = await sendResetEmail({ email: user.email, name: user.name, resetUrl });
    } catch (error) {
      console.error('Falha ao enviar recuperação de senha', error.message);
    }

    const previewEnabled = process.env.NODE_ENV !== 'production' && process.env.PASSWORD_RESET_PREVIEW === 'true';
    if (!delivered && !previewEnabled) {
      await query('update password_reset_tokens set used_at=now() where id=$1', [resetId]);
    }

    res.status(202).json({
      message: genericRequestMessage,
      ...(previewEnabled ? { previewUrl: resetUrl } : {})
    });
  } catch (error) {
    console.error('Falha ao preparar recuperação de senha', error.message);
    if (resetId) await query('update password_reset_tokens set used_at=now() where id=$1', [resetId]).catch(() => {});
    res.status(202).json({ message: genericRequestMessage });
  }
});

router.post('/confirm', resetLimiter, async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: invalidTokenMessage });

  const tokenHash = hashResetToken(parsed.data.token);
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  try {
    await transaction(async client => {
      const result = await client.query(`select id,user_id from password_reset_tokens
        where token_hash=$1 and used_at is null and expires_at>now() for update`, [tokenHash]);
      const reset = result.rows[0];
      if (!reset) {
        const error = new Error(invalidTokenMessage);
        error.code = 'INVALID_RESET_TOKEN';
        throw error;
      }

      await client.query('update users set password_hash=$1 where id=$2', [passwordHash, reset.user_id]);
      await client.query('update password_reset_tokens set used_at=now() where user_id=$1 and used_at is null', [reset.user_id]);
    });
    res.json({ message: 'Senha atualizada. Você já pode entrar com a nova senha.' });
  } catch (error) {
    if (error.code === 'INVALID_RESET_TOKEN') return res.status(400).json({ error: invalidTokenMessage });
    console.error('Falha ao redefinir senha', error.message);
    res.status(500).json({ error: 'Não foi possível atualizar a senha agora.' });
  }
});

export default router;

import jwt from 'jsonwebtoken';

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, familyId: user.family_id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h', issuer: 'gfp-familiar-api' }
  );
}

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Autenticação necessária' });
  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'gfp-familiar-api' });
    next();
  } catch {
    res.status(401).json({ error: 'Sessão inválida ou expirada' });
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => roles.includes(req.auth.role)
    ? next()
    : res.status(403).json({ error: 'Perfil sem permissão para esta ação' });
}
